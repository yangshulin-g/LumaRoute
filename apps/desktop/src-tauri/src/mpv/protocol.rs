//! Allowlisted mpv JSON IPC command builders and event decoding.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePlaybackPlan {
    pub item_id: String,
    pub media_source_id: String,
    pub play_session_id: String,
    pub stream_url: String,
    pub request_headers: BTreeMap<String, String>,
    pub container: String,
    pub video_codec: String,
    pub audio_codec: Option<String>,
    pub bitrate: Option<u64>,
    pub duration_seconds: f64,
    pub method: String,
    pub start_position_seconds: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum NativePlayerEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        position_seconds: f64,
        duration_seconds: f64,
    },
    #[serde(rename_all = "camelCase")]
    Position {
        position_seconds: f64,
        duration_seconds: f64,
    },
    #[serde(rename_all = "camelCase")]
    Paused {
        position_seconds: f64,
        duration_seconds: f64,
    },
    #[serde(rename_all = "camelCase")]
    Resumed {
        position_seconds: f64,
        duration_seconds: f64,
    },
    #[serde(rename_all = "camelCase")]
    Seeked {
        position_seconds: f64,
        duration_seconds: f64,
    },
    #[serde(rename_all = "camelCase")]
    Ended {
        position_seconds: f64,
        duration_seconds: f64,
    },
    #[serde(rename_all = "camelCase")]
    Stopped {
        position_seconds: f64,
        duration_seconds: f64,
    },
    #[serde(rename_all = "camelCase")]
    Error { code: String, message: String },
}

#[derive(Debug, Clone, Copy)]
pub enum ControlAction {
    Pause,
    Resume,
    Seek(f64),
    Stop,
}

#[derive(Debug, Serialize)]
pub struct MpvCommand {
    command: Vec<Value>,
    request_id: u64,
}

impl MpvCommand {
    pub fn new(request_id: u64, command: Vec<Value>) -> Self {
        Self {
            command,
            request_id,
        }
    }

    pub fn set_property(request_id: u64, name: &str, value: impl Into<Value>) -> Self {
        Self::new(
            request_id,
            vec!["set_property".into(), name.into(), value.into()],
        )
    }

    pub fn command(request_id: u64, name: &str, arg: impl Into<Value>) -> Self {
        Self::new(request_id, vec![name.into(), arg.into()])
    }

    pub fn simple(request_id: u64, name: &str) -> Self {
        Self::new(request_id, vec![name.into()])
    }

    pub fn observe_property(request_id: u64, name: &str, id: u64) -> Self {
        // Real mpv JSON IPC rejects a 4th format argument ("native"/"none").
        Self::new(
            request_id,
            vec!["observe_property".into(), id.into(), name.into()],
        )
    }

    pub fn command_name(&self) -> &str {
        self.command
            .first()
            .and_then(Value::as_str)
            .unwrap_or_default()
    }

    pub fn property_name(&self) -> Option<&str> {
        if self.command_name() != "set_property" && self.command_name() != "observe_property" {
            return None;
        }
        // set_property: [cmd, name, value]
        // observe_property: [cmd, id, name]
        let index = if self.command_name() == "observe_property" {
            2
        } else {
            1
        };
        self.command.get(index).and_then(Value::as_str)
    }

    pub fn as_json_line(&self) -> Result<String, serde_json::Error> {
        let mut line = serde_json::to_string(self)?;
        line.push('\n');
        Ok(line)
    }

    pub fn validate_allowlisted(&self) -> Result<(), String> {
        match self.command_name() {
            "set_property" => match self.property_name() {
                Some("http-header-fields") | Some("pause") => Ok(()),
                other => Err(format!("disallowed set_property: {other:?}")),
            },
            "loadfile" | "seek" | "stop" | "observe_property" => Ok(()),
            other => Err(format!("disallowed mpv command: {other}")),
        }
    }
}

