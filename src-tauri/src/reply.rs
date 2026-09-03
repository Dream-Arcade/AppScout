use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerateReplyRequest {
    pub app_name: String,
    pub app_description: String,
    pub store_url: String,
    pub post_title: String,
    pub post_body: String,
    pub subreddit: String,
    pub openai_api_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GenerateReplyResult {
    pub reply: String,
    pub source: String,
}

fn template_reply(req: &GenerateReplyRequest) -> String {
    let body = req.post_body.trim();
    let snippet = if body.is_empty() {
        String::new()
    } else {
        let clipped: String = body.chars().take(120).collect();
        format!(" I saw your note about \"{clipped}{}\".", if body.chars().count() > 120 { "…" } else { "" })
    };

    let link = if req.store_url.trim().is_empty() {
        String::new()
    } else {
        format!(" {}\n", req.store_url.trim())
    };

    format!(
        "Hey — this sounds close to what {app} is built for.{snippet}\n\n\
{desc}\n\n\
If it helps, you can check it out here:{link}\n\
Happy to answer questions if you want to compare approaches.",
        app = req.app_name.trim(),
        desc = if req.app_description.trim().is_empty() {
            format!(
                "{} is a focused tool for people dealing with this exact problem.",
                req.app_name.trim()
            )
        } else {
            req.app_description.trim().to_string()
        },
        snippet = snippet,
        link = if link.is_empty() { " ".to_string() } else { link },
    )
}

async fn openai_reply(req: &GenerateReplyRequest, api_key: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let system = format!(
        "You write short, helpful Reddit comments for indie app makers. \
Be specific to the post. Sound human, not salesy. No hype, no hashtags, no emojis. \
Mention the app once only if it genuinely fits. Keep replies under 120 words. \
Never claim to be a moderator or official Reddit account. \
App name: {}. App description: {}. Store/link: {}.",
        req.app_name, req.app_description, req.store_url
    );
    let user = format!(
        "Subreddit: r/{}\nTitle: {}\nBody:\n{}\n\nDraft a reply.",
        req.subreddit, req.post_title, req.post_body
    );

    let payload = serde_json::json!({
        "model": "gpt-4o-mini",
        "temperature": 0.7,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user}
        ]
    });

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key.trim())
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI failed ({status}): {body}"));
    }

    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Could not parse OpenAI response: {e}"))?;

    value
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "OpenAI returned an empty reply.".into())
}

#[command]
pub async fn generate_reply(request: GenerateReplyRequest) -> Result<GenerateReplyResult, String> {
    if request.app_name.trim().is_empty() {
        return Err("App name is required to draft a reply.".into());
    }

    if let Some(key) = request
        .openai_api_key
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        match openai_reply(&request, key).await {
            Ok(reply) => {
                return Ok(GenerateReplyResult {
                    reply,
                    source: "openai".into(),
                })
            }
            Err(err) => {
                let fallback = template_reply(&request);
                return Ok(GenerateReplyResult {
                    reply: format!("{fallback}\n\n—\n(AI draft failed, used template: {err})"),
                    source: "template-fallback".into(),
                });
            }
        }
    }

    Ok(GenerateReplyResult {
        reply: template_reply(&request),
        source: "template".into(),
    })
}
