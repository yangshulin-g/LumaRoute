#[test]
fn credential_keys_are_namespaced_and_values_are_not_debuggable() {
    let input = lumaroute_lib::commands::credentials::CredentialInput::new(
        "lumaroute/profile-1".into(),
        "secret-token".into(),
    )
    .expect("valid input");
    assert_eq!(input.key(), "lumaroute/profile-1");
    assert!(!format!("{input:?}").contains("secret-token"));
}
