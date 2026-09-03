# AppScout

Desktop Reddit lead finder for indie apps — built with Tauri 2 + React + TypeScript.

## What it does

1. You add an app (keywords + subreddits)
2. AppScout scans Reddit with **your** API credentials
3. Posts are ranked by purchase / help intent
4. One click drafts a reply (OpenAI if configured, otherwise a local template)
5. You copy the draft and post it yourself from your Reddit account

No auto-posting.

## Setup

### Prerequisites

- Node.js 20+
- Rust (rustup)
- macOS: Xcode Command Line Tools

### Reddit API app

1. Go to https://www.reddit.com/prefs/apps
2. Create an app → type **script**
3. Redirect URI: `http://localhost`
4. Copy the client ID and secret into AppScout → Settings

### Run

Use the **desktop window**, not a browser tab:

```bash
npm install
npm run tauri dev
```

`http://localhost:1420` is only the Vite preview. Reddit scan and reply generation need the Tauri app.

### Build installer

```bash
npm run tauri build
```

## Notes

- Keys and leads are stored locally via Tauri Store (`appscout.json`)
- Optional OpenAI key improves reply drafts (`gpt-4o-mini`)
- Scanning only runs while the app is open / when you click Scan
