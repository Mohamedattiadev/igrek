//! The few words this program shows before the web app is there (tray menu, a server that did not
//! start), from the same text files the web app uses. The web app sends the tray its words in the
//! language the user chose as soon as it loads; until then the system's language picks.

use serde_json::Value;
use std::sync::OnceLock;

const EN: &str = include_str!("../../../../packages/i18n/locales/en.json");
const TR: &str = include_str!("../../../../packages/i18n/locales/tr.json");

fn turkish() -> bool {
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .find_map(|name| std::env::var(name).ok().filter(|v| !v.is_empty()))
        .is_some_and(|lang| lang.starts_with("tr"))
}

fn texts() -> &'static Value {
    static TEXTS: OnceLock<Value> = OnceLock::new();
    TEXTS.get_or_init(|| serde_json::from_str(if turkish() { TR } else { EN }).unwrap_or(Value::Null))
}

/// The text for a dotted key such as "desktop.trayOpen"; the key itself if it is missing.
pub fn get(key: &str) -> String {
    key.split('.')
        .try_fold(texts(), |node, part| node.get(part))
        .and_then(Value::as_str)
        .unwrap_or(key)
        .to_string()
}
