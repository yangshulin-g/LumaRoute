#[test]
fn desktop_capability_allows_parameterized_sql_writes() {
    let capability: serde_json::Value = serde_json::from_str(include_str!(
        "../capabilities/default.json"
    ))
    .expect("valid desktop capability");
    let permissions = capability["permissions"]
        .as_array()
        .expect("permissions array");

    assert!(
        permissions
            .iter()
            .any(|permission| permission == "sql:allow-execute"),
        "onboarding must be allowed to persist device identity and server profiles"
    );
}

#[test]
fn desktop_capability_allows_window_destroy_after_close_flush() {
    let capability: serde_json::Value = serde_json::from_str(include_str!(
        "../capabilities/default.json"
    ))
    .expect("valid desktop capability");
    let permissions = capability["permissions"]
        .as_array()
        .expect("permissions array");

    assert!(
        permissions
            .iter()
            .any(|permission| permission == "core:window:allow-destroy"),
        "close-request handler must destroy the window after flushing playback because Rust prevent_close() blocks the native close"
    );
}
