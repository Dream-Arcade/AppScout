import { useEffect, useMemo, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./App.css";
import { buildSearchQuery, scorePost } from "./scoring";
import {
  loadApps,
  loadLeads,
  loadSettings,
  saveApps,
  saveLeads,
  saveSettings,
} from "./storage";
import {
  Lead,
  LeadStatus,
  RedditPostPayload,
  SAMPLE_APP,
  Settings,
  TrackedApp,
} from "./types";

function requireDesktop() {
  if (!isTauri()) {
    throw new Error(
      "Open AppScout with `npm run tauri dev` (the desktop window), not the browser tab at localhost:1420.",
    );
  }
}

type Tab = "inbox" | "apps" | "settings";

interface RedditSearchResult {
  posts: RedditPostPayload[];
}

interface GenerateReplyResult {
  reply: string;
  source: string;
}

function uid() {
  return crypto.randomUUID();
}

function formatAge(createdUtc: number) {
  const hours = Math.max(0, (Date.now() / 1000 - createdUtc) / 3600);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function linesToList(value: string) {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function App() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apps, setApps] = useState<TrackedApp[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("new");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const [appForm, setAppForm] = useState({
    name: "",
    description: "",
    storeUrl: "",
    keywords: "",
    subreddits: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const [s, a, l] = await Promise.all([
          loadSettings(),
          loadApps(),
          loadLeads(),
        ]);
        setSettings(s);
        setApps(a);
        setLeads(l);
        if (l[0]) setSelectedLeadId(l[0].id);
      } catch (e) {
        setError(`Could not load local data: ${String(e)}`);
      }
    })();
  }, []);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  const filteredLeads = useMemo(() => {
    return leads
      .filter((l) => (selectedAppId === "all" ? true : l.appId === selectedAppId))
      .filter((l) => (statusFilter === "all" ? true : l.status === statusFilter))
      .sort((a, b) => b.intentScore - a.intentScore || b.createdUtc - a.createdUtc);
  }, [leads, selectedAppId, statusFilter]);

  useEffect(() => {
    if (selectedLead?.draftReply) setDraft(selectedLead.draftReply);
    else setDraft("");
  }, [selectedLead?.id, selectedLead?.draftReply]);

  async function persistLeads(next: Lead[]) {
    setLeads(next);
    await saveLeads(next);
  }

  async function persistApps(next: TrackedApp[]) {
    setApps(next);
    await saveApps(next);
  }

  async function scanApp(app: TrackedApp) {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      requireDesktop();
      const query = buildSearchQuery(app);
      const result = await invoke<RedditSearchResult>("search_reddit", {
        request: {
          clientId: settings.redditClientId,
          clientSecret: settings.redditClientSecret,
          query,
          subreddits: app.subreddits,
          limit: 25,
        },
      });

      const existing = new Set(leads.map((l) => `${l.appId}:${l.redditId}`));
      const fresh: Lead[] = [];

      for (const post of result.posts) {
        const key = `${app.id}:${post.id}`;
        if (existing.has(key)) continue;
        const scored = scorePost(post, app);
        if (scored.intentScore < 35) continue;
        fresh.push({
          id: uid(),
          appId: app.id,
          redditId: post.id,
          title: post.title,
          body: post.selftext,
          author: post.author,
          subreddit: post.subreddit,
          permalink: post.permalink,
          redditScore: post.score,
          numComments: post.numComments,
          createdUtc: post.createdUtc,
          intentScore: scored.intentScore,
          intentTag: scored.intentTag,
          status: "new",
          foundAt: new Date().toISOString(),
        });
      }

      const next = [...fresh, ...leads].sort(
        (a, b) => b.intentScore - a.intentScore,
      );
      await persistLeads(next);
      if (fresh[0]) setSelectedLeadId(fresh[0].id);
      setMessage(
        fresh.length
          ? `Found ${fresh.length} new lead${fresh.length === 1 ? "" : "s"} for ${app.name}.`
          : `Scan finished for ${app.name}. No new high-intent posts.`,
      );
      setTab("inbox");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function scanSelectedOrAll() {
    const targets =
      selectedAppId === "all"
        ? apps
        : apps.filter((a) => a.id === selectedAppId);
    if (!targets.length) {
      setError("Add an app first, then run a scan.");
      setTab("apps");
      return;
    }
    for (const app of targets) {
      await scanApp(app);
    }
  }

  async function createApp(seed = false) {
    const source = seed
      ? SAMPLE_APP
      : {
          name: appForm.name.trim(),
          description: appForm.description.trim(),
          storeUrl: appForm.storeUrl.trim(),
          keywords: linesToList(appForm.keywords),
          subreddits: linesToList(appForm.subreddits).map((s) =>
            s.replace(/^\/?r\//, ""),
          ),
        };

    if (!source.name) {
      setError("App name is required.");
      return;
    }

    const app: TrackedApp = {
      id: uid(),
      ...source,
      createdAt: new Date().toISOString(),
    };
    const next = [app, ...apps];
    await persistApps(next);
    setSelectedAppId(app.id);
    setAppForm({
      name: "",
      description: "",
      storeUrl: "",
      keywords: "",
      subreddits: "",
    });
    setMessage(`Added ${app.name}.`);
    setError(null);
  }

  async function deleteApp(id: string) {
    const next = apps.filter((a) => a.id !== id);
    await persistApps(next);
    const nextLeads = leads.filter((l) => l.appId !== id);
    await persistLeads(nextLeads);
    if (selectedAppId === id) setSelectedAppId("all");
  }

  async function updateLeadStatus(id: string, status: LeadStatus) {
    const next = leads.map((l) => (l.id === id ? { ...l, status } : l));
    await persistLeads(next);
  }

  async function draftReply() {
    if (!selectedLead || !settings) return;
    const app = apps.find((a) => a.id === selectedLead.appId);
    if (!app) {
      setError("This lead’s app was deleted.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      requireDesktop();
      const result = await invoke<GenerateReplyResult>("generate_reply", {
        request: {
          appName: app.name,
          appDescription: app.description,
          storeUrl: app.storeUrl,
          postTitle: selectedLead.title,
          postBody: selectedLead.body,
          subreddit: selectedLead.subreddit,
          openaiApiKey: settings.openaiApiKey || null,
        },
      });
      setDraft(result.reply);
      const next = leads.map((l) =>
        l.id === selectedLead.id
          ? { ...l, draftReply: result.reply, draftSource: result.source }
          : l,
      );
      await persistLeads(next);
      setMessage(
        result.source === "openai"
          ? "Drafted with OpenAI."
          : "Drafted with the local template.",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyDraft() {
    if (!draft.trim()) return;
    await navigator.clipboard.writeText(draft);
    setMessage("Reply copied.");
  }

  async function openThread() {
    if (!selectedLead) return;
    if (isTauri()) {
      await openUrl(selectedLead.permalink);
    } else {
      window.open(selectedLead.permalink, "_blank", "noopener,noreferrer");
    }
  }

  async function saveSettingsForm() {
    if (!settings) return;
    await saveSettings(settings);
    setMessage("Settings saved locally on this computer.");
    setError(null);
  }

  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? "Deleted app";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            App<span>Scout</span>
          </div>
          <div className="brand-sub">
            Find Reddit threads where people need your app. Draft a reply. Post it yourself.
          </div>
        </div>
        <nav className="nav">
          <button className={tab === "inbox" ? "active" : ""} onClick={() => setTab("inbox")}>
            Inbox
          </button>
          <button className={tab === "apps" ? "active" : ""} onClick={() => setTab("apps")}>
            Apps
          </button>
          <button
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            Settings
          </button>
        </nav>
        <div className="sidebar-foot">
          Keys and drafts stay on your machine. AppScout never auto-posts to Reddit.
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>
              {tab === "inbox" ? "Lead inbox" : tab === "apps" ? "Your apps" : "Settings"}
            </h1>
            <p>
              {tab === "inbox"
                ? "Ranked by intent. Generate a reply, copy it, open the thread."
                : tab === "apps"
                  ? "Each app gets its own keywords, subreddits, and scan."
                  : "Bring your own Reddit API app and optional OpenAI key."}
            </p>
          </div>
          <div className="topbar-actions">
            {tab === "inbox" && (
              <button className="btn btn-accent" disabled={busy} onClick={scanSelectedOrAll}>
                {busy ? "Scanning…" : "Scan Reddit"}
              </button>
            )}
            {tab === "apps" && (
              <button className="btn btn-ghost" onClick={() => createApp(true)}>
                Add AppointMe sample
              </button>
            )}
          </div>
        </header>

        {error && <div className="banner">{error}</div>}
        {message && !error && <div className="banner ok">{message}</div>}

        <div className="content">
          {tab === "inbox" && (
            <>
              <div className="filters">
                <select
                  className="select-like"
                  value={selectedAppId}
                  onChange={(e) => setSelectedAppId(e.target.value)}
                >
                  <option value="all">All apps</option>
                  {apps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select
                  className="select-like"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "all")}
                >
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="saved">Saved</option>
                  <option value="replied">Replied</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>

              {!filteredLeads.length ? (
                <div className="panel empty">
                  <strong>No leads yet</strong>
                  Add an app, put Reddit credentials in Settings, then hit Scan Reddit.
                </div>
              ) : (
                <div className="inbox-layout">
                  <div className="panel lead-list">
                    {filteredLeads.map((lead) => (
                      <button
                        key={lead.id}
                        className={`lead-item ${selectedLeadId === lead.id ? "active" : ""}`}
                        onClick={() => setSelectedLeadId(lead.id)}
                      >
                        <div className="lead-item-top">
                          <span className="pill pill-score">{lead.intentScore}</span>
                          <span className="pill pill-tag">{lead.intentTag}</span>
                          <span className="pill pill-status">{lead.status}</span>
                        </div>
                        <div className="lead-title">{lead.title}</div>
                        <div className="lead-meta">
                          r/{lead.subreddit} · u/{lead.author} · {formatAge(lead.createdUtc)} ·{" "}
                          {appName(lead.appId)}
                        </div>
                      </button>
                    ))}
                  </div>

                  {selectedLead && (
                    <div className="panel detail">
                      <div className="lead-item-top">
                        <span className="pill pill-score">intent {selectedLead.intentScore}</span>
                        <span className="pill pill-tag">{selectedLead.intentTag}</span>
                      </div>
                      <h2>{selectedLead.title}</h2>
                      <div className="lead-meta">
                        r/{selectedLead.subreddit} · u/{selectedLead.author} ·{" "}
                        {selectedLead.numComments} comments · {appName(selectedLead.appId)}
                      </div>
                      <div className="detail-body">
                        {selectedLead.body.trim() || "(no post body)"}
                      </div>

                      <div className="reply-box">
                        <div className="field">
                          <label>Draft reply</label>
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="Generate a reply, then edit before you post."
                          />
                        </div>
                        <div className="reply-actions">
                          <button className="btn btn-accent" disabled={busy} onClick={draftReply}>
                            Generate reply
                          </button>
                          <button className="btn btn-primary" onClick={copyDraft}>
                            Copy
                          </button>
                          <button className="btn btn-ghost" onClick={openThread}>
                            Open thread
                          </button>
                          <button
                            className="btn btn-ghost"
                            onClick={() => updateLeadStatus(selectedLead.id, "replied")}
                          >
                            Mark replied
                          </button>
                          <button
                            className="btn btn-ghost"
                            onClick={() => updateLeadStatus(selectedLead.id, "saved")}
                          >
                            Save
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => updateLeadStatus(selectedLead.id, "skipped")}
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "apps" && (
            <div style={{ display: "grid", gap: 18 }}>
              <div className="panel" style={{ padding: 22 }}>
                <div className="form-grid">
                  <div className="field">
                    <label>App name</label>
                    <input
                      value={appForm.name}
                      onChange={(e) => setAppForm({ ...appForm, name: e.target.value })}
                      placeholder="AppointMe Tracker"
                    />
                  </div>
                  <div className="field">
                    <label>What problem it solves</label>
                    <textarea
                      value={appForm.description}
                      onChange={(e) =>
                        setAppForm({ ...appForm, description: e.target.value })
                      }
                      placeholder="Offline appointment + credential hours tracker for clinicians and students"
                    />
                  </div>
                  <div className="field">
                    <label>Store or landing URL</label>
                    <input
                      value={appForm.storeUrl}
                      onChange={(e) => setAppForm({ ...appForm, storeUrl: e.target.value })}
                      placeholder="https://…"
                    />
                  </div>
                  <div className="field">
                    <label>Keywords (comma or new line)</label>
                    <textarea
                      value={appForm.keywords}
                      onChange={(e) => setAppForm({ ...appForm, keywords: e.target.value })}
                      placeholder={'track practicum hours\nsupervision hours log'}
                    />
                  </div>
                  <div className="field">
                    <label>Subreddits</label>
                    <textarea
                      value={appForm.subreddits}
                      onChange={(e) => setAppForm({ ...appForm, subreddits: e.target.value })}
                      placeholder={"socialwork\ntherapists\nBCBA"}
                    />
                  </div>
                  <div>
                    <button className="btn btn-primary" onClick={() => createApp(false)}>
                      Save app
                    </button>
                  </div>
                </div>
              </div>

              <div className="apps-grid">
                {apps.map((app) => (
                  <div className="panel app-card" key={app.id}>
                    <h3>{app.name}</h3>
                    <p>{app.description || "No description yet."}</p>
                    <div className="chip-row">
                      {app.keywords.slice(0, 4).map((k) => (
                        <span className="chip" key={k}>
                          {k}
                        </span>
                      ))}
                    </div>
                    <div className="reply-actions">
                      <button
                        className="btn btn-accent"
                        disabled={busy}
                        onClick={() => scanApp(app)}
                      >
                        Scan
                      </button>
                      <button className="btn btn-danger" onClick={() => deleteApp(app.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "settings" && settings && (
            <div className="panel" style={{ padding: 22, maxWidth: 720 }}>
              <div className="form-grid">
                <div className="field">
                  <label>Reddit client ID</label>
                  <input
                    value={settings.redditClientId}
                    onChange={(e) =>
                      setSettings({ ...settings, redditClientId: e.target.value })
                    }
                    placeholder="From reddit.com/prefs/apps"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label>Reddit client secret</label>
                  <input
                    type="password"
                    value={settings.redditClientSecret}
                    onChange={(e) =>
                      setSettings({ ...settings, redditClientSecret: e.target.value })
                    }
                    placeholder="App secret"
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label>OpenAI API key (optional)</label>
                  <input
                    type="password"
                    value={settings.openaiApiKey}
                    onChange={(e) =>
                      setSettings({ ...settings, openaiApiKey: e.target.value })
                    }
                    placeholder="Leaves blank = local template drafts"
                    autoComplete="off"
                  />
                </div>
                <p className="lead-meta">
                  Create a Reddit app at{" "}
                  <strong>reddit.com/prefs/apps</strong> → “create another app” → type{" "}
                  <strong>script</strong>. Redirect URI can be{" "}
                  <code>http://localhost</code>.
                </p>
                <div>
                  <button className="btn btn-primary" onClick={saveSettingsForm}>
                    Save settings
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
