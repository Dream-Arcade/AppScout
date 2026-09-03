import { IntentTag, RedditPostPayload, TrackedApp } from "./types";

const REQUEST_PHRASES = [
  "looking for",
  "any app",
  "recommend",
  "recommendation",
  "is there an app",
  "does anyone know",
  "need an app",
  "need a way",
  "how do you track",
  "best way to",
  "alternative to",
  "instead of",
  "tool for",
  "software for",
];

const COMPLAINT_PHRASES = [
  "hate",
  "frustrated",
  "annoying",
  "broken",
  "doesn't work",
  "does not work",
  "too expensive",
  "wish there was",
  "sick of",
  "pain to",
];

const BUY_SIGNALS = [
  "paid",
  "pay for",
  "worth paying",
  "subscription",
  "buy",
  "purchase",
  "premium",
];

function includesAny(text: string, phrases: string[]) {
  return phrases.some((p) => text.includes(p));
}

export function scorePost(post: RedditPostPayload, app: TrackedApp) {
  const text = `${post.title} ${post.selftext}`.toLowerCase();
  let score = 20;
  let tag: IntentTag = "discussion";

  if (includesAny(text, REQUEST_PHRASES)) {
    score += 35;
    tag = "request";
  }
  if (includesAny(text, COMPLAINT_PHRASES)) {
    score += 20;
    if (tag === "discussion") tag = "complaint";
  }
  if (includesAny(text, ["recommend", "recommendation", "suggest"])) {
    if (tag === "discussion") tag = "recommendation";
    score += 10;
  }
  if (includesAny(text, BUY_SIGNALS)) score += 12;

  for (const keyword of app.keywords) {
    const parts = keyword.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = parts.filter((p) => text.includes(p)).length;
    if (hits === parts.length && parts.length > 0) score += 14;
    else if (hits > 0) score += 4;
  }

  const appWords = `${app.name} ${app.description}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 4);
  const unique = [...new Set(appWords)].slice(0, 12);
  for (const word of unique) {
    if (text.includes(word)) score += 3;
  }

  if (post.selftext.trim().length > 180) score += 8;
  if (post.numComments >= 3) score += 5;
  if (post.score >= 5) score += 4;

  const ageHours = Math.max(0, (Date.now() / 1000 - post.createdUtc) / 3600);
  if (ageHours < 24) score += 10;
  else if (ageHours < 72) score += 5;
  else if (ageHours > 24 * 21) score -= 15;

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { intentScore: score, intentTag: tag };
}

export function buildSearchQuery(app: TrackedApp) {
  const phrases = app.keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((k) => (k.includes(" ") ? `"${k}"` : k));

  if (phrases.length === 0) {
    return app.name.trim() || "app";
  }
  return phrases.join(" OR ");
}
