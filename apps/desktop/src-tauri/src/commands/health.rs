use serde::Serialize;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    pub status: &'static str,
    pub version: &'static str,
}

#[tauri::command]
pub fn health_check() -> Result<HealthStatus, crate::error::NativeError> {
    Ok(HealthStatus {
        status: "ready",
        version: "0.1.0",
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_ready() {
        assert_eq!(
            health_check().expect("health status"),
            HealthStatus {
                status: "ready",
                version: "0.1.0"
            }
        );
    }
}
