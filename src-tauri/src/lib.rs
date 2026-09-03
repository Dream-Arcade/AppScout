mod reddit;
mod reply;

use reddit::{search_reddit, RedditSearchRequest, RedditSearchResult};
use reply::{generate_reply, GenerateReplyRequest, GenerateReplyResult};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![search_reddit, generate_reply])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Keep types visible for the command macros / tooling.
#[allow(dead_code)]
type _Keep = (
    RedditSearchRequest,
    RedditSearchResult,
    GenerateReplyRequest,
    GenerateReplyResult,
);
