import { useMemo, useState } from "react";
import { addMonths, monthGrid, monthLabel, projectStatusLabel, publishedCount, toISODateLocal } from "./lib";
import type { Project, ProjectStatus } from "./types";
import { ChevronLeft, ChevronRight, ArrowRight, Calendar as CalendarIcon } from "lucide-react";

const COLUMNS: ProjectStatus[] = ["idea", "writing", "to-record", "editing", "ready-to-publish", "published"];

/* ── 看板视图 (Board) ── */
export function Board({
  projects,
  saveProject,
  onOpen,
  notify,
}: {
  projects: Project[];
  saveProject: (p: Project) => void;
  onOpen: (id: string) => void;
  notify: (msg: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const active = projects.filter((p) => !p.archived);
  const move = (p: Project, status: ProjectStatus) => {
    if (p.status === status) return;
    saveProject({ ...p, status });
    notify(`已流转至: ${projectStatusLabel(status)}`);
  };

  return (
    <section aria-label="创作看板">
      <p className="note">
        支持桌面端拖拽卡片在列间流转，也支持使用卡片上的“流转至”下拉菜单。所有变动实时同步至项目列表与日历。
      </p>
      <div className="board">
        {COLUMNS.map((col) => {
          const items = active.filter((p) => p.status === col);
          return (
            <div
              key={col}
              className="board-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const p = active.find((x) => x.id === dragId);
                if (p) move(p, col);
                setDragId(null);
              }}
            >
              <h4>
                {projectStatusLabel(col)} <span>({items.length})</span>
              </h4>
              {items.length === 0 && <p className="note">暂无项目 — 可拖拽卡片至此</p>}
              {items.map((p) => (
                <article
                  key={p.id}
                  className="board-card"
                  draggable
                  onDragStart={(e) => {
                    setDragId(p.id);
                    e.dataTransfer.setData("text/plain", p.id);
                  }}
                  onDragEnd={() => setDragId(null)}
                >
                  <b>{p.title}</b>
                  <p>
                    <span className="tag accent">优先级: {p.priority === "high" ? "高" : p.priority === "medium" ? "中" : "低"}</span>
                    <span className="tag">{p.plannedDate ? p.plannedDate : "未排期"}</span>
                    <span className="tag">已发 {publishedCount(p)}/5 端</span>
                  </p>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button type="button" className="btn ghost" onClick={() => onOpen(p.id)}>
                      <span>详情</span>
                      <ArrowRight size={12} />
                    </button>
                    <label style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>流转:</span>
                      <select
                        value={p.status}
                        style={{ width: "auto", marginTop: 0, padding: "3px 6px", fontSize: 11 }}
                        onChange={(e) => move(p, e.target.value as ProjectStatus)}
                      >
                        {COLUMNS.map((s) => (
                          <option key={s} value={s}>
                            {projectStatusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </article>
              ))}
            </div>
          );
        })}
      </div>
      <p className="note">已归档项目默认在看板中隐藏，可前往【01 // 内容项目】勾选“显示已归档”查看。</p>
    </section>
  );
}

/* ── 日历排期视图 (Calendar) ── */
export function Calendar({
  projects,
  saveProject,
  onOpen,
}: {
  projects: Project[];
  saveProject: (p: Project) => void;
  onOpen: (id: string) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [mode, setMode] = useState<"project" | "platform">("project");
  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const todayIso = toISODateLocal(now);
  const active = projects.filter((p) => !p.archived);

  const chipsFor = (iso: string): Array<{ key: string; label: string; project: Project }> => {
    if (mode === "project") {
      return active
        .filter((p) => p.plannedDate === iso)
        .map((p) => ({ key: p.id, label: p.title, project: p }));
    }
    const out: Array<{ key: string; label: string; project: Project }> = [];
    for (const p of active) {
      for (const [key, pack] of Object.entries(p.platforms)) {
        if (pack.scheduledTime && pack.scheduledTime.slice(0, 10) === iso) {
          out.push({ key: `${p.id}-${key}`, label: `${key.toUpperCase()} · ${p.title}`, project: p });
        }
      }
    }
    return out;
  };

  const go = (delta: number) => {
    const [y, m] = addMonths(year, month, delta);
    setYear(y);
    setMonth(m);
  };
  const unscheduled = active.filter((p) => !p.plannedDate);

  return (
    <section aria-label="发布日历">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CalendarIcon size={16} style={{ color: "var(--accent)" }} />
            <span>{monthLabel(year, month)}</span>
          </h3>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => go(-1)}>
              <ChevronLeft size={13} />
              <span>上月</span>
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setYear(now.getFullYear());
                setMonth(now.getMonth());
              }}
            >
              今天
            </button>
            <button type="button" className="btn ghost" onClick={() => go(1)}>
              <span>下月</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className={`pill ${mode === "project" ? "active" : ""}`}
            onClick={() => setMode("project")}
          >
            按项目发布日
          </button>
          <button
            type="button"
            className={`pill ${mode === "platform" ? "active" : ""}`}
            onClick={() => setMode("platform")}
          >
            按各平台独立排期
          </button>
        </div>
        <p className="note">
          {mode === "project"
            ? "显示各项目的总体计划发布日期。点击卡片可快速修改日期与正文。"
            : "显示各平台分发包的具体预约发送时间。"}
        </p>
      </div>

      <div className="cal">
        {["周日", "周一", "周二", "周三", "周四", "周五", "周六"].map((d) => (
          <div key={d} className="cal-head">
            {d}
          </div>
        ))}
        {cells.map((iso) => {
          const inMonth = iso.slice(0, 7) === `${year}-${String(month + 1).padStart(2, "0")}`;
          const chips = chipsFor(iso);
          return (
            <div
              key={iso}
              className={`cal-cell ${inMonth ? "" : "other"} ${iso === todayIso ? "today" : ""}`}
            >
              <span className="cal-day">{Number(iso.slice(8, 10))}</span>
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="cal-chip"
                  onClick={() => onOpen(c.project.id)}
                  title={c.label}
                >
                  {c.label}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <h3 style={{ marginTop: 24 }}>待排期项目 ({unscheduled.length})</h3>
      <p className="note">尚未设定计划发布日期的内容。可以在此快速选择日期，或进入项目详情设定。</p>
      {unscheduled.length === 0 && <p className="note">所有项目均已完成日期排期。</p>}
      {unscheduled.map((p) => (
        <article key={p.id} className="card">
          <h3>{p.title}</h3>
          <p>
            <span className="tag accent">{projectStatusLabel(p.status)}</span>
            <span className="tag">已发布 {publishedCount(p)}/5 平台</span>
          </p>
          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>排期设定:</span>
              <input
                type="date"
                value={p.plannedDate}
                style={{ width: "auto", marginTop: 0 }}
                onChange={(e) => saveProject({ ...p, plannedDate: e.target.value })}
              />
            </label>
            <button type="button" className="btn ghost" onClick={() => onOpen(p.id)}>
              <span>打开项目详情</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
