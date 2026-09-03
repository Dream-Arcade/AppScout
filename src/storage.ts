import {
  DEFAULT_SETTINGS,
  Lead,
  Settings,
  TrackedApp,
} from "./types";

const KEYS = {
  settings: "appscout.settings",
  apps: "appscout.apps",
  leads: "appscout.leads",
} as const;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(KEYS.settings, {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  writeJson(KEYS.settings, settings);
}

export async function loadApps(): Promise<TrackedApp[]> {
  return readJson<TrackedApp[]>(KEYS.apps, []);
}

export async function saveApps(apps: TrackedApp[]): Promise<void> {
  writeJson(KEYS.apps, apps);
}

export async function loadLeads(): Promise<Lead[]> {
  return readJson<Lead[]>(KEYS.leads, []);
}

export async function saveLeads(leads: Lead[]): Promise<void> {
  writeJson(KEYS.leads, leads);
}
