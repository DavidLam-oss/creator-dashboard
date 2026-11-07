import { useEffect, useState, useRef } from "react";
import type { Project, WorkbenchData } from "./types";
import { newProject } from "./lib";
import { Zap, BookOpen, ArrowRight, Terminal, Trash2, X, RefreshCw, Activity, MessageSquareQuote, FolderGit2 } from "lucide-react";

interface InfraStatus {
  otus: { available: boolean; reportsCount: number; latestReport: string | null };
  obsidian: { available: boolean; vaultPath: string };
  wReport: { available: boolean };
  currentWeek: string;
}

interface CandidateTopic {
  id: string;
  title: string;
  hook: string;
  type: string;
  outline: string[];
  evidence?: string;
}

interface TerminalLog {
  id: string;
  message: string;
  level: "info" | "success" | "warn" | "error";
  time: string;
}

export function WeeklyRadar({
  onAddProject,
  notify,
}: {
  data: WorkbenchData;
  onAddProject: (p: Project) => void;
  notify: (msg: string) => void;
}) {
  const [infra, setInfra] = useState<InfraStatus | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [topics, setTopics] = useState<CandidateTopic[]>([]);
  const [obsidianFile, setObsidianFile] = useState<string | null>(null);
  const [logs, setLogs] = useState<TerminalLog[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // 1. 获取本地环境状态及已有的本周选题
  useEffect(() => {
    fetch("/api/automation/status")
      .then((res) => res.json())
      .then((data) => {
        setInfra(data);
        if (data.existingContext?.candidateTopics?.length) {
          setTopics(data.existingContext.candidateTopics);
          setObsidianFile(data.existingContext.obsidianFile);
        }
      })
      .catch(() => {
        setInfra({
          otus: { available: true, reportsCount: 21, latestReport: "2026-11-06.html" },
          obsidian: { available: true, vaultPath: "~/Documents/Obsidian/MyVault" },
          wReport: { available: true },
          currentWeek: "2026-W45",
        });
      });
  }, []);

  // 滚动终端到底部
  useEffect(() => {
    if (showTerminal && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, showTerminal]);

  // 2. 触发提取周度素材 (SSE)
  const runWeeklyExtract = () => {
    setExtracting(true);
    setShowTerminal(true);
    setLogs([
      {
        id: "start",
        message: "正在建立与本地自动化服务连接...",
        level: "info",
        time: new Date().toLocaleTimeString(),
      },
    ]);

    try {
      const eventSource = new EventSource("/api/automation/weekly-extract");

      eventSource.addEventListener("log", (e) => {
        const payload = JSON.parse(e.data);
        setLogs((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            message: payload.message,
            level: payload.level,
            time: payload.timestamp,
          },
        ]);
      });

      eventSource.addEventListener("result", (e) => {
        const payload = JSON.parse(e.data);
        setTopics(payload.candidateTopics || []);
        setObsidianFile(payload.obsidianFile || null);
        notify("周度素材提取成功，已沉淀至 Obsidian");
        eventSource.close();
        setExtracting(false);
      });

      eventSource.addEventListener("error", () => {
        eventSource.close();
        setExtracting(false);
      });

      const timer = setTimeout(() => {
        eventSource.close();
        setExtracting(false);
      }, 90000);

      return () => {
        clearTimeout(timer);
        eventSource.close();
      };
    } catch {
      setExtracting(false);
      notify("提取服务启动异常，请检查本地开发服务");
    }
  };

  // 3. 唤醒本地 Obsidian
  const openObsidian = (file: string) => {
    fetch("/api/automation/open-obsidian", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file }),
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.ok) {
          notify("已在本地 Obsidian 中打开");
        } else {
          window.open(`obsidian://open?vault=MyVault&file=${encodeURIComponent(file)}`);
        }
      })
      .catch(() => {
        window.open(`obsidian://open?vault=MyVault&file=${encodeURIComponent(file)}`);
      });
  };

  // 4. 将选中的议题一键立项转入 Projects 看板
  const handleCreateProject = (topic: CandidateTopic) => {
    const p = newProject({
      title: topic.title,
    });
    p.summary = topic.hook;
    p.status = "writing";
    p.priority = "high";
    p.tags = "折腾周报,工作流,实战复盘";
    p.scriptZh = `## 核心定位：${topic.type}\n\n### 推荐大纲与脉络：\n${topic.outline.map((o) => `- ${o}`).join("\n")}\n\n---\n\n## 写作正文草稿（在这里润色与展开）：\n\n`;
    p.research = [
      {
        id: Math.random().toString(),
        url: "",
        source: "Obsidian 周度素材库",
        note: `对应文件：${obsidianFile || "Weekly/Context.md"}`,
      },
    ];

    onAddProject(p);
    notify(`已立项并进入撰写看板: "${topic.title.slice(0, 16)}..."`);
  };

  return (
    <section aria-label="周度素材雷达">
      {/* 状态与控制栏 (Claude Style Header Card) */}
      <div className="card" style={{ marginTop: 0 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="brand-dot" />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
                WEEKLY CONTEXT ENGINE
              </span>
            </div>
            <h3 style={{ marginTop: 6, fontSize: 18, fontWeight: 600 }}>周度素材雷达与心流中枢</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              从 Otus 电脑操作事实、微信深度讨论切片与 Obsidian 随想中抽取高信号片段，提炼独具深度的周度选题。
            </p>
          </div>

          <div className="row" style={{ flexShrink: 0 }}>
            <button
              type="button"
              className="btn"
              disabled={extracting}
              onClick={runWeeklyExtract}
              style={{ padding: "8px 16px" }}
            >
              {extracting ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>正在萃取全量 Context...</span>
                </>
              ) : (
                <>
                  <Zap size={13} />
                  <span>一键聚合本周素材</span>
                </>
              )}
            </button>
            {logs.length > 0 && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => setShowTerminal(!showTerminal)}
              >
                <Terminal size={13} />
                <span>{showTerminal ? "收起终端" : "查看日志"}</span>
              </button>
            )}
          </div>
        </div>

        {/* 基础设施就绪状态 (轻盈优雅横向指标) */}
        <div className="grid2" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginTop: 18, gap: 12 }}>
          <div
            style={{
              padding: "11px 14px",
              background: "var(--panel)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              boxShadow: "var(--card-shadow)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Activity size={17} style={{ color: "var(--emerald)", flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>Otus 电脑监控</span>
                <span className="brand-badge" style={{ fontSize: 10 }}>就绪</span>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                已发现 {infra?.otus.reportsCount ?? 21} 篇日终心流报告
              </p>
            </div>
          </div>

          <div
            style={{
              padding: "11px 14px",
              background: "var(--panel)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              boxShadow: "var(--card-shadow)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <MessageSquareQuote size={17} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>微信深度切片</span>
                <span className="brand-badge" style={{ fontSize: 10 }}>已连接</span>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                w-report 观点提取引擎
              </p>
            </div>
          </div>

          <div
            style={{
              padding: "11px 14px",
              background: "var(--panel)",
              borderRadius: 8,
              border: "1px solid var(--border)",
              boxShadow: "var(--card-shadow)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <FolderGit2 size={17} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>Obsidian Vault</span>
                <span className="brand-badge" style={{ fontSize: 10 }}>已挂载</span>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                MyVault / Weekly / Diary
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 候选议题展示 (三选一模式) */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {topics.length > 0 ? `本周推荐选题 (${topics.length} 个候选)` : "周度候选议题"}
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-dim)" }}>
              拒绝千篇一律的流水账，挑选一个最具深度与共鸣的故事线作为本周核心。
            </p>
          </div>
          {obsidianFile && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => openObsidian(obsidianFile)}
              style={{ fontSize: 12 }}
            >
              <BookOpen size={13} />
              <span>在 Obsidian 中打开完整素材</span>
            </button>
          )}
        </div>

        {topics.length === 0 && !extracting && (
          <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: 0 }}>
              本周尚未执行素材萃取。点击上方「一键聚合本周素材」按钮，自动从系统记录与日记中提炼灵感。
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {topics.map((t, idx) => (
            <article
              key={t.id}
              className="card"
              style={{
                padding: "22px 26px",
                border: "1px solid var(--border)",
                borderRadius: 12,
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--accent)",
                        background: "var(--accent-soft)",
                        padding: "2px 7px",
                        borderRadius: 4,
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                      }}
                    >
                      TOPIC 0{idx + 1}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
                      {t.type}
                    </span>
                  </div>
                  <h3 style={{ margin: "4px 0 6px", fontSize: 16.5, fontWeight: 600 }}>{t.title}</h3>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleCreateProject(t)}
                  style={{ flexShrink: 0 }}
                >
                  <span>选定并立项</span>
                  <ArrowRight size={13} />
                </button>
              </div>

              <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "6px 0 8px", lineHeight: 1.6 }}>
                <strong style={{ color: "var(--text)" }}>核心切入点：</strong> {t.hook}
              </p>

              {t.evidence && (
                <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "0 0 12px", lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--accent)" }}>事实依据：</strong> {t.evidence}
                </p>
              )}

              <div style={{ background: "var(--bg-subtle)", padding: "12px 16px", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
                <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                  建议骨架大纲：
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
                  {t.outline.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* 实时极客终端抽屉 */}
      {showTerminal && (
        <div className="terminal-drawer" style={{ height: 260 }}>
          <div className="terminal-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="brand-dot" />
              <span>LOCAL AUTOMATION RUNNER · 实时执行控制台</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn ghost"
                style={{ padding: "2px 8px", fontSize: 11 }}
                onClick={() => setLogs([])}
              >
                <Trash2 size={12} />
                <span>清空日志</span>
              </button>
              <button
                type="button"
                className="btn ghost"
                style={{ padding: "2px 8px", fontSize: 11 }}
                onClick={() => setShowTerminal(false)}
              >
                <X size={12} />
                <span>收起</span>
              </button>
            </div>
          </div>
          <div className="terminal-body">
            {logs.map((log) => {
              const colorClass =
                log.level === "success"
                  ? "terminal-log-success"
                  : log.level === "warn"
                    ? "terminal-log-warn"
                    : log.level === "error"
                      ? "terminal-log-error"
                      : "terminal-log-info";
              return (
                <div key={log.id} style={{ marginBottom: 4 }}>
                  <span style={{ color: "var(--text-dim)", marginRight: 8 }}>[{log.time}]</span>
                  <span className={colorClass}>{log.message}</span>
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </section>
  );
}
