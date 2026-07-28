import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = path => readFileSync(join(root, path), 'utf8')

const sources = {
  config: read('src/app/core/setting/config.tsx'),
  tauriClient: read('src/lib/ai/tauri-client.ts'),
  credentials: read('src/lib/security/credentials.ts'),
  aiTransport: read('src-tauri/src/ai.rs'),
  settingsStore: read('src/stores/setting.ts'),
  aiSettingsPage: read('src/app/core/setting/ai/page.tsx'),
  audio: read('src/lib/audio.ts'),
}

test('JavaScript AI request payloads carry opaque references, never resolved model secrets', () => {
  assert.doesNotMatch(sources.tauriClient, /\bapiKey\??\s*:/)
  assert.doesNotMatch(sources.tauriClient, /\bAuthorization\b/)
  assert.doesNotMatch(sources.tauriClient, /\bBearer\b/)
  assert.match(sources.tauriClient, /\bcredentialRef\??\s*:/)
  assert.match(sources.tauriClient, /\bcustomHeaderRefs\??\s*:/)
  assert.match(sources.tauriClient, /resolveAiRequestConfig[\s\S]*credentialRef/)
  assert.match(sources.tauriClient, /invokeAiJson[\s\S]*ai_json_request/)
  assert.match(sources.tauriClient, /invokeAiBinary[\s\S]*ai_binary_request/)
  assert.match(sources.tauriClient, /invokeAiMultipart[\s\S]*ai_multipart_request/)
})

test('persisted AI config stores credential metadata instead of legacy apiKey fields', () => {
  assert.doesNotMatch(sources.config, /\bapiKey\??\s*:/)
  assert.match(sources.config, /\bcredentialRef\??\s*:/)
  assert.match(sources.config, /\bhasCredential\??\s*:/)
  assert.match(sources.config, /\bcustomHeaderRefs\??\s*:/)
  assert.match(sources.settingsStore, /migrateLegacyModelCredentials/)
  assert.match(sources.settingsStore, /migrateLegacyGlobalCredential/)
  assert.match(sources.credentials, /await store\.delete\('apiKey'\)/)
  assert.match(sources.credentials, /baseUrl/)
  assert.match(sources.credentials, /baseURL/)
})

test('settings UI is write-only for model secrets and supports secret custom headers', () => {
  assert.doesNotMatch(sources.aiSettingsPage, /type=\{apiKeyVisible \? 'text' : 'password'\}/)
  assert.doesNotMatch(sources.aiSettingsPage, /value=\{currentConfig\.apiKey \|\| ''\}/)
  assert.doesNotMatch(sources.aiSettingsPage, /EyeOff|<Eye\b|showApiKey|hideApiKey/)
  assert.match(sources.aiSettingsPage, /apiKeyDraft/)
  assert.match(sources.aiSettingsPage, /hasCredential/)
  assert.match(sources.aiSettingsPage, /isSecretHeaderName/)
  assert.match(sources.aiSettingsPage, /customHeaderRefs/)
})

test('legacy secret-looking plaintext headers stay write-only in settings rows', () => {
  assert.match(sources.aiSettingsPage, /new Set\(\[\s*\.\.\.Object\.keys\(config\.customHeaders \|\| \{\}\)/)
  assert.match(sources.aiSettingsPage, /\.\.\.Object\.keys\(config\.customHeaderRefs \|\| \{\}\)/)
  assert.match(sources.aiSettingsPage, /\.\.\.Object\.keys\(config\.customHeaderSecrets \|\| \{\}\)/)
  assert.match(sources.aiSettingsPage, /isSecretHeaderName\(key, explicitlySecret\)/)
  assert.match(sources.aiSettingsPage, /value: secret \? '' : String\(config\.customHeaders\?\.\[key\] \?\? ''\)/)
})

test('JavaScript request configs preserve public headers and refs but filter secret-looking plaintext headers', () => {
  assert.match(sources.tauriClient, /function filterNonSecretCustomHeaders/)
  assert.match(sources.tauriClient, /isSecretHeaderName\(headerName, config\.customHeaderSecrets\?\.\[headerName\] === true\)/)
  assert.match(sources.tauriClient, /customHeaders: filterNonSecretCustomHeaders\(aiConfig\)/)
  assert.match(sources.tauriClient, /customHeaderRefs: aiConfig\?\.customHeaderRefs/)
})

test('Rust transport is the only model-provider boundary that resolves secrets and builds bearer headers', () => {
  assert.match(sources.aiTransport, /resolve_credential/)
  assert.match(sources.aiTransport, /resolve_credential\(credential_ref, &config\.base_url, None\)/)
  assert.match(sources.aiTransport, /redirect\(Policy::none\(\)\)/)
  assert.match(sources.aiTransport, /resolve_credential\(reference, &config\.base_url, Some\(key\)\)/)
  assert.match(sources.aiTransport, /credential_ref/)
  assert.match(sources.aiTransport, /custom_header_refs/)
  assert.match(sources.aiTransport, /format!\("Bearer \{api_key\}"\)/)
  assert.match(sources.aiTransport, /is_secret_header_name/)
  assert.match(sources.audio, /hasCredential/)
  assert.doesNotMatch(sources.audio, /\.apiKey/)
})
