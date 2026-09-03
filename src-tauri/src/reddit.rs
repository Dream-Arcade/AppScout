use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::command;

const USER_AGENT: &str = "AppScout/0.1.0 by AppScoutDesktop";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RedditSearchRequest {
    pub client_id: String,
    pub client_secret: String,
    pub query: String,
    pub subreddits: Vec<String>,
    pub limit: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RedditPost {
    pub id: String,
    pub title: String,
    pub selftext: String,
    pub author: String,
    pub subreddit: String,
    pub url: String,
    pub permalink: String,
    pub score: i64,
    pub num_comments: i64,
    pub created_utc: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RedditSearchResult {
    pub posts: Vec<RedditPost>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct ListingResponse {
    data: ListingData,
}

#[derive(Deserialize)]
struct ListingData {
    children: Vec<ListingChild>,
}

#[derive(Deserialize)]
struct ListingChild {
    data: PostData,
}

#[derive(Deserialize)]
struct PostData {
    id: String,
    title: Option<String>,
    selftext: Option<String>,
    author: Option<String>,
    subreddit: Option<String>,
    url: Option<String>,
    permalink: Option<String>,
    score: Option<i64>,
    num_comments: Option<i64>,
    created_utc: Option<f64>,
    over_18: Option<bool>,
    stickied: Option<bool>,
}

async fn get_token(client_id: &str, client_secret: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let basic = STANDARD.encode(format!("{client_id}:{client_secret}"));

    let response = client
        .post("https://www.reddit.com/api/v1/access_token")
        .header("Authorization", format!("Basic {basic}"))
        .header("User-Agent", USER_AGENT)
        .form(&[("grant_type", "client_credentials")])
        .send()
        .await
        .map_err(|e| format!("Reddit auth request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Reddit auth failed ({status}). Check client ID/secret. {body}"
        ));
    }

    let token: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Could not parse Reddit token: {e}"))?;

    Ok(token.access_token)
}

fn clean_subreddit(name: &str) -> String {
    name.trim()
        .trim_start_matches("r/")
        .trim_start_matches("/r/")
        .trim()
        .to_string()
}

#[command]
pub async fn search_reddit(request: RedditSearchRequest) -> Result<RedditSearchResult, String> {
    if request.client_id.trim().is_empty() || request.client_secret.trim().is_empty() {
        return Err(
            "Add your Reddit API client ID and secret in Settings before scanning.".into(),
        );
    }
    if request.query.trim().is_empty() {
        return Err("Search query is empty. Add keywords on your app first.".into());
    }

    let token = get_token(&request.client_id, &request.client_secret).await?;
    let client = reqwest::Client::new();
    let limit = request.limit.clamp(5, 50);
    let mut posts: Vec<RedditPost> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let queries: Vec<(String, Option<String>)> = if request.subreddits.is_empty() {
        vec![(request.query.clone(), None)]
    } else {
        request
            .subreddits
            .iter()
            .filter_map(|s| {
                let clean = clean_subreddit(s);
                if clean.is_empty() {
                    None
                } else {
                    Some((request.query.clone(), Some(clean)))
                }
            })
            .collect()
    };

    for (query, subreddit) in queries {
        let url = if let Some(sub) = &subreddit {
            format!(
                "https://oauth.reddit.com/r/{}/search?q={}&restrict_sr=1&sort=new&t=month&limit={}&type=link",
                urlencoding::encode(sub),
                urlencoding::encode(&query),
                limit
            )
        } else {
            format!(
                "https://oauth.reddit.com/search?q={}&sort=new&t=month&limit={}&type=link",
                urlencoding::encode(&query),
                limit
            )
        };

        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {token}"))
            .header("User-Agent", USER_AGENT)
            .send()
            .await
            .map_err(|e| format!("Reddit search failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            // Skip bad subreddits instead of failing the whole scan
            if subreddit.is_some() {
                eprintln!("Skipping subreddit search ({status}): {body}");
                continue;
            }
            return Err(format!("Reddit search failed ({status}): {body}"));
        }

        let listing: ListingResponse = response
            .json()
            .await
            .map_err(|e| format!("Could not parse Reddit results: {e}"))?;

        for child in listing.data.children {
            let data = child.data;
            if data.over_18.unwrap_or(false) || data.stickied.unwrap_or(false) {
                continue;
            }
            if !seen.insert(data.id.clone()) {
                continue;
            }

            let permalink = data.permalink.unwrap_or_default();
            posts.push(RedditPost {
                id: data.id,
                title: data.title.unwrap_or_default(),
                selftext: data.selftext.unwrap_or_default(),
                author: data.author.unwrap_or_else(|| "[deleted]".into()),
                subreddit: data.subreddit.unwrap_or_default(),
                url: data.url.unwrap_or_default(),
                permalink: if permalink.starts_with("http") {
                    permalink
                } else {
                    format!("https://www.reddit.com{permalink}")
                },
                score: data.score.unwrap_or(0),
                num_comments: data.num_comments.unwrap_or(0),
                created_utc: data.created_utc.unwrap_or(0.0),
            });
        }
    }

    Ok(RedditSearchResult { posts })
}
