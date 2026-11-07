import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildBackup,
  buildEgoPublishJob,
  buildPublishPack,
  downloadText,
  emptyPlatforms,
  fetchYouTubeStats,
  fmt,
  loadApiKey,
  loadData,
  parseBackup,
  parseYouTubeId,
  projectFromDraft,
  saveApiKey,
  saveData,
  skillsToMarkdown,
  statusLabel,
  today,
  uid,
} from "./lib";
import type { Account, Draft, Idea, Project, Skill, Status, WorkbenchData } from "./types";
import { Board, Calendar } from "./Views";
import { ProjectDetail, ProjectsList } from "./Projects";
import { WeeklyRadar } from "./WeeklyRadar";
import {
  Compass,
  Layers,
  Kanban,
  Calendar as CalendarIcon,
  Lightbulb,
  FileText,
  Users,
  BarChart3,
  Bookmark,
  Star,
  ExternalLink,
  ArrowRight,
  Download,
  Upload,
  Trash2,
  X,
  Search,
  Check,
  RefreshCw,
  Plus,
  Sun,
  Moon,
} from "lucide-react";

type Section =
  | "radar"
  | "projects"
  | "board"
  | "calendar"
  | "ideas"
  | "drafts"
  | "accounts"
  | "traffic"
  | "skills";

const PLATFORMS = ["all", "douyin", "xiaohongshu", "youtube", "tiktok", "instagram", "news"];
const EMPTY: WorkbenchData = { ideas: [], drafts: [], accounts: [], skills: [], projects: [], migratedDraftIds: [] };

