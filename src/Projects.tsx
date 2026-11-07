import { useEffect, useState } from "react";
import {
  PLATFORM_LIST,
  copyPlatformPackFields,
  downloadText,
  fillEmptyPlatformsFromProject,
  newProject,
  platformPackToText,
  projectPackToMarkdown,
  projectStatusLabel,
  publishedCount,
  today,
  uid,
} from "./lib";
import type { AssetKind, PlatformKey, Project, ProjectPriority, ProjectStatus, WorkbenchData } from "./types";
import {
  Star,
  ArrowRight,
  X,
  Plus,
  Trash2,
  Copy,
  Download,
  Archive,
  RotateCcw,
} from "lucide-react";

export function slugify(text: string, fallback: string): string {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || fallback;
}

/* ── 项目列表视图 (Projects list) ── */
export function ProjectsList({
  data,
  query,
  saveProject,
  onOpen,
  notify,
}: {
  data: WorkbenchData;
  query: string;
  saveProject: (p: Project) => void;
  onOpen: (id: string) => void;
  notify: (msg: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | ProjectPriority>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [title, setTitle] = useState("");

  const visible = data.projects.filter((p) => {
    if (!showArchived && p.archived) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (priorityFilter !== "all" && p.priority !== priorityFilter) return false;
    if (tagFilter && !p.tags.toLowerCase().includes(tagFilter.toLowerCase())) return false;
    if (query && !`${p.title} ${p.summary} ${p.tags}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  const active = data.projects.filter((p) => !p.archived);
  const unscheduled = active.filter((p) => !p.plannedDate).length;

  return (
    <section aria-label="内容项目列表">
      <div className="grid2">
        <div className="stat">
          <b>{active.length}</b>
          <span>活跃创作项目</span>
        </div>
        <div className="stat">
          <b>{unscheduled}</b>
          <span>待排期推进（未定发布日期）</span>
        </div>
      </div>

      <div className="card">
        <h3>+ 新建立项</h3>
        <div className="row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="项目标题，例如：折腾日记 W45 · 本地工作台串联实践"
            style={{ flex: 1, minWidth: 200 }}
          />
          <button
            type="button"
            className="btn"
            disabled={!title.trim()}
            onClick={() => {
              const p = newProject({ title: title.trim() });
              saveProject(p);
              setTitle("");
              onOpen(p.id);
              notify("项目已创建 — 请在详情中完善文案与发布包，然后保存");
            }}
          >
            <Plus size={13} />
            <span>创建并编辑</span>
          </button>
        </div>
      </div>

      <div className="card">
        <div className="grid2">
          <label>
            状态筛选
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | ProjectStatus)}
            >
              <option value="all">全部推进阶段</option>
              {(["idea", "writing", "to-record", "editing", "ready-to-publish", "published"] as ProjectStatus[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {projectStatusLabel(s)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            优先级筛选
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as "all" | ProjectPriority)}
            >
              <option value="all">全部优先级</option>
              <option value="high">高优先级 (High)</option>
              <option value="medium">普通 (Medium)</option>
              <option value="low">较低 (Low)</option>
            </select>
          </label>
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <label>
            按标签过滤
            <input
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="输入标签关键词过滤..."
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24 }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              style={{ width: "auto", margin: 0 }}
            />
            显示已归档项目
          </label>
        </div>
      </div>

      {visible.length === 0 && (
        <p className="note">暂无项目。可从上方新建立项，或前往【00 // 素材雷达】一键选定立项。</p>
      )}

      {visible.map((p) => (
        <article key={p.id} className="card">
          <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {p.starred && <Star size={14} fill="var(--accent)" color="var(--accent)" />}
            <span>
              {p.title}
              {p.archived ? " (已归档)" : ""}
            </span>
          </h3>
          <p>
            <span className="tag accent">{projectStatusLabel(p.status)}</span>
            <span className="tag">优先级: {p.priority === "high" ? "高" : p.priority === "medium" ? "中" : "低"}</span>
            <span className="tag">{p.plannedDate ? `计划排期: ${p.plannedDate}` : "未排期"}</span>
            <span className="tag">已发布平台: {publishedCount(p)}/5</span>
            {p.legacyStatus ? <span className="tag">历史草稿转换</span> : null}
          </p>
          <p>{p.summary || "点击打开添加摘要、长文正文、视频提纲与多平台分发包。"}</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn ghost" onClick={() => onOpen(p.id)}>
              <span>打开项目详情</span>
              <ArrowRight size={13} />
            </button>
            <label style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>流转:</span>
              <select
                value={p.status}
                style={{ width: "auto", marginTop: 0, padding: "5px 8px" }}
                onChange={(e) => {
                  saveProject({ ...p, status: e.target.value as ProjectStatus });
                  notify(`已流转至: ${projectStatusLabel(e.target.value as ProjectStatus)}`);
                }}
              >
                {(["idea", "writing", "to-record", "editing", "ready-to-publish", "published"] as ProjectStatus[]).map(
                  (s) => (
                    <option key={s} value={s}>
                      {projectStatusLabel(s)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                saveProject({ ...p, archived: !p.archived });
                notify(p.archived ? "项目已恢复" : "项目已归档");
              }}
            >
              {p.archived ? <RotateCcw size={12} /> : <Archive size={12} />}
              <span>{p.archived ? "恢复项目" : "归档"}</span>
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => saveProject({ ...p, starred: !p.starred })}
            >
              <Star size={13} fill={p.starred ? "currentColor" : "none"} />
              <span>{p.starred ? "取消重点" : "重点标记"}</span>
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

/* ── 项目详情编辑 (Project Detail Modal) ── */
export function ProjectDetail({
  project,
  onClose,
  onSave,
  onDelete,
  notify,
}: {
  project: Project;
  onClose: () => void;
  onSave: (p: Project) => void;
  onDelete: () => void;
  notify: (msg: string) => void;
}) {
  const [p, setP] = useState(project);
  useEffect(() => setP(project), [project.id]);
  const dirty = JSON.stringify(p) !== JSON.stringify(project);
  const set = (patch: Partial<Project>) => setP((x) => ({ ...x, ...patch }));
  const setPlatform = (key: PlatformKey, patch: Partial<Project["platforms"][PlatformKey]>) =>
    setP((x) => ({ ...x, platforms: { ...x.platforms, [key]: { ...x.platforms[key], ...patch } } }));

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const close = () => {
    if (dirty && !window.confirm("存在尚未保存的修改，确定直接离开吗？")) return;
    onClose();
  };

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(okMsg);
    } catch {
      downloadText("creator-dashboard-copy.txt", text);
      notify("已下载为文本文件");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(10px)",
        overflowY: "auto",
        zIndex: 100,
      }}
      onClick={close}
    >
      <div
        className="card"
        style={{ maxWidth: 860, margin: "28px auto", padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2>项目详情与文案编辑</h2>
          <button type="button" className="btn ghost" onClick={close}>
            <X size={14} />
            <span>关闭</span>
          </button>
        </div>
        {dirty && <p className="note" style={{ borderColor: "var(--accent)" }}>当前有未保存的改动，离开前请记得点击下方【保存修改】。</p>}

        <h3 style={{ marginTop: 20 }}>01 // 基础概览 (Overview)</h3>
        <label>
          项目标题
          <input value={p.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label>
          一句话摘要 / Hook
          <textarea
            value={p.summary}
            onChange={(e) => set({ summary: e.target.value })}
            placeholder="核心切入点与背景说明..."
            style={{ minHeight: 70 }}
          />
        </label>
        <div className="grid2">
          <label>
            推进阶段
            <select
              value={p.status}
              onChange={(e) => set({ status: e.target.value as ProjectStatus })}
            >
              {(["idea", "writing", "to-record", "editing", "ready-to-publish", "published"] as ProjectStatus[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {projectStatusLabel(s)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            优先级
            <select
              value={p.priority}
              onChange={(e) => set({ priority: e.target.value as ProjectPriority })}
            >
              <option value="high">高 (High)</option>
              <option value="medium">中 (Medium)</option>
              <option value="low">低 (Low)</option>
            </select>
          </label>
        </div>
        <div className="grid2">
          <label>
            标签 (逗号分隔)
            <input value={p.tags} onChange={(e) => set({ tags: e.target.value })} />
          </label>
          <label>
            目标受众
            <input
              value={p.audience}
              onChange={(e) => set({ audience: e.target.value })}
              placeholder="这篇内容是写给谁看的？"
            />
          </label>
        </div>
        <label>
          计划发布日期
          <input type="date" value={p.plannedDate} onChange={(e) => set({ plannedDate: e.target.value })} />
        </label>
        {p.legacyStatus && <p className="note">历史草稿转换项目 (原始状态: {p.legacyStatus})</p>}

        <h3 style={{ marginTop: 24 }}>02 // 调研素材与笔记 (Research)</h3>
        <p className="note">关联的 Obsidian 路径、参考链接或思考切片。</p>
        {p.research.map((r) => (
          <div key={r.id} className="card" style={{ marginTop: 8 }}>
            <label>
              来源链接 / Obsidian 路径
              <input
                value={r.url}
                onChange={(e) =>
                  set({
                    research: p.research.map((x) => (x.id === r.id ? { ...x, url: e.target.value } : x)),
                  })
                }
                placeholder="https://... 或 Weekly/2026-Wxx-Context.md"
              />
            </label>
            <div className="grid2">
              <label>
                来源类型
                <input
                  value={r.source}
                  onChange={(e) =>
                    set({
                      research: p.research.map((x) => (x.id === r.id ? { ...x, source: e.target.value } : x)),
                    })
                  }
                  placeholder="微信群聊、Otus 心流记录、日记..."
                />
              </label>
              <label>
                提取要点笔记
                <input
                  value={r.note}
                  onChange={(e) =>
                    set({
                      research: p.research.map((x) => (x.id === r.id ? { ...x, note: e.target.value } : x)),
                    })
                  }
                  placeholder="核心见解或可引用的论点"
                />
              </label>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => set({ research: p.research.filter((x) => x.id !== r.id) })}
              >
                <Trash2 size={12} />
                <span>移除此条</span>
              </button>
            </div>
          </div>
        ))}
        <div className="row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn ghost"
            onClick={() => set({ research: [...p.research, { id: uid(), url: "", source: "", note: "" }] })}
          >
            <Plus size={13} />
            <span>添加素材链接/笔记</span>
          </button>
        </div>

        <h3 style={{ marginTop: 24 }}>03 // 正文草稿与录制脚本 (Scripts)</h3>
        <p className="note">公众号长文正文与视频口播脚本在此编辑，支持双语分别维护。</p>
        <label>
          中文长文正文 / 视频口播脚本
          <textarea
            value={p.scriptZh}
            onChange={(e) => set({ scriptZh: e.target.value })}
            placeholder="正文草稿、论点展开、段落大纲..."
            style={{ minHeight: 180 }}
          />
        </label>
        <label>
          英文脚本 (可选)
          <textarea
            value={p.scriptEn}
            onChange={(e) => set({ scriptEn: e.target.value })}
            placeholder="英文翻译或出海文案 (留空则不生成英文发布包)..."
          />
        </label>

        <h3 style={{ marginTop: 24 }}>04 // 媒体与资产链接 (Assets)</h3>
        <p className="note">仅保存网盘、剪映工程或云端链接，本地不存储大体积视频文件。</p>
        {p.assets.map((a) => (
          <div key={a.id} className="card" style={{ marginTop: 8 }}>
            <div className="grid2">
              <label>
                资源类型
                <select
                  value={a.kind}
                  onChange={(e) =>
                    set({
                      assets: p.assets.map((x) => (x.id === a.id ? { ...x, kind: e.target.value as AssetKind } : x)),
                    })
                  }
                >
                  <option value="cover">封面图 (Cover)</option>
                  <option value="raw-video">原始录制视频 (Raw Video)</option>
                  <option value="srt">SRT 字幕文件</option>
                  <option value="final-video">成片视频 (Final Video)</option>
                  <option value="other">其他资产</option>
                </select>
              </label>
              <label>
                存储链接 / 路径
                <input
                  value={a.url}
                  onChange={(e) =>
                    set({
                      assets: p.assets.map((x) => (x.id === a.id ? { ...x, url: e.target.value } : x)),
                    })
                  }
                  placeholder="https://... 或本地文件路径"
                />
              </label>
            </div>
            <label>
              资产备注
              <input
                value={a.note}
                onChange={(e) =>
                  set({
                    assets: p.assets.map((x) => (x.id === a.id ? { ...x, note: e.target.value } : x)),
                  })
                }
                placeholder="分辨率、工程文件位置、版本号..."
              />
            </label>
            <div className="row" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => set({ assets: p.assets.filter((x) => x.id !== a.id) })}
              >
                <Trash2 size={12} />
                <span>移除</span>
              </button>
            </div>
          </div>
        ))}
        <div className="row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              set({ assets: [...p.assets, { id: uid(), kind: "other" as AssetKind, url: "", note: "" }] })
            }
          >
            <Plus size={13} />
            <span>添加媒体资产</span>
          </button>
        </div>

        <h3 style={{ marginTop: 24 }}>05 // 全平台分发包 (已发布 {publishedCount(p)}/5)</h3>
        <p className="note">支持独立维护 X, 抖音, 小红书, TikTok, YouTube 各自的标题、简介与标签，支持手动同步。</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setP(fillEmptyPlatformsFromProject(p));
              notify("已根据当前项目的标题、摘要和标签自动填充分发包空白字段");
            }}
          >
            从当前项目自动填充分发包
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              downloadText(`creator-dashboard-publish-pack-${slugify(p.title, p.id)}.md`, projectPackToMarkdown(p))
            }
          >
            <Download size={13} />
            <span>导出全套分发包 (.md)</span>
          </button>
        </div>

        {PLATFORM_LIST.map(({ key, label }) => {
          const pack = p.platforms[key];
          return (
            <div key={key} className="card" style={{ marginTop: 10 }}>
              <h3>
                {label} <span className="tag accent">{pack.status === "published" ? "已发布" : pack.status === "ready" ? "就绪" : "待准备"}</span>
                {pack.publishedUrl ? <span className="tag">已填发布链接</span> : null}
              </h3>
              <div className="grid2">
                <label>
                  发布状态
                  <select
                    value={pack.status}
                    onChange={(e) =>
                      setPlatform(key, {
                        status: e.target.value as Project["platforms"][PlatformKey]["status"],
                      })
                    }
                  >
                    <option value="not-ready">未准备 (Not Ready)</option>
                    <option value="ready">已就绪 (Ready)</option>
                    <option value="published">已发布 (Published)</option>
                  </select>
                </label>
                <label>
                  计划发布时间
                  <input
                    type="datetime-local"
                    value={pack.scheduledTime}
                    onChange={(e) => setPlatform(key, { scheduledTime: e.target.value })}
                  />
                </label>
              </div>
              <label>
                发布标题
                <input value={pack.title} onChange={(e) => setPlatform(key, { title: e.target.value })} />
              </label>
              <label>
                发布简介 / 正文
                <textarea
                  value={pack.body}
                  onChange={(e) => setPlatform(key, { body: e.target.value })}
                  style={{ minHeight: 90 }}
                />
              </label>
              <label>
                标签 (Hashtags)
                <input
                  value={pack.hashtags}
                  onChange={(e) => setPlatform(key, { hashtags: e.target.value })}
                  placeholder="#话题1 #话题2"
                />
              </label>
              <label>
                封面图链接 (Cover URL)
                <input
                  value={pack.coverUrl}
                  onChange={(e) => setPlatform(key, { coverUrl: e.target.value })}
                  placeholder="https://..."
                />
              </label>
              <div className="grid2">
                <label>
                  发布时间
                  <input
                    value={pack.publishedTime ? new Date(pack.publishedTime).toLocaleString("zh-CN") : ""}
                    readOnly
                    placeholder="标记已发布时自动生成"
                  />
                </label>
                <label>
                  最终发布链接
                  <input
                    value={pack.publishedUrl}
                    onChange={(e) => setPlatform(key, { publishedUrl: e.target.value })}
                    placeholder="https://... (发布后的落地页)"
                  />
                </label>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => copyText(platformPackToText(label, pack), `已复制 ${label} 发布文案`)}
                >
                  <Copy size={12} />
                  <span>一键复制 {label} 文案</span>
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    const fromKey = window.prompt(
                      `从哪个平台同步？请输入以下之一: ${PLATFORM_LIST.filter((x) => x.key !== key)
                        .map((x) => x.label)
                        .join(", ")}`,
                    );
                    const found = PLATFORM_LIST.find(
                      (x) => x.label.toLowerCase() === (fromKey ?? "").trim().toLowerCase(),
                    );
                    if (!found || found.key === key) {
                      if (fromKey !== null) notify("同步取消 — 未匹配到平台");
                      return;
                    }
                    setP((x) => ({
                      ...x,
                      platforms: {
                        ...x.platforms,
                        [key]: copyPlatformPackFields(x.platforms[found.key], x.platforms[key]),
                      },
                    }));
                    notify(`已从 ${found.label} 复制文案`);
                  }}
                >
                  从其他平台复制文案...
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const url = window.prompt("最终发布链接 (可选，留空直接标记)", pack.publishedUrl);
                    if (url === null) return;
                    setPlatform(key, {
                      status: "published",
                      publishedTime: new Date().toISOString(),
                      publishedUrl: url.trim(),
                    });
                    notify(`${label} 已标记为发布状态`);
                  }}
                >
                  标记为已发布
                </button>
              </div>
            </div>
          );
        })}

        <div className="row" style={{ marginTop: 24 }}>
          <button
            type="button"
            className="btn"
            disabled={!p.title.trim()}
            onClick={() => {
              onSave({ ...p, updatedAt: today() });
              notify("项目已保存");
              onClose();
            }}
          >
            保存修改
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              onSave({ ...p, archived: !p.archived, updatedAt: today() });
              notify(p.archived ? "项目已恢复" : "项目已归档");
              onClose();
            }}
          >
            <Archive size={13} />
            <span>{p.archived ? "恢复项目" : "归档项目"}</span>
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (window.confirm("确定要删除此项目吗？相关文案和发布包将被彻底删除。")) onDelete();
            }}
          >
            <Trash2 size={13} />
            <span>删除项目</span>
          </button>
        </div>
      </div>
    </div>
  );
}
