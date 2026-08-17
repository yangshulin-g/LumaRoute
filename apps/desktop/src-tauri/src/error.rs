use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum NativeError {
    #[error("{0}")]
    InvalidInput(String),
    #[error("{0}")]
    StorageFailure(String),
    #[error("{0}")]
    PlayerUnavailable(String),
}

impl NativeError {
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::InvalidInput(sanitize_message(message.into()))
    }

    pub fn storage_failure(message: impl Into<String>) -> Self {
        Self::StorageFailure(sanitize_message(message.into()))
    }

    pub fn player_unavailable(message: impl Into<String>) -> Self {
        Self::PlayerUnavailable(sanitize_message(message.into()))
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "InvalidInput",
            Self::StorageFailure(_) => "StorageFailure",
            Self::PlayerUnavailable(_) => "PlayerUnavailable",
        }
    }

    pub fn message(&self) -> &str {
        match self {
            Self::InvalidInput(message)
            | Self::StorageFailure(message)
            | Self::PlayerUnavailable(message) => message,
        }
    }
}

impl Serialize for NativeError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("NativeError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", self.message())?;
        state.end()
    }
}

fn sanitize_message(raw: String) -> String {
    let without_paths = strip_paths(&raw);
    let without_bearer = redact_bearer(&without_paths);
    redact_labeled_secrets(&without_bearer)
}

fn strip_paths(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut index = 0;
    while index < chars.len() {
        let ch = chars[index];
        let start_unix = ch == '/'
            && chars
                .get(index + 1)
                .is_some_and(|next| next.is_alphanumeric() || *next == '.' || *next == '_');
        let start_windows = ch.is_ascii_alphabetic()
            && chars.get(index + 1) == Some(&':')
            && chars.get(index + 2) == Some(&'\\');

        if start_unix || start_windows {
            out.push_str("[PATH]");
            index += 1;
            while index < chars.len() {
                let next = chars[index];
                if next.is_whitespace() || next == '"' || next == '\'' || next == ')' || next == ','
                {
                    break;
                }
                index += 1;
            }
            continue;
        }
        out.push(ch);
        index += 1;
    }
    out
}

fn redact_bearer(input: &str) -> String {
    let lower = input.to_ascii_lowercase();
    let chars: Vec<char> = input.chars().collect();
    let lower_chars: Vec<char> = lower.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut index = 0;
    const BEARER: &[char] = &['b', 'e', 'a', 'r', 'e', 'r', ' '];

    while index < chars.len() {
        if lower_chars[index..].starts_with(BEARER) {
            out.push_str("Bearer [REDACTED]");
            index += BEARER.len();
            while index < chars.len() && !chars[index].is_whitespace() {
                index += 1;
            }
            continue;
        }
        out.push(chars[index]);
        index += 1;
    }
    out
}

fn redact_labeled_secrets(input: &str) -> String {
    const LABELS: &[&str] = &[
        "authorization",
        "x-emby-token",
        "access_token",
        "access-token",
        "api_key",
        "api-key",
        "password",
        "token",
    ];
    let lower = input.to_ascii_lowercase();
    let mut out = String::with_capacity(input.len());
    let mut index = 0;
    let chars: Vec<char> = input.chars().collect();
    let lower_chars: Vec<char> = lower.chars().collect();

    while index < chars.len() {
        let mut matched = None;
        for label in LABELS {
            let label_chars: Vec<char> = label.chars().collect();
            if lower_chars[index..].starts_with(&label_chars) {
                let after = index + label_chars.len();
                if after < chars.len() {
                    let separator = chars[after];
                    if separator == ':' || separator == '=' {
                        matched = Some((label_chars.len(), after));
                        break;
                    }
                    if separator.is_whitespace() {
                        let mut cursor = after;
                        while cursor < chars.len() && chars[cursor].is_whitespace() {
                            cursor += 1;
                        }
                        if cursor < chars.len() && (chars[cursor] == ':' || chars[cursor] == '=') {
                            matched = Some((label_chars.len(), cursor));
                            break;
                        }
                    }
                }
            }
        }

        if let Some((label_len, sep_index)) = matched {
            for ch in chars.iter().take(index + label_len).skip(index) {
                out.push(*ch);
            }
            out.push_str("=[REDACTED]");
            index = sep_index + 1;
            while index < chars.len() && chars[index].is_whitespace() {
                index += 1;
            }
            while index < chars.len() && !chars[index].is_whitespace() {
                index += 1;
            }
            continue;
        }

        out.push(chars[index]);
        index += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_only_code_and_message() {
        let error = NativeError::invalid_input("bad input");
        let value = serde_json::to_value(&error).unwrap();
        assert_eq!(value["code"], "InvalidInput");
        assert_eq!(value["message"], "bad input");
        assert_eq!(value.as_object().unwrap().len(), 2);
    }

    #[test]
    fn strips_paths_headers_and_secrets_from_serialized_message() {
        let error = NativeError::player_unavailable(
            "failed at /Users/demo/.config/mpv with Authorization: Bearer super-secret-token and token=keyring-value",
        );
        let json = serde_json::to_string(&error).unwrap();
        assert!(!json.contains("/Users/demo"));
        assert!(!json.contains("super-secret-token"));
        assert!(!json.contains("keyring-value"));
        assert!(json.contains("[PATH]"));
        assert!(json.contains("[REDACTED]"));
        assert!(json.contains("\"code\":\"PlayerUnavailable\""));
    }

    #[test]
    fn preserves_chinese_player_guidance_while_redacting_secrets() {
        let error = NativeError::player_unavailable(
            "未找到打包的 mpv 播放器。请运行 pnpm fetch:mpv。Authorization: Bearer secret-token",
        );
        assert!(error.message().contains("未找到打包的 mpv 播放器"));
        assert!(error.message().contains("pnpm fetch:mpv"));
        assert!(!error.message().contains("secret-token"));
        assert!(error.message().contains("[REDACTED]"));
    }
}