export function App() {
  const [data, setData] = useState<WorkbenchData>(() => loadData());
  const [section, setSection] = useState<Section>("radar");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return (localStorage.getItem("creator-dashboard-theme") as "light" | "dark") || "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("creator-dashboard-theme", theme);
    } catch {}
  }, [theme]);

  const SECTIONS: Array<{ key: Section; label: string; sub: string; icon: typeof Compass }> = [
    { key: "radar", label: "素材雷达", sub: "Otus · 微信 · 日记聚合", icon: Compass },
    { key: "projects", label: "内容项目", sub: "全生命周期推进", icon: Layers },
    { key: "board", label: "创作看板", sub: "构思 → 录制 → 发布", icon: Kanban },
    { key: "calendar", label: "发布日历", sub: "排期规划 · 多端时间", icon: CalendarIcon },
    { key: "ideas", label: "灵感库", sub: "点子捕获 · 来源记录", icon: Lightbulb },
    { key: "drafts", label: "文案草稿", sub: "双语脚本 · 发布包", icon: FileText },
    { key: "accounts", label: "社交账号", sub: "各平台主页直达", icon: Users },
    { key: "traffic", label: "流量统计", sub: "数据追踪 · YouTube 同步", icon: BarChart3 },
    { key: "skills", label: "技能沉淀", sub: "方法论库 · 导出 Markdown", icon: Bookmark },
  ];
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => saveData(data), [data]);

  const update = (patch: Partial<WorkbenchData>) => setData((d) => ({ ...d, ...patch }));
  const updateDrafts = (fn: (drafts: Draft[]) => Draft[]) => setData((d) => ({ ...d, drafts: fn(d.drafts) }));
  const saveProject = (p: Project) =>
    setData((d) => {
      const exists = d.projects.some((x) => x.id === p.id);
      return { ...d, projects: exists ? d.projects.map((x) => (x.id === p.id ? p : x)) : [p, ...d.projects] };
    });

  const counts: Record<Section, number> = {
    radar: 1,
    projects: data.projects.filter((p) => !p.archived).length,
    board: data.projects.filter((p) => !p.archived).length,
    calendar: data.projects.filter((p) => p.plannedDate).length,
    ideas: data.ideas.length,
    drafts: data.drafts.length,
    accounts: data.accounts.filter((a) => a.url).length,
    traffic: data.drafts.filter((d) => d.views > 0).length,
    skills: data.skills.length,
  };
  const selectedDraft = data.drafts.find((d) => d.id === selectedDraftId) ?? null;
  const selectedProject = data.projects.find((p) => p.id === selectedProjectId) ?? null;
  const selectedSkill = data.skills.find((s) => s.id === selectedSkillId) ?? null;

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const result = parseBackup(text);
    if (!result.ok) {
      alert(`导入失败: ${result.error}\n\n当前数据未发生任何改动。`);
      return;
    }
    if (!window.confirm("确定要用此备份覆盖当前所有数据吗？建议先导出备份。")) return;
    setData(result.data);
    setSelectedDraftId(null);
    setSelectedProjectId(null);
    notify("备份恢复成功");
  };

  return (
    <div className="layout">
      <aside aria-label="主导航">
        <div className="brand-header">
          <div className="brand-title">
            <span style={{ fontFamily: "var(--font-sans)" }}>创作者工作台</span>
            <span className="brand-badge">
              <span className="brand-dot" />
              本地优先
            </span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            ANTHROPIC / CLAUDE STYLE
          </p>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {SECTIONS.map((s) => {
            const IconComponent = s.icon;
            const isActive = section === s.key;
            return (
              <button
                key={s.key}
                type="button"
                className={`navbtn ${isActive ? "active" : ""}`}
                onClick={() => setSection(s.key)}
                aria-pressed={isActive}
                title={s.sub}
              >
                <span className="nav-main">
                  <IconComponent size={15} className="nav-icon" />
                  <span>{s.label}</span>
                </span>
                {counts[s.key] > 0 && <span className="nav-badge">{counts[s.key]}</span>}
              </button>
            );
          })}
        </nav>

        <p className="hint">
          工作流建议：素材雷达提炼本周事实 → 看板推进核心项目（选题 → 写稿 → 录制 → 剪辑 → 发布）→ 记录多端流量。所有数据保存在本地浏览器中，安全可控。
        </p>

        <div className="row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn ghost"
            style={{ fontSize: 11, padding: "5px 10px" }}
            onClick={() => downloadText(`creator-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`, buildBackup(data))}
          >
            <Download size={12} />
            <span>导出备份</span>
          </button>
          <button
            type="button"
            className="btn ghost"
            style={{ fontSize: 11, padding: "5px 10px" }}
            onClick={() => importRef.current?.click()}
          >
            <Upload size={12} />
            <span>导入备份</span>
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onImportFile(f);
            }}
          />
          <button
            type="button"
            className="btn ghost"
            style={{ fontSize: 11, padding: "5px 10px" }}
            onClick={() => {
              if (window.confirm("确定要清空所有数据吗？建议先导出备份。")) update(EMPTY);
            }}
          >
            <Trash2 size={12} />
            <span>清空</span>
          </button>
        </div>
      </aside>

      <main>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <h2>个人创作与心流工作台</h2>
            <p className="sub">系统记录事实沉淀 · 本周创作议题 · 双语多平台发布包</p>
          </div>
          <div className="row">
            <div style={{ position: "relative", width: 220 }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }} />
              <input
                aria-label="搜索"
                placeholder="搜索标题或关键词..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ paddingLeft: 28, margin: 0, height: 34, fontSize: 12.5 }}
              />
            </div>
            {/* 主题切换按钮 */}
            <button
              type="button"
              className="btn ghost"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
              style={{ padding: "7px 11px", height: 34 }}
            >
              {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
              <span style={{ fontSize: 12 }}>{theme === "light" ? "深色" : "浅色"}</span>
            </button>
          </div>
        </div>

        {section === "radar" && (
          <WeeklyRadar
            data={data}
            onAddProject={(p) => {
              saveProject(p);
              setSection("projects");
              setSelectedProjectId(p.id);
            }}
            notify={notify}
          />
        )}
        {section === "projects" && (
          <ProjectsList data={data} query={query} saveProject={saveProject} onOpen={setSelectedProjectId} notify={notify} />
        )}
        {section === "board" && (
          <Board projects={data.projects} saveProject={saveProject} onOpen={setSelectedProjectId} notify={notify} />
        )}
        {section === "calendar" && (
          <Calendar projects={data.projects} saveProject={saveProject} onOpen={setSelectedProjectId} />
        )}
        {section === "ideas" && (
          <Ideas
            data={data}
            query={query}
            update={update}
            onMoveToProject={(p) => {
              saveProject(p);
              setSection("projects");
              setSelectedProjectId(p.id);
            }}
          />
        )}
        {section === "drafts" && (
          <Drafts
            data={data}
            query={query}
            update={update}
            onOpen={setSelectedDraftId}
            onCreateProject={(d) => {
              const p = projectFromDraft(d);
              saveProject(p);
              update({ migratedDraftIds: [...data.migratedDraftIds, d.id] });
              setSection("projects");
              setSelectedProjectId(p.id);
              notify("已从草稿创建关联项目");
            }}
          />
        )}
        {section === "accounts" && <Accounts data={data} update={update} />}
        {section === "traffic" && (
          <Traffic
            data={data}
            update={update}
            updateDrafts={updateDrafts}
            onOpen={(id) => {
              setSection("drafts");
              setSelectedDraftId(id);
            }}
          />
        )}
        {section === "skills" && <Skills data={data} update={update} onOpen={setSelectedSkillId} />}
      </main>

      {selectedProject && (
        <ProjectDetail
          project={selectedProject}
          onClose={() => setSelectedProjectId(null)}
          onSave={(next) => saveProject(next)}
          onDelete={() => {
            setData((d) => ({ ...d, projects: d.projects.filter((x) => x.id !== selectedProject.id) }));
            setSelectedProjectId(null);
            notify("项目已删除");
          }}
          notify={notify}
        />
      )}
      {selectedDraft && (
        <DraftDetail
          draft={selectedDraft}
          onClose={() => setSelectedDraftId(null)}
          onSave={(next) =>
            update({ drafts: data.drafts.map((d) => (d.id === next.id ? { ...next, updatedAt: today() } : d)) })
          }
          onDelete={() => {
            update({ drafts: data.drafts.filter((d) => d.id !== selectedDraft.id) });
            setSelectedDraftId(null);
          }}
        />
      )}
      {selectedSkill && (
        <SkillDetail
          skill={selectedSkill}
          onClose={() => setSelectedSkillId(null)}
          onSave={(next) => update({ skills: data.skills.map((s) => (s.id === next.id ? next : s)) })}
          onDelete={() => {
            update({ skills: data.skills.filter((s) => s.id !== selectedSkill.id) });
            setSelectedSkillId(null);
          }}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

/* ── 灵感库 (Ideas) ── */
function Ideas({
  data,
  query,
  update,
  onMoveToProject,
}: {
  data: WorkbenchData;
  query: string;
  update: (p: Partial<WorkbenchData>) => void;
  onMoveToProject: (p: Project) => void;
}) {
  const [platform, setPlatform] = useState("all");
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [sourceNote, setSourceNote] = useState("");

  const visible = data.ideas.filter((i) => {
    if (platform !== "all" && i.platform !== platform) return false;
    if (query && !`${i.title} ${i.hook}`.includes(query)) return false;
    return true;
  });

  return (
    <section aria-label="灵感库">
      <div className="card">
        <h3>+ 记录新灵感</h3>
        <label>
          灵感标题
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：我连续深度测试了 7 天的某个 AI 工具" />
        </label>
        <label>
          一句话亮点 / Hook
          <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="抓人眼球的切入点或疑问" />
        </label>
        <div className="grid2">
          <label>
            首选平台
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p === "all" ? "全部平台" : p}
                </option>
              ))}
            </select>
          </label>
          <label>
            素材来源 / 备注
            <input value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} placeholder="视频链接、文章来源或聊天切片" />
          </label>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn"
            disabled={!title.trim()}
            onClick={() => {
              const idea: Idea = {
                id: uid(),
                title: title.trim(),
                hook: hook.trim(),
                platform: platform === "all" ? "youtube" : platform,
                sourceNote: sourceNote.trim(),
                views: null,
                likes: null,
                starred: false,
                createdAt: today(),
              };
              update({ ideas: [idea, ...data.ideas] });
              setTitle("");
              setHook("");
              setSourceNote("");
            }}
          >
            <Plus size={13} />
            <span>保存灵感</span>
          </button>
        </div>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        {PLATFORMS.map((p) => (
          <button
            key={p}
            type="button"
            className={`pill ${platform === p ? "active" : ""}`}
            onClick={() => setPlatform(p)}
          >
            {p === "all" ? "全部" : p}
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className="note">暂无灵感记录。在上方添加一个，或者直接在素材雷达中提炼。</p>}
      {visible.map((idea) => (
        <article key={idea.id} className="card">
          <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {idea.starred && <Star size={14} fill="var(--accent)" color="var(--accent)" />}
            <span>{idea.title}</span>
          </h3>
          <p>{idea.hook}</p>
          <p>
            <span className="tag accent">{idea.platform}</span> {idea.sourceNote}
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const project: Project = {
                  id: uid(),
                  title: idea.title,
                  summary: idea.hook,
                  status: "idea",
                  priority: idea.starred ? "high" : "medium",
                  tags: "",
                  audience: "",
                  plannedDate: "",
                  research: idea.sourceNote
                    ? [{ id: uid(), url: idea.sourceNote.startsWith("http") ? idea.sourceNote : "", source: "", note: idea.sourceNote }]
                    : [],
                  scriptZh: "",
                  scriptEn: "",
                  assets: [],
                  platforms: emptyPlatforms(),
                  views: 0,
                  likes: 0,
                  starred: idea.starred,
                  archived: false,
                  createdAt: today(),
                  updatedAt: today(),
                };
                update({ ideas: data.ideas.filter((i) => i.id !== idea.id) });
                onMoveToProject(project);
              }}
            >
              <span>转为内容项目</span>
              <ArrowRight size={13} />
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                update({ ideas: data.ideas.map((i) => (i.id === idea.id ? { ...i, starred: !i.starred } : i)) })
              }
            >
              <Star size={13} fill={idea.starred ? "currentColor" : "none"} />
              <span>{idea.starred ? "取消重点" : "重点标记"}</span>
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (window.confirm("确定要删除这条灵感吗？")) update({ ideas: data.ideas.filter((i) => i.id !== idea.id) });
              }}
            >
              <Trash2 size={13} />
              <span>删除</span>
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

