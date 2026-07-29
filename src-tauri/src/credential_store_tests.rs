use super::{
    custom_header_credential_ref, is_secret_header_name, parse_credential_ref,
    provider_credential_ref, redacted_ref_error, validate_credential_scope, CredentialEnvelope,
    CredentialKind,
};

#[cfg(target_os = "windows")]
use super::{
    credential_delete, credential_get, credential_set, resolve_credential,
    CredentialReferenceRequest, CredentialSetRequest,
};

#[test]
fn credential_refs_are_opaque_and_round_trip_without_secret_material() {
    let provider_ref = provider_credential_ref("provider:with/slashes");
    assert!(provider_ref.starts_with("zeroxb:model-credential:v1:provider:"));
    assert!(!provider_ref.contains("example-secret"));

    let parsed = parse_credential_ref(&provider_ref).expect("provider ref parses");
    assert_eq!(parsed.provider_key, "provider:with/slashes");
    assert_eq!(parsed.kind, CredentialKind::ProviderApiKey);
}

#[test]
fn custom_header_refs_keep_header_name_but_not_value() {
    let reference = custom_header_credential_ref("openai", "X-Api-Key");
    let parsed = parse_credential_ref(&reference).expect("header ref parses");

    assert_eq!(parsed.provider_key, "openai");
    assert_eq!(
        parsed.kind,
        CredentialKind::CustomHeader {
            header_name: "X-Api-Key".to_string()
        }
    );
    assert!(reference.contains("X-Api-Key"));
    assert!(!reference.contains("sk-test-secret"));
}

#[test]
fn secret_header_classification_is_case_insensitive_and_supports_explicit_marking() {
    for name in [
        "Authorization",
        "proxy-authorization",
        "X-API-KEY",
        "api-key",
        "X-Provider-Token",
        "client_secret",
        "credential-id",
        "account-password",
    ] {
        assert!(
            is_secret_header_name(name, false),
            "{name} should be secret"
        );
    }

    assert!(!is_secret_header_name("X-Trace-Id", false));
    assert!(is_secret_header_name("X-Trace-Id", true));
}

#[test]
fn invalid_reference_diagnostics_are_redacted_and_causal() {
    let error = parse_credential_ref("not-a-reference").expect_err("invalid ref rejected");
    assert!(error.contains("Invalid credential reference shape."));
    assert!(error.contains("reference=not-a-reference"));

    let redacted = redacted_ref_error("zeroxb:model-credential:v1:provider:openai", "missing");
    assert!(redacted.contains("reference=zeroxb:model-credential:v1:provider:openai"));
    assert!(!redacted.contains("sk-"));
}

#[test]
fn credential_scope_rejects_attacker_base_url_replay() {
    let reference = provider_credential_ref("openai");
    let parsed = parse_credential_ref(&reference).expect("provider ref parses");
    let envelope = CredentialEnvelope {
        version: 1,
        provider_key: "openai".to_string(),
        header_name: None,
        base_url: "https://api.openai.com/v1".to_string(),
        secret: "example-secret".to_string(),
    };

    assert!(
        validate_credential_scope(&parsed, &envelope, "https://api.openai.com/v1/", None,).is_ok()
    );
    let error = validate_credential_scope(&parsed, &envelope, "https://attacker.example/v1", None)
        .expect_err("attacker base url rejected");
    assert!(error.contains("Credential destination mismatch"));
    assert!(!error.contains("example-secret"));
}

#[test]
fn credential_scope_rejects_mismatched_provider_and_header_references() {
    let provider_reference = provider_credential_ref("openai");
    let parsed_provider = parse_credential_ref(&provider_reference).expect("provider ref parses");
    let wrong_provider_envelope = CredentialEnvelope {
        version: 1,
        provider_key: "gemini".to_string(),
        header_name: None,
        base_url: "https://api.openai.com/v1".to_string(),
        secret: "example-secret".to_string(),
    };

    assert!(validate_credential_scope(
        &parsed_provider,
        &wrong_provider_envelope,
        "https://api.openai.com/v1",
        None,
    )
    .expect_err("provider mismatch rejected")
    .contains("Credential provider mismatch"));

    let provider_with_header_envelope = CredentialEnvelope {
        version: 1,
        provider_key: "openai".to_string(),
        header_name: Some("Authorization".to_string()),
        base_url: "https://api.openai.com/v1".to_string(),
        secret: "example-secret".to_string(),
    };
    assert!(validate_credential_scope(
        &parsed_provider,
        &provider_with_header_envelope,
        "https://api.openai.com/v1",
        None,
    )
    .expect_err("provider envelope header metadata rejected")
    .contains("unexpected header metadata"));

    let header_reference = custom_header_credential_ref("openai", "X-Api-Key");
    let parsed_header = parse_credential_ref(&header_reference).expect("header ref parses");
    let header_envelope = CredentialEnvelope {
        version: 1,
        provider_key: "openai".to_string(),
        header_name: Some("X-Api-Key".to_string()),
        base_url: "https://api.openai.com/v1".to_string(),
        secret: "example-secret".to_string(),
    };

    assert!(validate_credential_scope(
        &parsed_header,
        &header_envelope,
        "https://api.openai.com/v1",
        Some("Authorization"),
    )
    .expect_err("header mismatch rejected")
    .contains("Credential header mismatch"));
}

#[cfg(target_os = "windows")]
#[test]
fn windows_credential_manager_set_get_resolve_delete_round_trip() {
    let reference = provider_credential_ref(&format!("test-{}", uuid::Uuid::new_v4()));
    let base_url = "https://credentials.test.invalid/v1";
    let secret = "task19-test-secret";

    credential_set(CredentialSetRequest {
        reference: reference.clone(),
        secret: secret.to_string(),
        base_url: base_url.to_string(),
    })
    .expect("test credential is written");

    let verification = (|| {
        assert!(
            credential_get(CredentialReferenceRequest {
                reference: reference.clone(),
            })
            .expect("test credential status is readable")
            .configured
        );
        assert_eq!(
            resolve_credential(&reference, base_url, None)
                .expect("test credential resolves only inside Rust"),
            secret,
        );
        assert!(resolve_credential(&reference, "https://attacker.invalid", None).is_err());
        Ok::<(), String>(())
    })();

    credential_delete(CredentialReferenceRequest {
        reference: reference.clone(),
    })
    .expect("test credential is deleted");
    assert!(
        !credential_get(CredentialReferenceRequest { reference })
            .expect("deleted credential status is readable")
            .configured
    );
    verification.expect("credential round-trip assertions pass");
}