pub fn play_commands(plan: &NativePlaybackPlan) -> [MpvCommand; 2] {
    let mut headers: Vec<Value> = plan
        .request_headers
        .iter()
        .map(|(name, value)| Value::String(format!("{name}: {value}")))
        .collect();
    // Some reverse proxies reject bare mpv/curl defaults; keep a browser-compatible UA.
    let has_user_agent = plan
        .request_headers
        .keys()
        .any(|name| name.eq_ignore_ascii_case("user-agent"));
    if !has_user_agent {
        headers.push(Value::String(
            "User-Agent: Mozilla/5.0 (compatible; LumaRoute/0.1.0)".into(),
        ));
    }
    // Real mpv rejects loadfile options such as "start=N" / option objects.
    // Resume offset is applied with an absolute seek after file-loaded.
    [
        MpvCommand::new(
            1,
            vec![
                "set_property".into(),
                "http-header-fields".into(),
                Value::Array(headers),
            ],
        ),
        MpvCommand::new(
            2,
            vec![
                "loadfile".into(),
                plan.stream_url.clone().into(),
                "replace".into(),
            ],
        ),
    ]
}

pub fn control_command(action: ControlAction) -> MpvCommand {
    match action {
        ControlAction::Pause => MpvCommand::set_property(10, "pause", true),
        ControlAction::Resume => MpvCommand::set_property(11, "pause", false),
        ControlAction::Seek(seconds) => MpvCommand::new(
            12,
            vec!["seek".into(), seconds.into(), "absolute".into()],
        ),
        ControlAction::Stop => MpvCommand::simple(13, "stop"),
    }
}

pub fn observe_commands() -> [MpvCommand; 5] {
    [
        MpvCommand::observe_property(100, "time-pos", 1),
        MpvCommand::observe_property(101, "duration", 2),
        MpvCommand::observe_property(102, "pause", 3),
        MpvCommand::observe_property(103, "path", 4),
        MpvCommand::observe_property(104, "idle-active", 5),
    ]
}

#[derive(Debug, Deserialize)]
struct RawMpvMessage {
    event: Option<String>,
    name: Option<String>,
    data: Option<Value>,
    #[serde(default)]
    position: Option<f64>,
    reason: Option<String>,
    error: Option<String>,
    request_id: Option<u64>,
}

/// Decode a single mpv JSON IPC line into a stable native player event.
/// Pure protocol mapping uses zeroed position/duration when session context is unavailable.
pub fn map_mpv_event(line: &str) -> Result<Option<NativePlayerEvent>, serde_json::Error> {
    map_mpv_event_with_state(line, 0.0, 0.0)
}

