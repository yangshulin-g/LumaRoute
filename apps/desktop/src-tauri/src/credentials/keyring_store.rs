use async_trait::async_trait;
use keyring::Entry;
use secrecy::{ExposeSecret, SecretString};

use super::CredentialBackend;

pub struct KeyringCredentialStore {
    service: String,
}

impl KeyringCredentialStore {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    fn entry(&self, key: &str) -> Result<Entry, crate::error::NativeError> {
        Entry::new(&self.service, key).map_err(|error| {
            crate::error::NativeError::storage_failure(format!("keyring entry failed: {error}"))
        })
    }
}

#[async_trait]
impl CredentialBackend for KeyringCredentialStore {
    async fn set(&self, key: &str, token: SecretString) -> Result<(), crate::error::NativeError> {
        self.entry(key)?
            .set_password(token.expose_secret())
            .map_err(|error| {
                crate::error::NativeError::storage_failure(format!(
                    "credential set failed: {error}"
                ))
            })
    }

    async fn get(&self, key: &str) -> Result<Option<SecretString>, crate::error::NativeError> {
        match self.entry(key)?.get_password() {
            Ok(password) => Ok(Some(SecretString::from(password))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(crate::error::NativeError::storage_failure(format!(
                "credential get failed: {error}"
            ))),
        }
    }

    async fn delete(&self, key: &str) -> Result<(), crate::error::NativeError> {
        match self.entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(crate::error::NativeError::storage_failure(format!(
                "credential delete failed: {error}"
            ))),
        }
    }
}
