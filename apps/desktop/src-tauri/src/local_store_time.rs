#![cfg_attr(test, allow(dead_code))]

use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn unix_timestamp_ms() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
