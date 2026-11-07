import type {
  AssetLink,
  Draft,
  PlatformKey,
  PlatformPack,
  Project,
  PublishPack,
  ResearchItem,
  WorkbenchData,
} from "./types";

export const STORAGE_KEY = "creator-workbench-v1";
/** Storage key is kept on purpose: renaming it would orphan existing browser data after the product rename. */
export const MIGRATION_BACKUP_KEY = "creator-dashboard-pre-migration-backup-v1";
/** Kept separate from the workbench backup on purpose: the backup export never includes the API key. */
export const SETTINGS_KEY = "creator-workbench-settings-v1";

export function loadApiKey(): string {
  try {
    return localStorage.getItem(SETTINGS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(key: string): void {
  localStorage.setItem(SETTINGS_KEY, key.trim());
}

/** Extract a YouTube video ID from a full URL, a Shorts/embed/live URL, or a bare ID. Returns null when it cannot be parsed. */
export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    const v = url.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.hostname.includes("youtu.be") && parts[0]) return parts[0];
    if ((parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") && parts[1]) return parts[1];
  } catch {
    return null;
  }
  return null;
}

export interface YouTubeStats {
  views: number;
  likes: number;
  comments: number;
}

/** Read public statistics for one YouTube video via the official Data API v3. Runs in the browser; the key goes only to Google, never to this app's server (there is none). */
export async function fetchYouTubeStats(apiKey: string, videoId: string): Promise<YouTubeStats> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Network request failed: check your connection, or confirm the browser is not blocking googleapis.com");
  }
  const json = (await res.json().catch(() => null)) as { items?: Array<{ statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>; error?: { message?: string } } | null;
  if (!res.ok) {
    const msg = json?.error?.message ?? `YouTube API returned ${res.status}`;
    if (res.status === 400) throw new Error(`Wrong API key or video ID: ${msg}`);
    if (res.status === 403) throw new Error(`API rejected (the key may not have YouTube Data API v3 enabled, or the daily quota may be used up): ${msg}`);
    throw new Error(msg);
  }
  const stats = json?.items?.[0]?.statistics;
  if (!stats) throw new Error("Video not found: confirm it is public and the link / ID is correct");
  return {
    views: Number(stats.viewCount ?? 0) || 0,
    likes: Number(stats.likeCount ?? 0) || 0,
    comments: Number(stats.commentCount ?? 0) || 0,
  };
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function today(): string {
  return new Date().toISOString();
}

/** Two clearly-labelled generic examples. Delete them in one click. No real scripts are shipped. */
export const EXAMPLE_DATA: WorkbenchData = {
  ideas: [
    {
      id: "example-idea-1",
      title: "Example: an AI tool I tested for 7 days",
      hook: "Example hook: lead with the conclusion, then 3 real use cases, then who it is not for.",
      platform: "youtube",
      sourceNote: "Example card: note the video / news link you found here so you can check the source later.",
      views: null,
      likes: null,
      starred: true,
      createdAt: today(),
    },
  ],
  drafts: [
    {
      id: "example-draft-1",
      title: "Example: an AI tool I tested for 7 days",
      summary: "Example summary: this one covers 3 uses and 1 pitfall of a tool, for beginners.",
      scriptZh: "Chinese script goes here (example — replace with your own script):\nParagraph 1: lead with the conclusion.\nParagraph 2: cover 3 scenarios.\nParagraph 3: say who it is not for, and end with a question for viewers.",
      scriptEn: "",
      status: "scripting",
      keywords: "example, AI tools",
      views: 0,
      likes: 0,
      starred: false,
      pack: null,
      createdAt: today(),
      updatedAt: today(),
    },
  ],
  accounts: [
    { id: "example-account-1", platform: "youtube", label: "YouTube", handle: "", url: "" },
    { id: "example-account-2", platform: "douyin", label: "Douyin", handle: "", url: "" },
    { id: "example-account-3", platform: "xiaohongshu", label: "RedNote", handle: "", url: "" },
    { id: "example-account-4", platform: "tiktok", label: "TikTok", handle: "", url: "" },
    { id: "example-account-5", platform: "instagram", label: "Instagram", handle: "", url: "" },
  ],
  skills: [
    {
      id: "example-skill-1",
      name: "Example Skill: Talking-head outline",
      description: "Example: write the text outline first, then render — text first, video second.",
      category: "video",
      status: "draft",
      tags: "talking-head, outline",
      content: "# Talking-head outline (example)\n\n1. Write the script and visuals for each segment\n2. Confirm before editing\n3. Leave uncertain segments blank — do not invent",
      starred: false,
    },
  ],
  projects: [],
  migratedDraftIds: [],
};

export function loadData(): WorkbenchData {
  const migrateLoaded = (data: WorkbenchData, snapshotRaw: string | null): WorkbenchData => {
    const result = migrateDraftsToProjects(data);
    if (result.migratedCount > 0 && snapshotRaw) ensurePreMigrationBackup(snapshotRaw);
    return result.data;
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return migrateLoaded(structuredClone(EXAMPLE_DATA), null);
    const parsed = JSON.parse(raw) as Partial<WorkbenchData>;
    if (!parsed || !Array.isArray(parsed.drafts)) return migrateLoaded(structuredClone(EXAMPLE_DATA), null);
    const base: WorkbenchData = {
      ideas: Array.isArray(parsed.ideas) ? parsed.ideas : [],
      // Backward compatibility: drafts saved by v0.1 have no traffic fields.
      drafts: parsed.drafts.map((d) => ({
        ...d,
        trafficSource: d.trafficSource ?? "manual",
        videoUrl: d.videoUrl ?? "",
        accountId: d.accountId ?? "",
        lastSyncedAt: d.lastSyncedAt ?? null,
        syncError: d.syncError ?? "",
      })),
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects.map(normalizeProject) : [],
      migratedDraftIds: Array.isArray(parsed.migratedDraftIds) ? parsed.migratedDraftIds : [],
    };
    return migrateLoaded(base, raw);
  } catch {
    return migrateLoaded(structuredClone(EXAMPLE_DATA), null);
  }
}

export function saveData(data: WorkbenchData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function fmt(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function statusLabel(status: Draft["status"]): string {
  const map: Record<Draft["status"], string> = {
    idea: "灵感构思",
    scripting: "文案撰写",
    recorded: "录制完毕",
    editing: "后期剪辑",
    final: "定稿就绪",
    published: "已发布",
  };
  return map[status];
}

/**
 * Build a publish pack from a draft's own script.
 *
 * Honest rule, kept on purpose:
 * - Only the language that actually has a script gets a title/description.
 * - A missing language stays blank. It is never auto-translated or filled in.
 * - The result is always a draft for you to edit, never auto-published.
 */
/**
 * Build a local-only Ego Lite publish job file from a draft.
 *
 * This does NOT publish anything and does NOT call Ego Lite.
 * Ego Lite is a macOS/Windows desktop browser tool (ego-browser skill);
 * it is not installed in this Linux workspace and this static workbench
 * has no backend, so a real publish can only run on a machine where
 * Ego Lite is installed and each platform is logged in.
 *
 * The job file is a handoff: an ego-browser agent on that Mac reads it,
 * fills in the finished video file and cover (the workbench stores no
 * video files), and MUST stop before the final publish click on each
 * platform for human confirmation — matching the manual-publish habit.
 * RedNote has no official publishing API; Douyin needs platform approval.
 */
export function buildEgoPublishJob(draft: Draft): Record<string, unknown> {
  return {
    tool: "ego-lite",
    version: "local-only-draft-v1",
    warning:
      "DRAFT ONLY — do not auto-publish. Stop before the final publish click on each platform and wait for human confirmation.",
    requires: {
      egoLite: "macOS or Windows, with ego-browser skill",
      platformsLoggedIn: ["douyin", "xiaohongshu", "youtube", "tiktok", "instagram", "facebook"],
      videoFile: "FILL IN on the Mac side — the workbench stores scripts only, not video files",
      coverFile: "FILL IN on the Mac side (optional)",
    },
    draft: {
      id: draft.id,
      title: draft.title,
      summary: draft.summary,
      status: draft.status,
      keywords: draft.keywords,
    },
    publishPack: draft.pack ?? null,
    scripts: {
      chinese: draft.scriptZh,
      english: draft.scriptEn,
    },
    exportedAt: new Date().toISOString(),
  };
}

export function buildPublishPack(draft: Draft): PublishPack {
  const firstLine = (text: string) => text.split("\n").map((s) => s.trim()).find(Boolean) ?? "";
  const zh = draft.scriptZh.trim();
  const en = draft.scriptEn.trim();
  return {
    titleZh: zh ? draft.title : "",
    descZh: zh ? `${draft.summary || firstLine(zh)}` : "",
    titleEn: en ? draft.title : "",
    descEn: en ? `${draft.summary || firstLine(en)}` : "",
    tags: draft.keywords,
  };
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function skillsToMarkdown(skills: typeof EXAMPLE_DATA.skills): string {
  const lines = ["# Skill Collection" + "\n"];
  for (const s of skills) {
    lines.push(`## ${s.name}\n\n${s.description}\n\n${s.content}\n`);
  }
  return lines.join("\n");
}

/* ── Projects (P0) ── */

export const PLATFORM_LIST: Array<{ key: PlatformKey; label: string }> = [
  { key: "x", label: "X" },
  { key: "douyin", label: "Douyin" },
  { key: "xiaohongshu", label: "Xiaohongshu" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
];

export const PROJECT_STATUS_KEYS = ["idea", "writing", "to-record", "editing", "ready-to-publish", "published"] as const;

export function projectStatusLabel(status: Project["status"]): string {
  const map: Record<Project["status"], string> = {
    idea: "灵感立项",
    writing: "文案撰写",
    "to-record": "待录视频",
    editing: "后期剪辑",
    "ready-to-publish": "准备发布",
    published: "已发布",
  };
  return map[status] ?? status;
}

export function emptyPlatformPack(): PlatformPack {
  return { title: "", body: "", hashtags: "", coverUrl: "", scheduledTime: "", status: "not-ready", publishedTime: "", publishedUrl: "" };
}

export function emptyPlatforms(): Record<PlatformKey, PlatformPack> {
  return { x: emptyPlatformPack(), douyin: emptyPlatformPack(), xiaohongshu: emptyPlatformPack(), tiktok: emptyPlatformPack(), youtube: emptyPlatformPack() };
}

export function newProject(partial: Partial<Project> = {}): Project {
  const now = today();
  return {
    id: uid(),
    title: "",
    summary: "",
    status: "idea",
    priority: "medium",
    tags: "",
    audience: "",
    plannedDate: "",
    research: [],
    scriptZh: "",
    scriptEn: "",
    assets: [],
    platforms: emptyPlatforms(),
    views: 0,
    likes: 0,
    starred: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function normalizePlatformPack(raw: unknown): PlatformPack {
  const p = (raw ?? {}) as Partial<PlatformPack>;
  const status = p.status === "ready" || p.status === "published" ? p.status : "not-ready";
  return {
    title: typeof p.title === "string" ? p.title : "",
    body: typeof p.body === "string" ? p.body : "",
    hashtags: typeof p.hashtags === "string" ? p.hashtags : "",
    coverUrl: typeof p.coverUrl === "string" ? p.coverUrl : "",
    scheduledTime: typeof p.scheduledTime === "string" ? p.scheduledTime : "",
    status,
    publishedTime: typeof p.publishedTime === "string" ? p.publishedTime : "",
    publishedUrl: typeof p.publishedUrl === "string" ? p.publishedUrl : "",
  };
}

/** Fill every missing field with a safe default so older or hand-edited saves never crash the UI. */
export function normalizeProject(raw: unknown): Project {
  const p = (raw ?? {}) as Partial<Project>;
  const platforms = emptyPlatforms();
  for (const { key } of PLATFORM_LIST) {
    platforms[key] = normalizePlatformPack((p.platforms as Partial<Record<PlatformKey, unknown>> | undefined)?.[key]);
  }
  const status = (PROJECT_STATUS_KEYS as readonly string[]).includes(p.status ?? "") ? (p.status as Project["status"]) : "idea";
  const priority = p.priority === "low" || p.priority === "high" ? p.priority : "medium";
  return {
    id: typeof p.id === "string" ? p.id : uid(),
    title: typeof p.title === "string" ? p.title : "",
    summary: typeof p.summary === "string" ? p.summary : "",
    status,
    legacyStatus: typeof p.legacyStatus === "string" ? p.legacyStatus : undefined,
    priority,
    tags: typeof p.tags === "string" ? p.tags : "",
    audience: typeof p.audience === "string" ? p.audience : "",
    plannedDate: typeof p.plannedDate === "string" ? p.plannedDate : "",
    research: Array.isArray(p.research) ? (p.research as ResearchItem[]).filter((r) => r && typeof r.id === "string") : [],
    scriptZh: typeof p.scriptZh === "string" ? p.scriptZh : "",
    scriptEn: typeof p.scriptEn === "string" ? p.scriptEn : "",
    assets: Array.isArray(p.assets) ? (p.assets as AssetLink[]).filter((a) => a && typeof a.id === "string") : [],
    platforms,
    views: typeof p.views === "number" ? p.views : 0,
    likes: typeof p.likes === "number" ? p.likes : 0,
    starred: p.starred === true,
    archived: p.archived === true,
    migratedFromDraftId: typeof p.migratedFromDraftId === "string" ? p.migratedFromDraftId : undefined,
    createdAt: typeof p.createdAt === "string" ? p.createdAt : today(),
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : today(),
  };
}

/** Legacy draft status → project pipeline status. The original is always kept in legacyStatus. */
export function mapDraftStatus(status: Draft["status"]): Project["status"] {
  switch (status) {
    case "idea": return "idea";
    case "scripting": return "writing";
    case "recorded": return "editing";
    case "editing": return "editing";
    case "final": return "ready-to-publish";
    case "published": return "published";
    default: return "idea";
  }
}

export function projectFromDraft(d: Draft): Project {
  const platforms = emptyPlatforms();
  // Prefill from the draft's own publish pack when one exists — never invented copy.
  // Chinese pack → Douyin / Xiaohongshu; English pack → X / TikTok / YouTube.
  // Statuses stay Not Ready: a published draft does not prove every platform published.
  if (d.pack) {
    for (const key of ["douyin", "xiaohongshu"] as const) {
      platforms[key].title = d.pack.titleZh;
      platforms[key].body = d.pack.descZh;
      platforms[key].hashtags = d.pack.tags;
    }
    for (const key of ["x", "tiktok", "youtube"] as const) {
      platforms[key].title = d.pack.titleEn;
      platforms[key].body = d.pack.descEn;
      platforms[key].hashtags = d.pack.tags;
    }
  }
  return {
    id: uid(),
    title: d.title,
    summary: d.summary,
    status: mapDraftStatus(d.status),
    legacyStatus: d.status,
    priority: d.starred ? "high" : "medium",
    tags: d.keywords,
    audience: "",
    plannedDate: "",
    research: [],
    scriptZh: d.scriptZh,
    scriptEn: d.scriptEn,
    assets: [],
    platforms,
    views: d.views,
    likes: d.likes,
    starred: d.starred,
    archived: false,
    migratedFromDraftId: d.id,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/**
 * One-way, idempotent draft → project migration. Drafts are kept (Traffic still
 * reads them); projects become the unified home. Re-running never duplicates:
 * a draft is skipped when its id is in migratedDraftIds or already linked.
 */
export function migrateDraftsToProjects(data: WorkbenchData): { data: WorkbenchData; migratedCount: number } {
  const seen = new Set<string>(data.migratedDraftIds);
  for (const p of data.projects) if (p.migratedFromDraftId) seen.add(p.migratedFromDraftId);
  const fresh: Project[] = [];
  for (const d of data.drafts) {
    if (seen.has(d.id)) continue;
    fresh.push(projectFromDraft(d));
    seen.add(d.id);
  }
  if (fresh.length === 0) return { data, migratedCount: 0 };
  return { data: { ...data, projects: [...fresh, ...data.projects], migratedDraftIds: [...seen] }, migratedCount: fresh.length };
}

/** Snapshot the pre-migration JSON once, so an upgrade can always be undone by re-importing it. */
export function ensurePreMigrationBackup(raw: string): void {
  try {
    if (!localStorage.getItem(MIGRATION_BACKUP_KEY)) {
      localStorage.setItem(MIGRATION_BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), raw }));
    }
  } catch {
    // Storage full or unavailable: migration still proceeds; the exportable backup remains available.
  }
}

export function publishedCount(project: Project): number {
  return PLATFORM_LIST.filter(({ key }) => project.platforms[key].status === "published").length;
}

/** Copy one platform's editable copy fields into another. Status and times never carry over. */
export function copyPlatformPackFields(from: PlatformPack, to: PlatformPack): PlatformPack {
  return { ...to, title: from.title, body: from.body, hashtags: from.hashtags, coverUrl: from.coverUrl };
}

/**
 * Organize existing project content into platform drafts. Only fills fields that
 * are still empty and never overwrites hand-edited copy. This is not AI
 * generation: title, summary, and tags are the project's own content.
 */
export function fillEmptyPlatformsFromProject(project: Project): Project {
  const platforms = { ...project.platforms };
  for (const { key } of PLATFORM_LIST) {
    const pack = platforms[key];
    platforms[key] = {
      ...pack,
      title: pack.title || project.title,
      body: pack.body || project.summary,
      hashtags: pack.hashtags || project.tags,
    };
  }
  return { ...project, platforms, updatedAt: today() };
}

export function platformPackToText(label: string, pack: PlatformPack): string {
  const lines = [
    `Title: ${pack.title || "(blank)"}`,
    `Body: ${pack.body || "(blank)"}`,
    `Hashtags: ${pack.hashtags || "(blank)"}`,
    pack.coverUrl ? `Cover: ${pack.coverUrl}` : "",
    pack.scheduledTime ? `Scheduled: ${pack.scheduledTime}` : "",
    `Status: ${pack.status}`,
    pack.publishedTime ? `Published: ${pack.publishedTime}` : "",
    pack.publishedUrl ? `Link: ${pack.publishedUrl}` : "",
  ].filter(Boolean);
  return `${label}\n${lines.join("\n")}`;
}

export function projectPackToMarkdown(project: Project): string {
  const out: string[] = [
    `# Publish pack — ${project.title}`,
    ``,
    `Summary: ${project.summary || "(blank)"}`,
    `Production status: ${projectStatusLabel(project.status)}`,
    `Planned date: ${project.plannedDate || "Unscheduled"}`,
    `Tags: ${project.tags || "(blank)"}`,
    `Published platforms: ${publishedCount(project)}/5`,
    ``,
  ];
  for (const { key, label } of PLATFORM_LIST) {
    const pack = project.platforms[key];
    out.push(`## ${label}`, ``);
    out.push(`Title: ${pack.title || "(blank)"}`, ``);
    out.push(pack.body || "(blank body)", ``);
    out.push(`Hashtags: ${pack.hashtags || "(blank)"}`);
    out.push(pack.coverUrl ? `Cover: ${pack.coverUrl}` : `Cover: (blank)`);
    out.push(pack.scheduledTime ? `Scheduled: ${pack.scheduledTime}` : `Scheduled: (not set)`);
    out.push(`Status: ${pack.status}`);
    if (pack.publishedTime) out.push(`Published: ${pack.publishedTime}`);
    if (pack.publishedUrl) out.push(`Link: ${pack.publishedUrl}`);
    out.push(``);
  }
  if (project.assets.length > 0) {
    out.push(`## Assets`, ``);
    for (const a of project.assets) out.push(`- ${a.kind}: ${a.url || "(no link)"}${a.note ? ` — ${a.note}` : ""}`);
    out.push(``);
  }
  if (project.research.length > 0) {
    out.push(`## Research`, ``);
    for (const r of project.research) out.push(`- ${r.source || "Source"}: ${r.url || "(no link)"}${r.note ? ` — ${r.note}` : ""}`);
    out.push(``);
  }
  out.push(`---`, `Draft pack from Creator Dashboard — edit by hand, then publish manually. This tool never posts to any platform for you.`);
  return out.join("\n");
}

/* ── Backup export / import ── */

export interface BackupFile {
  app: string;
  format: string;
  version: number;
  exportedAt: string;
  data: WorkbenchData;
}

export function buildBackup(data: WorkbenchData): string {
  const file: BackupFile = { app: "Creator Dashboard", format: "creator-dashboard-backup", version: 2, exportedAt: new Date().toISOString(), data };
  return JSON.stringify(file, null, 2);
}

export type BackupParseResult = { ok: true; data: WorkbenchData } | { ok: false; error: string };

export function parseBackup(text: string): BackupParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not valid JSON. Pick a creator-dashboard-backup.json file exported from this app." };
  }
  if (!json || typeof json !== "object") return { ok: false, error: "Backup must be a JSON object." };
  // Accept both the wrapped backup file and a bare data object.
  const data = (json as { data?: unknown }).data ?? json;
  if (!data || typeof data !== "object") return { ok: false, error: "No data found in this file." };
  const d = data as Partial<WorkbenchData>;
  for (const key of ["ideas", "drafts", "accounts", "skills", "projects"] as const) {
    if (d[key] !== undefined && !Array.isArray(d[key])) return { ok: false, error: `Section "${key}" must be a list.` };
  }
  for (const dr of d.drafts ?? []) {
    if (!dr || typeof dr.id !== "string" || typeof dr.title !== "string") return { ok: false, error: "A draft entry is missing its id or title." };
  }
  for (const p of d.projects ?? []) {
    if (!p || typeof p.id !== "string" || typeof p.title !== "string") return { ok: false, error: "A project entry is missing its id or title." };
    if (p.status !== undefined && !(PROJECT_STATUS_KEYS as readonly string[]).includes(p.status)) {
      return { ok: false, error: `Project "${p.title}" has an unknown status: ${String(p.status)}.` };
    }
  }
  const normalized: WorkbenchData = {
    ideas: d.ideas ?? [],
    drafts: (d.drafts ?? []).map((dr) => ({
      ...dr,
      trafficSource: dr.trafficSource ?? "manual",
      videoUrl: dr.videoUrl ?? "",
      accountId: dr.accountId ?? "",
      lastSyncedAt: dr.lastSyncedAt ?? null,
      syncError: dr.syncError ?? "",
    })),
    accounts: d.accounts ?? [],
    skills: d.skills ?? [],
    projects: (d.projects ?? []).map(normalizeProject),
    migratedDraftIds: Array.isArray(d.migratedDraftIds)
      ? d.migratedDraftIds
      : (d.projects ?? []).map((p) => p.migratedFromDraftId).filter((x): x is string => typeof x === "string"),
  };
  // A pre-P0 backup has drafts but no projects: migration runs here too, idempotently.
  return { ok: true, data: migrateDraftsToProjects(normalized).data };
}

/* ── Calendar helpers (local dates, Sunday-first weeks) ── */

export function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 42 cells (6 weeks) covering the month, Sunday first, including overflow days. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => toISODateLocal(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}

export function addMonths(year: number, month: number, delta: number): [number, number] {
  const d = new Date(year, month + delta, 1);
  return [d.getFullYear(), d.getMonth()];
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
