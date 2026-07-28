use serde::{Deserialize, Serialize};

#[cfg(test)]
const REF_PREFIX: &str = "zeroxb:model-credential:v1";
#[cfg(test)]
use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
#[cfg(test)]
const ENCODE_SET: &AsciiSet = &CONTROLS.add(b':').add(b'/').add(b'\\').add(b'%');

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CredentialKind {
    ProviderApiKey,
    CustomHeader { header_name: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CredentialReference {
    pub provider_key: String,
    pub kind: CredentialKind,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialSetRequest {
    pub reference: String,
    pub secret: String,
    pub base_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialReferenceRequest {
    pub reference: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStatus {
    pub reference: String,
    pub configured: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialEnvelope {
    version: u8,
    provider_key: String,
    header_name: Option<String>,
    base_url: String,
    secret: String,
}

#[cfg(test)]
pub fn provider_credential_ref(provider_key: &str) -> String {
    format!("{REF_PREFIX}:provider:{}", encode_ref_part(provider_key))
}

#[cfg(test)]
pub fn custom_header_credential_ref(provider_key: &str, header_name: &str) -> String {
    format!(
        "{REF_PREFIX}:provider:{}:header:{}",
        encode_ref_part(provider_key),
        encode_ref_part(header_name)
    )
}

pub fn is_secret_header_name(header_name: &str, explicitly_secret: bool) -> bool {
    if explicitly_secret {
        return true;
    }

    let normalized = header_name.trim().to_ascii_lowercase();
    normalized == "authorization"
        || normalized == "proxy-authorization"
        || normalized == "x-api-key"
        || normalized == "api-key"
        || normalized.contains("token")
        || normalized.contains("secret")
        || normalized.contains("credential")
        || normalized.contains("password")
}

pub fn parse_credential_ref(reference: &str) -> Result<CredentialReference, String> {
    let parts = reference.split(':').collect::<Vec<_>>();
    if parts.len() != 5 && parts.len() != 7 {
        return Err(redacted_ref_error(
            reference,
            "Invalid credential reference shape.",
        ));
    }
    if parts[0] != "zeroxb"
        || parts[1] != "model-credential"
        || parts[2] != "v1"
        || parts[3] != "provider"
    {
        return Err(redacted_ref_error(
            reference,
            "Invalid credential reference prefix.",
        ));
    }

    let provider_key = percent_encoding::percent_decode_str(parts[4])
        .decode_utf8()
        .map_err(|_| redacted_ref_error(reference, "Invalid provider reference encoding."))?
        .to_string();

    if provider_key.trim().is_empty() {
        return Err(redacted_ref_error(reference, "Empty provider reference."));
    }

    if parts.len() == 5 {
        return Ok(CredentialReference {
            provider_key,
            kind: CredentialKind::ProviderApiKey,
        });
    }

    if parts[5] != "header" {
        return Err(redacted_ref_error(
            reference,
            "Invalid credential reference kind.",
        ));
    }

    let header_name = percent_encoding::percent_decode_str(parts[6])
        .decode_utf8()
        .map_err(|_| redacted_ref_error(reference, "Invalid header reference encoding."))?
        .to_string();
    if header_name.trim().is_empty() {
        return Err(redacted_ref_error(reference, "Empty header reference."));
    }

    Ok(CredentialReference {
        provider_key,
        kind: CredentialKind::CustomHeader { header_name },
    })
}

pub fn redacted_ref_error(reference: &str, message: &str) -> String {
    format!("{message} reference={reference}")
}

pub fn credential_target_name(reference: &str) -> Result<String, String> {
    parse_credential_ref(reference)?;
    Ok(format!("zeroxb/model-credential/{reference}"))
}

pub fn validate_credential_scope(
    parsed: &CredentialReference,
    envelope: &CredentialEnvelope,
    requested_base_url: &str,
    expected_header_name: Option<&str>,
) -> Result<(), String> {
    if parsed.provider_key != envelope.provider_key {
        return Err(format!(
            "Credential provider mismatch for reference provider={}.",
            parsed.provider_key
        ));
    }

    match (
        &parsed.kind,
        expected_header_name,
        envelope.header_name.as_deref(),
    ) {
        (CredentialKind::ProviderApiKey, None, None) => {}
        (
            CredentialKind::CustomHeader { header_name },
            Some(expected_header),
            Some(envelope_header),
        ) if header_name.eq_ignore_ascii_case(expected_header)
            && envelope_header.eq_ignore_ascii_case(expected_header) => {}
        (CredentialKind::CustomHeader { header_name }, _, _) => {
            return Err(format!(
                "Credential header mismatch for reference header={header_name}."
            ));
        }
        (CredentialKind::ProviderApiKey, Some(expected_header), _) => {
            return Err(format!(
                "Provider credential cannot be used for header `{expected_header}`."
            ));
        }
    }

    let stored_base = normalize_base_url(&envelope.base_url)?;
    let requested_base = normalize_base_url(requested_base_url)?;
    if stored_base != requested_base {
        return Err(format!(
            "Credential destination mismatch for reference provider={}.",
            parsed.provider_key
        ));
    }

    Ok(())
}

pub fn resolve_credential(
    reference: &str,
    requested_base_url: &str,
    expected_header_name: Option<&str>,
) -> Result<String, String> {
    let parsed = parse_credential_ref(reference)?;
    let target = credential_target_name(reference)?;
    let envelope_text = read_secret(&target).map_err(|error| {
        format!(
            "Credential is unavailable for reference={reference}: {}",
            redact_secret_diagnostics(&error)
        )
    })?;
    let envelope: CredentialEnvelope = serde_json::from_str(&envelope_text)
        .map_err(|_| format!("Credential envelope is invalid for reference={reference}."))?;
    validate_credential_scope(&parsed, &envelope, requested_base_url, expected_header_name)
        .map_err(|error| format!("{error} reference={reference}"))?;

    Ok(envelope.secret)
}

pub fn credential_exists(reference: &str) -> bool {
    credential_target_name(reference)
        .ok()
        .and_then(|target| read_secret(&target).ok())
        .is_some()
}

#[tauri::command]
pub fn credential_set(request: CredentialSetRequest) -> Result<CredentialStatus, String> {
    if request.secret.is_empty() {
        return Err(redacted_ref_error(
            &request.reference,
            "Credential secret cannot be empty.",
        ));
    }

    let parsed = parse_credential_ref(&request.reference)?;
    let base_url = normalize_base_url(&request.base_url)?;
    let envelope = CredentialEnvelope {
        version: 1,
        provider_key: parsed.provider_key,
        header_name: match parsed.kind {
            CredentialKind::ProviderApiKey => None,
            CredentialKind::CustomHeader { header_name } => Some(header_name),
        },
        base_url,
        secret: request.secret,
    };
    let envelope_text = serde_json::to_string(&envelope).map_err(|_| {
        redacted_ref_error(
            &request.reference,
            "Failed to serialize credential envelope.",
        )
    })?;
    let target = credential_target_name(&request.reference)?;
    write_secret(&target, &envelope_text).map_err(|error| {
        format!(
            "Failed to store credential for reference={}: {}",
            request.reference,
            redact_secret_diagnostics(&error)
        )
    })?;
    Ok(CredentialStatus {
        reference: request.reference,
        configured: true,
    })
}

#[tauri::command]
pub fn credential_get(request: CredentialReferenceRequest) -> Result<CredentialStatus, String> {
    parse_credential_ref(&request.reference)?;
    Ok(CredentialStatus {
        configured: credential_exists(&request.reference),
        reference: request.reference,
    })
}

#[tauri::command]
pub fn credential_delete(request: CredentialReferenceRequest) -> Result<CredentialStatus, String> {
    let target = credential_target_name(&request.reference)?;
    delete_secret(&target).map_err(|error| {
        format!(
            "Failed to delete credential for reference={}: {}",
            request.reference,
            redact_secret_diagnostics(&error)
        )
    })?;
    Ok(CredentialStatus {
        reference: request.reference,
        configured: false,
    })
}

#[cfg(test)]
fn encode_ref_part(value: &str) -> String {
    utf8_percent_encode(value, ENCODE_SET).to_string()
}

fn redact_secret_diagnostics(message: &str) -> String {
    let mut redacted = String::with_capacity(message.len());
    for token in message.split_whitespace() {
        if token.len() >= 20 || token.to_ascii_lowercase().starts_with("bearer") {
            if !redacted.is_empty() {
                redacted.push(' ');
            }
            redacted.push_str("[redacted]");
        } else {
            if !redacted.is_empty() {
                redacted.push(' ');
            }
            redacted.push_str(token);
        }
    }
    redacted
}

fn normalize_base_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        return Err("Credential base URL cannot be empty.".to_string());
    }
    let parsed = url::Url::parse(trimmed)
        .map_err(|error| format!("Invalid credential base URL: {error}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Credential base URL must use http or https.".to_string());
    }
    let mut normalized = parsed.to_string();
    while normalized.ends_with('/') {
        normalized.pop();
    }
    Ok(normalized)
}

#[cfg(target_os = "windows")]
fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn write_secret(target: &str, secret: &str) -> Result<(), String> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::FILETIME;
    use windows_sys::Win32::Security::Credentials::{
        CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    let mut target_name = to_wide(target);
    let mut user_name = to_wide("zeroxb");
    let mut secret_bytes = secret.as_bytes().to_vec();
    let mut credential = CREDENTIALW {
        Flags: 0,
        Type: CRED_TYPE_GENERIC,
        TargetName: target_name.as_mut_ptr(),
        Comment: null_mut(),
        LastWritten: FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        },
        CredentialBlobSize: secret_bytes
            .len()
            .try_into()
            .map_err(|_| "Credential secret is too large.".to_string())?,
        CredentialBlob: secret_bytes.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        AttributeCount: 0,
        Attributes: null_mut(),
        TargetAlias: null_mut(),
        UserName: user_name.as_mut_ptr(),
    };

    let written = unsafe { CredWriteW(&mut credential, 0) };
    if written == 0 {
        return Err(format!(
            "Windows Credential Manager write failed: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn read_secret(target: &str) -> Result<String, String> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Security::Credentials::{
        CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
    };

    let target_name = to_wide(target);
    let mut credential_ptr: *mut CREDENTIALW = null_mut();
    let read = unsafe {
        CredReadW(
            target_name.as_ptr(),
            CRED_TYPE_GENERIC,
            0,
            &mut credential_ptr,
        )
    };
    if read == 0 {
        return Err(format!(
            "Windows Credential Manager read failed: {}",
            std::io::Error::last_os_error()
        ));
    }
    if credential_ptr.is_null() {
        return Err("Windows Credential Manager returned no credential.".to_string());
    }

    let credential = unsafe { &*credential_ptr };
    let bytes = unsafe {
        std::slice::from_raw_parts(
            credential.CredentialBlob,
            credential.CredentialBlobSize as usize,
        )
    };
    let secret = String::from_utf8(bytes.to_vec())
        .map_err(|_| "Credential value is not valid UTF-8.".to_string());
    unsafe { CredFree(credential_ptr.cast()) };
    secret
}

#[cfg(target_os = "windows")]
fn delete_secret(target: &str) -> Result<(), String> {
    use windows_sys::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};

    let target_name = to_wide(target);
    let deleted = unsafe { CredDeleteW(target_name.as_ptr(), CRED_TYPE_GENERIC, 0) };
    if deleted == 0 {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(1168) {
            return Ok(());
        }
        return Err(format!("Windows Credential Manager delete failed: {error}"));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn write_secret(_target: &str, _secret: &str) -> Result<(), String> {
    Err("Windows Credential Manager is only available on Windows.".to_string())
}

#[cfg(not(target_os = "windows"))]
fn read_secret(_target: &str) -> Result<String, String> {
    Err("Windows Credential Manager is only available on Windows.".to_string())
}

#[cfg(not(target_os = "windows"))]
fn delete_secret(_target: &str) -> Result<(), String> {
    Err("Windows Credential Manager is only available on Windows.".to_string())
}

#[cfg(test)]
#[path = "credential_store_tests.rs"]
mod credential_store_tests;