/* ── 文案草稿 (Drafts) ── */
function Drafts({
  data,
  query,
  update,
  onOpen,
  onCreateProject,
}: {
  data: WorkbenchData;
  query: string;
  update: (p: Partial<WorkbenchData>) => void;
  onOpen: (id: string) => void;
  onCreateProject: (d: Draft) => void;
}) {
  const [filter, setFilter] = useState<"all" | "todo" | "done" | "starred">("all");
  const [title, setTitle] = useState("");
  const isDone = (d: Draft) => ["recorded", "editing", "final", "published"].includes(d.status);
  const visible = data.drafts.filter((d) => {
    if (filter === "todo" && isDone(d)) return false;
    if (filter === "done" && !isDone(d)) return false;
    if (filter === "starred" && !d.starred) return false;
    if (query && !`${d.title} ${d.summary} ${d.keywords}`.includes(query)) return false;
    return true;
  });
  const todo = data.drafts.filter((d) => !isDone(d)).length;

  return (
    <section aria-label="文案草稿">
      <div className="grid2">
        <div className="stat">
          <b>{todo}</b>
          <span>待录制 / 撰写中</span>
        </div>
        <div className="stat">
          <b>{data.drafts.length - todo}</b>
          <span>已完成 / 已发布</span>
        </div>
      </div>
      <div className="card">
        <h3>+ 新建草稿</h3>
        <div className="row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="草稿标题"
            style={{ flex: 1, minWidth: 200 }}
          />
          <button
            type="button"
            className="btn"
            disabled={!title.trim()}
            onClick={() => {
              const draft: Draft = {
                id: uid(),
                title: title.trim(),
                summary: "",
                scriptZh: "",
                scriptEn: "",
                status: "scripting",
                keywords: "",
                views: 0,
                likes: 0,
                starred: false,
                pack: null,
                createdAt: today(),
                updatedAt: today(),
              };
              update({ drafts: [draft, ...data.drafts] });
              setTitle("");
              onOpen(draft.id);
            }}
          >
            <Plus size={13} />
            <span>创建并编辑</span>
          </button>
        </div>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        {(["all", "todo", "done", "starred"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`pill ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "全部" : f === "todo" ? "待推进" : f === "done" ? "已完成" : "重点"}
          </button>
        ))}
      </div>
      {visible.length === 0 && <p className="note">暂无草稿，可从灵感库转入或在此新建。</p>}
      {visible.map((d) => (
        <article key={d.id} className="card">
          <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {d.starred && <Star size={14} fill="var(--accent)" color="var(--accent)" />}
            <span>{d.title}</span>
          </h3>
          <p>
            <span className="tag">{statusLabel(d.status)}</span>
            {d.pack ? <span className="tag accent">发布包就绪</span> : null}
            {d.trafficSource === "youtube" ? <span className="tag">自动追踪 · YouTube</span> : null}
            {!d.scriptEn.trim() ? <span className="tag">仅中文版</span> : null}
          </p>
          <p>{d.summary || "点击打开添加摘要与完整脚本"}</p>
          <p>
            <strong>{fmt(d.views)}</strong> 播放量 · <strong>{fmt(d.likes)}</strong> 点赞数
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn ghost" onClick={() => onOpen(d.id)}>
              <span>编辑正文脚本</span>
              <ArrowRight size={13} />
            </button>
            {!data.projects.some((p) => p.migratedFromDraftId === d.id) && (
              <button type="button" className="btn ghost" onClick={() => onCreateProject(d)}>
                <span>创建关联项目</span>
                <ArrowRight size={13} />
              </button>
            )}
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                update({ drafts: data.drafts.map((x) => (x.id === d.id ? { ...x, starred: !x.starred } : x)) })
              }
            >
              <Star size={13} fill={d.starred ? "currentColor" : "none"} />
            </button>
            {(d.scriptZh.trim() || d.scriptEn.trim()) && (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  update({ drafts: data.drafts.map((x) => (x.id === d.id ? { ...x, pack: buildPublishPack(x) } : x)) })
                }
              >
                {d.pack ? "重新生成发布包" : "生成发布包"}
              </button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

/* ── 社交账号 (Accounts) ── */
function Accounts({ data, update }: { data: WorkbenchData; update: (p: Partial<WorkbenchData>) => void }) {
  const [label, setLabel] = useState("");
  const [handle, setHandle] = useState("");
  const [url, setUrl] = useState("");
  return (
    <section aria-label="社交账号">
      <div className="card">
        <h3>+ 添加社交账号</h3>
        <div className="grid2">
          <label>
            平台名称
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例如：我的微信公众号 / YouTube" />
          </label>
          <label>
            账号 Handle / ID
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@yourname (可选)" />
          </label>
        </div>
        <label>
          主页直达链接
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        </label>
        <div className="row" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn"
            disabled={!label.trim()}
            onClick={() => {
              update({
                accounts: [
                  ...data.accounts,
                  { id: uid(), platform: label.trim(), label: label.trim(), handle: handle.trim(), url: url.trim() },
                ],
              });
              setLabel("");
              setHandle("");
              setUrl("");
            }}
          >
            <Plus size={13} />
            <span>保存账号</span>
          </button>
        </div>
      </div>
      <div className="grid2" style={{ marginTop: 14 }}>
        {data.accounts.map((a) => (
          <div key={a.id} className="card">
            <h3>{a.label}</h3>
            <p>{a.handle || (a.url ? "已配置直达链接" : "暂无链接")}</p>
            <div className="row" style={{ marginTop: 10 }}>
              {a.url && (
                <a className="btn ghost" href={a.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                  <span>打开主页</span>
                  <ExternalLink size={12} />
                </a>
              )}
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  const next = window.prompt("修改主页链接（留空清空）", a.url);
                  if (next !== null)
                    update({
                      accounts: data.accounts.map((x) => (x.id === a.id ? { ...x, url: next.trim() } : x)),
                    });
                }}
              >
                修改链接
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => update({ accounts: data.accounts.filter((x) => x.id !== a.id) })}
              >
                <Trash2 size={12} />
                <span>删除</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 流量与数据追踪 (Traffic: manual + YouTube auto) ── */
function Traffic({
  data,
  update,
  updateDrafts,
  onOpen,
}: {
  data: WorkbenchData;
  update: (p: Partial<WorkbenchData>) => void;
  updateDrafts: (fn: (drafts: Draft[]) => Draft[]) => void;
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = useState<"views" | "likes" | "recent">("views");
  const [apiKey, setApiKey] = useState(() => loadApiKey());
  const [keySaved, setKeySaved] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncAll, setSyncAll] = useState(false);
  const sorted = useMemo(() => {
    const arr = [...data.drafts];
    if (sort === "views") arr.sort((a, b) => b.views - a.views);
    else if (sort === "likes") arr.sort((a, b) => b.likes - a.likes);
    else arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return arr;
  }, [data.drafts, sort]);
  const totalViews = data.drafts.reduce((s, d) => s + d.views, 0);
  const totalLikes = data.drafts.reduce((s, d) => s + d.likes, 0);
  const youtubeDrafts = data.drafts.filter((d) => d.trafficSource === "youtube");

  const syncOne = async (draft: Draft) => {
    const videoId = parseYouTubeId(draft.videoUrl ?? "");
    if (!apiKey.trim()) {
      updateDrafts((ds) =>
        ds.map((x) =>
          x.id === draft.id ? { ...x, syncError: "请先在上方输入 YouTube Data API Key，再执行自动同步" } : x,
        ),
      );
      return;
    }
    if (!videoId) {
      updateDrafts((ds) =>
        ds.map((x) =>
          x.id === draft.id ? { ...x, syncError: "无法解析视频链接或 ID，支持 watch?v=、youtu.be 或 Shorts 格式" } : x,
        ),
      );
      return;
    }
    setSyncing(draft.id);
    try {
      const stats = await fetchYouTubeStats(apiKey.trim(), videoId);
      updateDrafts((ds) =>
        ds.map((x) =>
          x.id === draft.id
            ? { ...x, views: stats.views, likes: stats.likes, lastSyncedAt: today(), syncError: "", updatedAt: today() }
            : x,
        ),
      );
    } catch (err) {
      updateDrafts((ds) =>
        ds.map((x) => (x.id === draft.id ? { ...x, syncError: err instanceof Error ? err.message : "同步失败" } : x)),
      );
    } finally {
      setSyncing(null);
    }
  };

  const syncAllYoutube = async () => {
    if (youtubeDrafts.length === 0) return;
    setSyncAll(true);
    for (const draft of youtubeDrafts) {
      await syncOne(draft);
    }
    setSyncAll(false);
  };

  return (
    <section aria-label="流量与数据追踪">
      <div className="grid2">
        <div className="stat">
          <b>{fmt(totalViews)}</b>
          <span>总播放 / 浏览量</span>
        </div>
        <div className="stat">
          <b>{fmt(totalLikes)}</b>
          <span>总点赞数</span>
        </div>
      </div>

      <div className="card">
        <h3>多平台流量与 YouTube 自动同步</h3>
        <p>支持手动录入微信公众号、B站、小红书等平台数据；YouTube 视频支持配置 API Key 自动刷新官方播放与点赞数据。</p>
        <label>
          YouTube Data API Key (仅保存在本地浏览器)
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setKeySaved(false);
            }}
            placeholder="AIza... (在 Google Cloud 控制台启用 YouTube Data API v3 后生成)"
            autoComplete="off"
          />
        </label>
        <div className="row" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              saveApiKey(apiKey);
              setKeySaved(true);
            }}
          >
            保存 Key 到本地
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={syncAll || youtubeDrafts.length === 0}
            onClick={syncAllYoutube}
          >
            <RefreshCw size={13} className={syncAll ? "animate-spin" : ""} />
            <span>{syncAll ? "正在刷新全部..." : `一键刷新所有 YouTube 视频 (${youtubeDrafts.length} 个)`}</span>
          </button>
          {keySaved && (
            <span style={{ fontSize: 12, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Check size={12} />
              已本地保存，备份文件不包含敏感 Key
            </span>
          )}
        </div>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        {(["views", "likes", "recent"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`pill ${sort === k ? "active" : ""}`}
            onClick={() => setSort(k)}
          >
            {k === "views" ? "按播放量排序" : k === "likes" ? "按点赞数排序" : "按更新时间排序"}
          </button>
        ))}
      </div>

      {sorted.map((d) => {
        const linked = data.accounts.find((a) => a.id === d.accountId);
        return (
          <article key={d.id} className="card">
            <h3>{d.title}</h3>
            <p>
              <strong>{fmt(d.views)}</strong> 播放 · <strong>{fmt(d.likes)}</strong> 点赞 · {statusLabel(d.status)}
              <span className="tag accent">{d.trafficSource === "youtube" ? "自动同步 · YouTube" : "手动录入"}</span>
              {linked ? <span className="tag">关联账号: {linked.label}</span> : null}
            </p>
            <div className="grid2">
              <label>
                数据源方式
                <select
                  value={d.trafficSource ?? "manual"}
                  onChange={(e) =>
                    update({
                      drafts: data.drafts.map((x) =>
                        x.id === d.id
                          ? { ...x, trafficSource: e.target.value as Draft["trafficSource"], syncError: "" }
                          : x,
                      ),
                    })
                  }
                >
                  <option value="manual">手动输入</option>
                  <option value="youtube">自动同步 · YouTube</option>
                </select>
              </label>
              <label>
                关联发布账号 (可选)
                <select
                  value={d.accountId ?? ""}
                  onChange={(e) =>
                    update({
                      drafts: data.drafts.map((x) => (x.id === d.id ? { ...x, accountId: e.target.value } : x)),
                    })
                  }
                >
                  <option value="">未关联账号</option>
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                      {a.handle ? ` ${a.handle}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {d.trafficSource === "youtube" && (
              <>
                <label>
                  视频链接 / 视频 ID
                  <input
                    value={d.videoUrl ?? ""}
                    onChange={(e) =>
                      update({
                        drafts: data.drafts.map((x) =>
                          x.id === d.id ? { ...x, videoUrl: e.target.value, syncError: "" } : x,
                        ),
                      })
                    }
                    placeholder="https://www.youtube.com/watch?v=... 或 youtu.be/..."
                  />
                </label>
                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={syncing === d.id}
                    onClick={() => syncOne(d)}
                  >
                    <RefreshCw size={13} className={syncing === d.id ? "animate-spin" : ""} />
                    <span>{syncing === d.id ? "正在同步..." : "刷新此视频数据"}</span>
                  </button>
                  {d.lastSyncedAt && (
                    <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                      上次同步: {new Date(d.lastSyncedAt).toLocaleString("zh-CN")}
                    </span>
                  )}
                </div>
                {d.syncError && <p style={{ fontSize: 12, color: "var(--danger)" }}>{d.syncError}</p>}
              </>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <label style={{ flex: 1 }}>
                播放 / 阅读数
                <input
                  type="number"
                  min={0}
                  value={d.views}
                  onChange={(e) =>
                    update({
                      drafts: data.drafts.map((x) =>
                        x.id === d.id ? { ...x, views: Math.max(0, Number(e.target.value) || 0) } : x,
                      ),
                    })
                  }
                />
              </label>
              <label style={{ flex: 1 }}>
                点赞 / 喜欢数
                <input
                  type="number"
                  min={0}
                  value={d.likes}
                  onChange={(e) =>
                    update({
                      drafts: data.drafts.map((x) =>
                        x.id === d.id ? { ...x, likes: Math.max(0, Number(e.target.value) || 0) } : x,
                      ),
                    })
                  }
                />
              </label>
              <button type="button" className="btn ghost" onClick={() => onOpen(d.id)} style={{ alignSelf: "flex-end" }}>
                <span>打开草稿</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

/* ── 技能沉淀 (Skills) ── */
function Skills({
  data,
  update,
  onOpen,
}: {
  data: WorkbenchData;
  update: (p: Partial<WorkbenchData>) => void;
  onOpen: (id: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <section aria-label="技能沉淀">
      <div className="card">
        <h3>+ 新增技能方法论</h3>
        <div className="row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="技能名称，例如：Eva Video Style 录播口播 SOP"
            style={{ flex: 1, minWidth: 200 }}
          />
          <button
            type="button"
            className="btn"
            disabled={!name.trim()}
            onClick={() => {
              const s: Skill = {
                id: uid(),
                name: name.trim(),
                description: "",
                category: "general",
                status: "draft",
                tags: "",
                content: "",
                starred: false,
              };
              update({ skills: [s, ...data.skills] });
              setName("");
              onOpen(s.id);
            }}
          >
            <Plus size={13} />
            <span>创建并编辑</span>
          </button>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn ghost"
            onClick={() => downloadText("creator-dashboard-skills.md", skillsToMarkdown(data.skills))}
          >
            <Download size={13} />
            <span>导出为 skills.md</span>
          </button>
        </div>
      </div>
      {data.skills.map((s) => (
        <article key={s.id} className="card">
          <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {s.starred && <Star size={14} fill="var(--accent)" color="var(--accent)" />}
            <span>{s.name}</span>
          </h3>
          <p>
            <span className="tag accent">{s.status}</span> {s.tags}
          </p>
          <p>{s.description || "点击编辑详细内容与 Markdown 正文"}</p>
          <button type="button" className="btn ghost" onClick={() => onOpen(s.id)}>
            <span>编辑技能</span>
            <ArrowRight size={13} />
          </button>
        </article>
      ))}
    </section>
  );
}

/* ── 草稿详情编辑模态弹窗 ── */
function DraftDetail({
  draft,
  onClose,
  onSave,
  onDelete,
}: {
  draft: Draft;
  onClose: () => void;
  onSave: (d: Draft) => void;
  onDelete: () => void;
}) {
  const [d, setD] = useState(draft);
  useEffect(() => setD(draft), [draft.id]);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", overflowY: "auto", zIndex: 100 }} onClick={onClose}>
      <div className="card" style={{ maxWidth: 800, margin: "32px auto", padding: 28 }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2>编辑文案草稿</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            <X size={14} />
            <span>关闭</span>
          </button>
        </div>
        <label>
          草稿标题
          <input value={d.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label>
          一句话摘要 / Hook
          <input value={d.summary} onChange={(e) => set({ summary: e.target.value })} />
        </label>
        <div className="grid2">
          <label>
            当前状态
            <select value={d.status} onChange={(e) => set({ status: e.target.value as Status })}>
              {(["idea", "scripting", "recorded", "editing", "final", "published"] as Status[]).map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            关键词标签 (逗号分隔)
            <input value={d.keywords} onChange={(e) => set({ keywords: e.target.value })} />
          </label>
        </div>
        <label>
          中文脚本 / 公众号正文草稿
          <textarea value={d.scriptZh} onChange={(e) => set({ scriptZh: e.target.value })} placeholder="完整中文正文或口播提纲..." style={{ minHeight: 160 }} />
        </label>
        <label>
          英文脚本 (可选)
          <textarea value={d.scriptEn} onChange={(e) => set({ scriptEn: e.target.value })} placeholder="可选英文文案，不填保持为空..." />
        </label>

        <h3 style={{ marginTop: 24 }}>多平台分发包 (Publish Pack)</h3>
        <p className="note">分发包自动根据填写的脚本提取各平台标题、简介与标签，支持手动调整后发布。</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn"
            disabled={!d.scriptZh.trim() && !d.scriptEn.trim()}
            onClick={() => set({ pack: buildPublishPack(d) })}
          >
            {d.pack ? "重新生成发布包" : "生成发布包"}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              downloadText(`ego-lite-publish-${d.id}.json`, JSON.stringify(buildEgoPublishJob(d), null, 2));
            }}
          >
            <Download size={13} />
            <span>导出 Ego Lite 自动化分发 Job (.json)</span>
          </button>
          {d.pack && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                const p = d.pack!;
                const text = `【中文标题】${p.titleZh || "(空)"}\n【中文简介】${p.descZh || "(空)"}\n【英文标题】${p.titleEn || "(空)"}\n【英文简介】${p.descEn || "(空)"}\n【标签】${p.tags}`;
                navigator.clipboard?.writeText(text).catch(() => downloadText("publish-pack.txt", text));
                alert("发布包已复制到剪贴板");
              }}
            >
              复制发布包
            </button>
          )}
        </div>
        {d.pack && (
          <div style={{ marginTop: 14 }}>
            <label>
              中文发布标题
              <input value={d.pack.titleZh} onChange={(e) => set({ pack: { ...d.pack!, titleZh: e.target.value } })} />
            </label>
            <label>
              中文简介 / 摘要
              <textarea value={d.pack.descZh} onChange={(e) => set({ pack: { ...d.pack!, descZh: e.target.value } })} />
            </label>
            <label>
              英文发布标题
              <input value={d.pack.titleEn} onChange={(e) => set({ pack: { ...d.pack!, titleEn: e.target.value } })} />
            </label>
            <label>
              英文简介
              <textarea value={d.pack.descEn} onChange={(e) => set({ pack: { ...d.pack!, descEn: e.target.value } })} />
            </label>
            <label>
              标签 (Tags)
              <input value={d.pack.tags} onChange={(e) => set({ pack: { ...d.pack!, tags: e.target.value } })} />
            </label>
          </div>
        )}

        <div className="row" style={{ marginTop: 24 }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              onSave(d);
              onClose();
            }}
          >
            保存草稿
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (window.confirm("确定要删除这篇草稿吗？")) onDelete();
            }}
          >
            <Trash2 size={13} />
            <span>删除草稿</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 技能详情编辑模态弹窗 ── */
function SkillDetail({
  skill,
  onClose,
  onSave,
  onDelete,
}: {
  skill: Skill;
  onClose: () => void;
  onSave: (s: Skill) => void;
  onDelete: () => void;
}) {
  const [s, setS] = useState(skill);
  const set = (patch: Partial<Skill>) => setS((x) => ({ ...x, ...patch }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", overflowY: "auto", zIndex: 100 }} onClick={onClose}>
      <div className="card" style={{ maxWidth: 800, margin: "32px auto", padding: 28 }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2>编辑技能方法论</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            <X size={14} />
            <span>关闭</span>
          </button>
        </div>
        <label>
          技能名称
          <input value={s.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          简要说明
          <input value={s.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <div className="grid2">
          <label>
            分类
            <input value={s.category} onChange={(e) => set({ category: e.target.value })} />
          </label>
          <label>
            状态
            <select value={s.status} onChange={(e) => set({ status: e.target.value as Skill["status"] })}>
              <option value="draft">草稿</option>
              <option value="ready">就绪</option>
              <option value="published">已发布</option>
            </select>
          </label>
        </div>
        <label>
          标签 (逗号分隔)
          <input value={s.tags} onChange={(e) => set({ tags: e.target.value })} />
        </label>
        <label>
          Markdown 正文
          <textarea value={s.content} onChange={(e) => set({ content: e.target.value })} style={{ minHeight: 220 }} />
        </label>
        <div className="row" style={{ marginTop: 24 }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              onSave(s);
              onClose();
            }}
          >
            保存技能
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (window.confirm("确定要删除此技能吗？")) onDelete();
            }}
          >
            <Trash2 size={13} />
            <span>删除</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export type { Account };
