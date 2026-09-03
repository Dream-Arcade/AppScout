export type LeadStatus = "new" | "saved" | "replied" | "skipped";

export type IntentTag = "request" | "complaint" | "discussion" | "recommendation";

export interface TrackedApp {
  id: string;
  name: string;
  description: string;
  storeUrl: string;
  keywords: string[];
  subreddits: string[];
  createdAt: string;
}

export interface Settings {
  redditClientId: string;
  redditClientSecret: string;
  openaiApiKey: string;
}

export interface RedditPostPayload {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  url: string;
  permalink: string;
  score: number;
  numComments: number;
  createdUtc: number;
}

export interface Lead {
  id: string;
  appId: string;
  redditId: string;
  title: string;
  body: string;
  author: string;
  subreddit: string;
  permalink: string;
  redditScore: number;
  numComments: number;
  createdUtc: number;
  intentScore: number;
  intentTag: IntentTag;
  status: LeadStatus;
  draftReply?: string;
  draftSource?: string;
  foundAt: string;
}

export const DEFAULT_SETTINGS: Settings = {
  redditClientId: "",
  redditClientSecret: "",
  openaiApiKey: "",
};

export const SAMPLE_APP: Omit<TrackedApp, "id" | "createdAt"> = {
  name: "AppointMe Tracker",
  description:
    "Offline-first appointment and caseload tracker for documenting sessions, completed hours, and progress toward a credential or certification goal.",
  storeUrl: "",
  keywords: [
    "track practicum hours",
    "supervision hours log",
    "caseload tracker",
    "appointment tracker offline",
    "credential hours spreadsheet",
  ],
  subreddits: [
    "socialwork",
    "therapists",
    "BCBA",
    "slp",
    "gradschool",
    "androidapps",
  ],
};