pub fn map_mpv_event_with_state(
    line: &str,
    position_seconds: f64,
    duration_seconds: f64,
) -> Result<Option<NativePlayerEvent>, serde_json::Error> {
    let message: RawMpvMessage = serde_json::from_str(line)?;
    if message.request_id.is_some() && message.event.is_none() {
        if message.error.as_deref().is_some_and(|e| e != "success") {
            return Ok(Some(NativePlayerEvent::Error {
                code: "PlaybackFailed".into(),
                message: message.error.unwrap_or_default(),
            }));
        }
        return Ok(None);
    }

    match message.event.as_deref() {
        Some("property-change") => match message.name.as_deref() {
            Some("pause") => {
                let paused = message
                    .data
                    .as_ref()
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                Ok(Some(if paused {
                    NativePlayerEvent::Paused {
                        position_seconds,
                        duration_seconds,
                    }
                } else {
                    NativePlayerEvent::Resumed {
                        position_seconds,
                        duration_seconds,
                    }
                }))
            }
            Some("time-pos") => {
                let position = message
                    .data
                    .as_ref()
                    .and_then(Value::as_f64)
                    .unwrap_or(position_seconds);
                Ok(Some(NativePlayerEvent::Position {
                    position_seconds: position,
                    duration_seconds,
                }))
            }
            Some("duration") => {
                let duration = message
                    .data
                    .as_ref()
                    .and_then(Value::as_f64)
                    .unwrap_or(duration_seconds);
                Ok(Some(NativePlayerEvent::Position {
                    position_seconds,
                    duration_seconds: duration,
                }))
            }
            _ => Ok(None),
        },
        Some("file-loaded") => Ok(Some(NativePlayerEvent::Started {
            position_seconds,
            duration_seconds,
        })),
        Some("seek") => {
            let position = message.position.unwrap_or(position_seconds);
            Ok(Some(NativePlayerEvent::Seeked {
                position_seconds: position,
                duration_seconds,
            }))
        }
        Some("end-file") => {
            if message.reason.as_deref() == Some("stop") {
                Ok(Some(NativePlayerEvent::Stopped {
                    position_seconds,
                    duration_seconds,
                }))
            } else if message.reason.as_deref() == Some("error") {
                Ok(Some(NativePlayerEvent::Error {
                    code: "PlaybackFailed".into(),
                    message: "mpv failed to open or decode the stream".into(),
                }))
            } else {
                Ok(Some(NativePlayerEvent::Ended {
                    position_seconds,
                    duration_seconds,
                }))
            }
        }
        _ => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn test_plan() -> NativePlaybackPlan {
        NativePlaybackPlan {
            item_id: "item-1".into(),
            media_source_id: "source-1".into(),
            play_session_id: "session-1".into(),
            stream_url: "https://media.example/stream.mkv".into(),
            request_headers: BTreeMap::from([("X-Emby-Token".into(), "secret-token".into())]),
            container: "mkv".into(),
            video_codec: "h264".into(),
            audio_codec: Some("aac".into()),
            bitrate: Some(8_000_000),
            duration_seconds: 120.0,
            method: "direct-play".into(),
            start_position_seconds: 0.0,
        }
    }

    #[test]
    fn sets_headers_before_loading_the_url() {
        let plan = test_plan();
        let commands = play_commands(&plan);
        assert_eq!(commands[0].command_name(), "set_property");
        assert_eq!(commands[0].property_name(), Some("http-header-fields"));
        assert_eq!(commands[1].command_name(), "loadfile");
        assert!(!serde_json::to_string(&commands[1])
            .unwrap()
            .contains("secret-token"));
    }

    #[test]
    fn play_commands_use_mpv_compatible_loadfile_without_start_option() {
        let mut plan = test_plan();
        plan.start_position_seconds = 42.0;
        let commands = play_commands(&plan);
        let loadfile = serde_json::to_value(&commands[1]).unwrap();
        assert_eq!(
            loadfile["command"],
            json!(["loadfile", "https://media.example/stream.mkv", "replace"])
        );
        let encoded = loadfile.to_string();
        assert!(!encoded.contains("start="));
        assert!(!encoded.contains("secret-token"));
    }

    #[test]
    fn play_commands_set_headers_as_string_list_with_user_agent() {
        let plan = test_plan();
        let headers = serde_json::to_value(&play_commands(&plan)[0]).unwrap()["command"][2]
            .as_array()
            .cloned()
            .unwrap();
        assert!(headers.iter().any(|value| {
            value
                .as_str()
                .is_some_and(|text| text == "X-Emby-Token: secret-token")
        }));
        assert!(headers.iter().any(|value| {
            value
                .as_str()
                .is_some_and(|text| text.starts_with("User-Agent: Mozilla/5.0 (compatible; LumaRoute/"))
        }));
        let loadfile = serde_json::to_string(&play_commands(&plan)[1]).unwrap();
        assert!(!loadfile.contains("secret-token"));
    }

    #[test]
    fn observe_commands_omit_unsupported_format_argument() {
        let commands = observe_commands();
        for command in &commands {
            let value = serde_json::to_value(command).unwrap();
            let args = value["command"].as_array().unwrap();
            assert_eq!(args.len(), 3, "observe_property must be [cmd, id, name]");
            assert_eq!(args[0], "observe_property");
        }
    }

    #[test]
    fn seek_control_uses_absolute_mode() {
        let command = control_command(ControlAction::Seek(30.0));
        assert_eq!(
            serde_json::to_value(&command).unwrap()["command"],
            json!(["seek", 30.0, "absolute"])
        );
    }

    #[test]
    fn maps_observed_properties_to_stable_events() {
        assert_eq!(
            map_mpv_event(r#"{"event":"property-change","name":"pause","data":true}"#).unwrap(),
            Some(NativePlayerEvent::Paused {
                position_seconds: 0.0,
                duration_seconds: 0.0,
            })
        );
    }
}
