# AppScout

A **local desktop** helper for indie developers to discover **public** Reddit discussions related to apps they build, then reply **manually** from their own Reddit account.

Built with Tauri 2 + React + TypeScript.

AppScout is **not** a Reddit bot. It does not post, vote, message, or act as a user on the platform.

## Purpose

Help developers find public threads where people are already asking about a problem their app may solve (for example appointment tracking or credential-hour logging). The developer reviews each thread, optionally drafts a reply offline, and—if appropriate—posts a helpful, human reply themselves.

This is intended for **personal, non-commercial, low-volume** use by the developer who holds the API credentials.

## What it does (read-only on Reddit)

1. You describe an app (keywords + optional subreddits).
2. AppScout searches **public** Reddit content with **your** approved OAuth credentials.
3. Matching posts are ranked locally by relevance / help-seeking signals.
4. You can draft a reply offline (local template, or optional OpenAI key you provide).
5. You **copy** the draft, **open the thread in a browser**, and post it yourself if it is genuinely useful.

### What it does **not** do

- Auto-post comments or submissions
- Send private messages or chats
- Vote, report, or moderate
- Run unattended as a server-side spam/outreach bot
- Resell, redistribute, or bulk-export Reddit data
- Use Reddit data to train AI models
- Bypass Reddit rate limits or access private/restricted content

## Reddit API access

AppScout only works with credentials Reddit has approved for your use case.

1. Review Reddit’s [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy).
2. Request Data API access through [Reddit Help](https://support.reddithelp.com/hc/en-us/requests/new) if you do not already have approved credentials.
3. After approval, add your client ID and secret in **Settings**.
4. Keep usage low and limited to the subreddits/use case you described in your request.

## Setup

### Prerequisites

- Node.js 20+
- Rust (via rustup)
- macOS: Xcode Command Line Tools (for desktop builds)

### Run

Use the **desktop window**, not a plain browser tab:

```bash
npm install
npm run tauri dev
```

`http://localhost:1420` is only the Vite UI preview. Reddit API calls require the Tauri app.

### Build installer

```bash
npm run tauri build
```

## Privacy & storage

- Reddit credentials, optional OpenAI key, tracked apps, and saved posts/drafts stay **on your computer** (browser local storage inside the desktop app).
- Scanning runs only while the app is open and when you click **Scan**.
- Optional OpenAI drafting uses your own key and is not required.

## Community guidelines for replies

If you use a drafted reply on Reddit:

- Be helpful first; mention your app only when it clearly fits.
- Follow each subreddit’s rules (many disallow promotional comments).
- Never present automation as a human if you were not the one posting.
- Do not mass-post the same pitch across threads.

## License / status

Personal development project. Not an official Reddit product.
