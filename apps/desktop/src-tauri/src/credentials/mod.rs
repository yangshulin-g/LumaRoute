use async_trait::async_trait;
use secrecy::SecretString;
use std::sync::Arc;

mod cached_store;
mod keyring_store;

pub use cached_store::CachedCredentialStore;
pub use keyring_store::KeyringCredentialStore;

#[async_trait]
pub trait CredentialBackend: Send + Sync {
    async fn set(&self, key: &str, token: SecretString) -> Result<(), crate::error::NativeError>;
    async fn get(&self, key: &str) -> Result<Option<SecretString>, crate::error::NativeError>;
    async fn delete(&self, key: &str) -> Result<(), crate::error::NativeError>;
}

pub struct CredentialState {
    pub store: Arc<dyn CredentialBackend>,
}

impl CredentialState {
    pub fn new(store: Arc<dyn CredentialBackend>) -> Self {
        Self { store }
    }

    pub fn keyring() -> Self {
        let durable = Arc::new(KeyringCredentialStore::new(
            "io.github.lumaroute.desktop",
        ));
        Self::new(Arc::new(CachedCredentialStore::new(durable)))
    }
}

#[cfg(test)]
pub mod memory {
    use super::*;
    use secrecy::ExposeSecret;
    use std::collections::HashMap;
    use std::sync::Mutex;

    pub struct MemoryCredentialStore {
        inner: Mutex<HashMap<String, String>>,
    }

    impl MemoryCredentialStore {
        pub fn new() -> Self {
            Self {
                inner: Mutex::new(HashMap::new()),
            }
        }
    }

    #[async_trait]
    impl CredentialBackend for MemoryCredentialStore {
        async fn set(
            &self,
            key: &str,
            token: SecretString,
        ) -> Result<(), crate::error::NativeError> {
            self.inner
                .lock()
                .expect("credential mutex")
                .insert(key.to_owned(), token.expose_secret().to_owned());
            Ok(())
        }

        async fn get(&self, key: &str) -> Result<Option<SecretString>, crate::error::NativeError> {
            Ok(self
                .inner
                .lock()
                .expect("credential mutex")
                .get(key)
                .cloned()
                .map(SecretString::from))
        }

        async fn delete(&self, key: &str) -> Result<(), crate::error::NativeError> {
            self.inner.lock().expect("credential mutex").remove(key);
            Ok(())
        }
    }
}
