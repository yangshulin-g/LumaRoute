use async_trait::async_trait;
use secrecy::{ExposeSecret, SecretString};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::CredentialBackend;

/// Process-local cache over a durable credential backend.
///
/// Successful reads are remembered for the process lifetime so macOS Keychain
/// (and equivalent stores) are not queried once per HTTP/image request.
pub struct CachedCredentialStore {
    inner: Arc<dyn CredentialBackend>,
    cache: Mutex<HashMap<String, Option<SecretString>>>,
}

impl CachedCredentialStore {
    pub fn new(inner: Arc<dyn CredentialBackend>) -> Self {
        Self {
            inner,
            cache: Mutex::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl CredentialBackend for CachedCredentialStore {
    async fn set(&self, key: &str, token: SecretString) -> Result<(), crate::error::NativeError> {
        self.inner.set(key, SecretString::from(token.expose_secret().to_owned())).await?;
        let mut cache = self.cache.lock().await;
        cache.insert(key.to_owned(), Some(token));
        Ok(())
    }

    async fn get(&self, key: &str) -> Result<Option<SecretString>, crate::error::NativeError> {
        let mut cache = self.cache.lock().await;
        if let Some(cached) = cache.get(key) {
            return Ok(cached.clone());
        }
        let value = self.inner.get(key).await?;
        cache.insert(key.to_owned(), value.clone());
        Ok(value)
    }

    async fn delete(&self, key: &str) -> Result<(), crate::error::NativeError> {
        self.inner.delete(key).await?;
        let mut cache = self.cache.lock().await;
        cache.insert(key.to_owned(), None);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct CountingBackend {
        values: Mutex<HashMap<String, String>>,
        gets: AtomicUsize,
    }

    impl CountingBackend {
        fn new() -> Self {
            Self {
                values: Mutex::new(HashMap::new()),
                gets: AtomicUsize::new(0),
            }
        }
    }

    #[async_trait]
    impl CredentialBackend for CountingBackend {
        async fn set(
            &self,
            key: &str,
            token: SecretString,
        ) -> Result<(), crate::error::NativeError> {
            self.values
                .lock()
                .await
                .insert(key.to_owned(), token.expose_secret().to_owned());
            Ok(())
        }

        async fn get(&self, key: &str) -> Result<Option<SecretString>, crate::error::NativeError> {
            self.gets.fetch_add(1, Ordering::SeqCst);
            Ok(self
                .values
                .lock()
                .await
                .get(key)
                .cloned()
                .map(SecretString::from))
        }

        async fn delete(&self, key: &str) -> Result<(), crate::error::NativeError> {
            self.values.lock().await.remove(key);
            Ok(())
        }
    }

    #[tokio::test]
    async fn repeated_gets_hit_inner_backend_only_once_per_key() {
        let inner = Arc::new(CountingBackend::new());
        inner
            .set(
                "lumaroute/profile-1",
                SecretString::from("secret-token".to_owned()),
            )
            .await
            .unwrap();
        let store = CachedCredentialStore::new(inner.clone());

        for _ in 0..5 {
            let got = store.get("lumaroute/profile-1").await.unwrap().unwrap();
            assert_eq!(got.expose_secret(), "secret-token");
        }

        assert_eq!(
            inner.gets.load(Ordering::SeqCst),
            1,
            "keychain/backend must be read once per credentialKey per process"
        );
    }

    #[tokio::test]
    async fn set_updates_cache_without_extra_get() {
        let inner = Arc::new(CountingBackend::new());
        let store = CachedCredentialStore::new(inner.clone());
        store
            .set(
                "lumaroute/profile-1",
                SecretString::from("secret-token".to_owned()),
            )
            .await
            .unwrap();

        let got = store.get("lumaroute/profile-1").await.unwrap().unwrap();
        assert_eq!(got.expose_secret(), "secret-token");
        assert_eq!(inner.gets.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn delete_clears_cached_value() {
        let inner = Arc::new(CountingBackend::new());
        let store = CachedCredentialStore::new(inner.clone());
        store
            .set(
                "lumaroute/profile-1",
                SecretString::from("secret-token".to_owned()),
            )
            .await
            .unwrap();
        store.delete("lumaroute/profile-1").await.unwrap();

        assert!(store.get("lumaroute/profile-1").await.unwrap().is_none());
        // Miss after delete is cached as None; a second get must not re-hit backend.
        assert!(store.get("lumaroute/profile-1").await.unwrap().is_none());
        assert_eq!(inner.gets.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn missing_key_is_cached_after_first_miss() {
        let inner = Arc::new(CountingBackend::new());
        let store = CachedCredentialStore::new(inner.clone());

        assert!(store.get("lumaroute/missing").await.unwrap().is_none());
        assert!(store.get("lumaroute/missing").await.unwrap().is_none());
        assert_eq!(inner.gets.load(Ordering::SeqCst), 1);
    }
}
