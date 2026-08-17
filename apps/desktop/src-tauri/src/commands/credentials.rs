#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialInput {
    credential_key: String,
    token: String,
}

impl CredentialInput {
    pub fn new(credential_key: String, token: String) -> Result<Self, crate::error::NativeError> {
        validate_key(&credential_key)?;
        Ok(Self {
            credential_key,
            token,
        })
    }

    pub fn key(&self) -> &str {
        &self.credential_key
    }
}

impl std::fmt::Debug for CredentialInput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CredentialInput")
            .field("credential_key", &self.credential_key)
            .field("token", &"[REDACTED]")
            .finish()
    }
}

#[tauri::command]
pub async fn credential_set(
    state: tauri::State<'_, crate::credentials::CredentialState>,
    input: CredentialInput,
) -> Result<(), crate::error::NativeError> {
    validate_key(&input.credential_key)?;
    state
        .store
        .set(
            &input.credential_key,
            secrecy::SecretString::from(input.token),
        )
        .await
}

#[tauri::command]
pub async fn credential_get(
    state: tauri::State<'_, crate::credentials::CredentialState>,
    credential_key: String,
) -> Result<Option<String>, crate::error::NativeError> {
    use secrecy::ExposeSecret;
    validate_key(&credential_key)?;
    Ok(state
        .store
        .get(&credential_key)
        .await?
        .map(|value| value.expose_secret().to_owned()))
}

#[tauri::command]
pub async fn credential_delete(
    state: tauri::State<'_, crate::credentials::CredentialState>,
    credential_key: String,
) -> Result<(), crate::error::NativeError> {
    validate_key(&credential_key)?;
    state.store.delete(&credential_key).await
}

fn validate_key(key: &str) -> Result<(), crate::error::NativeError> {
    if key.starts_with("lumaroute/") && key.len() > "lumaroute/".len() {
        Ok(())
    } else {
        Err(crate::error::NativeError::invalid_input(
            "invalid credential key",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::memory::MemoryCredentialStore;
    use crate::credentials::CredentialState;
    use std::sync::Arc;

    #[tokio::test]
    async fn memory_backend_round_trips_without_logging_secrets() {
        let state = CredentialState::new(Arc::new(MemoryCredentialStore::new()));
        let input =
            CredentialInput::new("lumaroute/profile-1".into(), "secret-token".into()).unwrap();
        assert!(!format!("{input:?}").contains("secret-token"));
        state
            .store
            .set(
                input.key(),
                secrecy::SecretString::from("secret-token".to_owned()),
            )
            .await
            .unwrap();
        let got = state.store.get(input.key()).await.unwrap().unwrap();
        assert_eq!(secrecy::ExposeSecret::expose_secret(&got), "secret-token");
        state.store.delete(input.key()).await.unwrap();
        assert!(state.store.get(input.key()).await.unwrap().is_none());
    }
}
