import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec, execSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const HOME = os.homedir();
const OTUS_DIR = path.join(HOME, ".otus");
const OTUS_DB_PATH = path.join(OTUS_DIR, "data.db");
const OTUS_REPORTS_DIR = path.join(OTUS_DIR, "reports");
const OBSIDIAN_VAULT = path.join(HOME, "Documents/Obsidian/MyVault");
const OBSIDIAN_DIARY_DIR = path.join(OBSIDIAN_VAULT, "Diary/2026");
const W_REPORT_DIR = path.join(HOME, "Documents/GitHub/w-report");
const W_REPORT_BIN = path.join(W_REPORT_DIR, ".venv/bin/w-report");

const MAGPIE_URL = "http://127.0.0.1:3425/v1/chat/completions";
const MAGPIE_KEY = "magpie-local";
// 用户指定分组：智能路由（难题给强模型，简单的给便宜模型）
const MAGPIE_MODEL = "group/smart-router";

/** 获取当前是一年中的第几周 (ISO week) */
function getIsoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const year = d.getUTCFullYear();
  const weekStr = `${year}-W${String(weekNo).padStart(2, "0")}`;
  return { year, week: weekNo, weekStr };
}

/** 1. 深度读取 Otus SQLite 真实实操记录并按项目结构化归类 */
function queryOtusRealActivities(days = 7) {
  if (!fs.existsSync(OTUS_DB_PATH)) {
    return { summaries: [], sessions: [], projectGroups: {}, totalCount: 0 };
  }

  try {
    const db = new DatabaseSync(OTUS_DB_PATH, { readOnly: true });
    const sinceMs = Date.now() - days * 86400 * 1000;

    // 读取每日总结
    const summaryStmt = db.prepare(`
      SELECT date_key, summary 
      FROM activity_summaries 
      WHERE date_key != 'today' 
      ORDER BY date_key DESC 
      LIMIT ?
    `);
    const summaries = summaryStmt.all(days);

    // 读取真实实质折腾会话（包含描述、项目、高光）
    const sessionStmt = db.prepare(`
      SELECT 
        date(started_at/1000, 'unixepoch', 'localtime') as day,
        analysis_title,
        analysis_description,
        highlights,
        project,
        topics,
        entities
      FROM activity_sessions 
      WHERE started_at > ? 
        AND length(analysis_title) > 0
        AND analysis_title NOT LIKE '%锁屏%' 
        AND analysis_title NOT LIKE '%闲置%'
        AND analysis_title NOT LIKE '%空会话%'
      ORDER BY started_at DESC
      LIMIT 80
    `);
    const sessions = sessionStmt.all(sinceMs);

    // 按项目/领域分组聚合
    const projectGroups = {};
    for (const s of sessions) {
      let groupKey = s.project ? s.project.trim() : "系统工程与探索";
      // 归一化一些常见通用任务
      if (!s.project) {
        if (s.analysis_title.includes("uv") || s.analysis_title.includes("w-report MCP")) {
          groupKey = "系统权限与环境运维";
        } else if (s.analysis_title.includes("周度") || s.analysis_title.includes("工作流") || s.analysis_title.includes("自动化")) {
          groupKey = "周更内容流水线";
        } else if (s.analysis_title.includes("Browser Agent") || s.analysis_title.includes("Logo")) {
          groupKey = "browser-automation";
        }
      }

      if (!projectGroups[groupKey]) {
        projectGroups[groupKey] = [];
      }

      let parsedHighlights = [];
      try {
        parsedHighlights = JSON.parse(s.highlights || "[]");
      } catch {}

      projectGroups[groupKey].push({
        day: s.day,
        title: s.analysis_title,
        desc: s.analysis_description || "",
        highlights: parsedHighlights,
      });
    }

    return { summaries, sessions, projectGroups, totalCount: sessions.length };
  } catch (err) {
    console.error("[Otus DB Error]", err);
    return { summaries: [], sessions: [], projectGroups: {}, totalCount: 0 };
  }
}

/** 2. 深度抓取 w-report 技术社群真实讨论切片 */
function queryWReportDeepDiscussions() {
  if (!fs.existsSync(W_REPORT_BIN)) {
    return { recentSessions: [], discussions: [] };
  }
  try {
    // 1. 获取近期的活跃会话列表
    const sessionOut = execSync(`"${W_REPORT_BIN}" list-sessions --limit 50`, {
      encoding: "utf-8",
      timeout: 10000,
    });
    const lines = sessionOut
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // 严格过滤生活、家校、广告、亲友、买菜等日常噪音群
    const ignorePatterns = [
      "小三班", "禁言群", "通知", "班级", "业主", "宠粉", "福利", 
      "生活", "快递", "物业", "约会", "吃嘛嘛香", "挑战赛", "校友群", 
      "亲友", "相亲", "买菜", "团购", "保龄球"
    ];
    // 聚焦独立开发、技术构建、内容创作、AI工具链社群
    const techKeywords = [
      "Obsidian", "Vibe Writing", "Rap Hackathon", "Hackathon", "小龙虾", 
      "大肥鱼", "AI 编程", "AI 折腾", "出海", "克劳德", "书情", "We API", 
      "AI Life", "哥飞的朋友们", "DSH", "衣正元", "赫兹"
    ];

    const matchedSessions = [];
    for (const l of lines) {
      if (!l.includes("[group]")) continue;
      if (ignorePatterns.some((p) => l.includes(p))) continue;
      const m = l.match(/(\d{2}-\d{2}\s+\d{2}:\d{2})\s+\[group\]\s+(.*?)\s+\((.*?)\)/);
      if (m) {
        const [, time, name, id] = m;
        const isTech = techKeywords.some((kw) => name.toLowerCase().includes(kw.toLowerCase()));
        if (isTech) {
          matchedSessions.push({ time, name, id });
        }
      }
    }

    // 2. 深入抓取前 8 组高信号技术交流群的真实对话切片
    const discussions = [];
    const targetSessions = matchedSessions.slice(0, 8);

    for (const s of targetSessions) {
      try {
        const historyOut = execSync(`"${W_REPORT_BIN}" history "${s.id}" --days 7 --limit 30`, {
          encoding: "utf-8",
          timeout: 10000,
        });
        const data = JSON.parse(historyOut);
        const groupName = data.chat?.display_name || s.name;

        // 提取纯文本、引用回复 (quote)、文章分享 (link)
        const validMsgs = (data.messages || [])
          .map((m) => {
            let text = "";
            if (m.message_type?.base === "text") {
              text = m.content?.text?.text || "";
            } else if (m.message_type?.base === "quote") {
              const reply = m.content?.quote?.reply_text || m.content?.text?.text || "";
              let ref = m.content?.quote?.ref_text || "";
              ref = ref.replace(/<[^>]+>/g, "").slice(0, 30);
              text = ref ? `(回复「${ref}」) ${reply}` : reply;
            } else if (m.message_type?.base === "link") {
              const title = m.content?.link?.title || "";
              const desc = m.content?.link?.summary || "";
              text = `[分享文章] 《${title}》${desc ? " · " + desc.slice(0, 45) : ""}`;
            }

            text = text.replace(/<[^>]+>/g, "").replace(/\n+/g, " ").trim();
            const sender = m.sender?.is_self ? "我 (林大友)" : (m.sender?.display_name || "同行");
            return { sender, text };
          })
          .filter((m) => {
            return (
              m.text &&
              m.text.length >= 2 &&
              !m.text.startsWith("[小程序]") &&
              !m.text.startsWith("[表情]") &&
              !m.text.startsWith("<?xml")
            );
          });

        if (validMsgs.length > 0) {
          discussions.push({
            groupName,
            time: s.time,
            messages: validMsgs.slice(0, 15),
          });
        }
      } catch (e) {
        console.warn(`[w-report history error: ${s.name}]`, e.message);
      }
    }

    return {
      recentSessions: matchedSessions.map((s) => `[${s.time}] 💬 ${s.name}`),
      discussions,
    };
  } catch (err) {
    console.error("[w-report Exec Error]", err);
    return { recentSessions: [], discussions: [] };
  }
}

/** 3. 从 Obsidian Diary 读取本周主观思考（严格脱敏与过滤隐私） */
function queryObsidianDiary(days = 7) {
  if (!fs.existsSync(OBSIDIAN_DIARY_DIR)) {
    return [];
  }
  try {
    const files = fs
      .readdirSync(OBSIDIAN_DIARY_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, days);

    const entries = [];
    const sensitiveTags = ["夫妻记录", "私密", "隐私", "体检", "财务"];

    for (const f of files) {
      const fullPath = path.join(OBSIDIAN_DIARY_DIR, f);
      const content = fs.readFileSync(fullPath, "utf-8");

      // 隐私过滤：跳过包含私密标签的日记
      const isSensitive = sensitiveTags.some((tag) => content.includes(tag));
      if (isSensitive) continue;

      // 提取核心主线与思考
      const dateMatch = f.replace(".md", "");
      let excerpt = "";
      if (content.includes("## 🌅 今日主线")) {
        const parts = content.split("## 🌅 今日主线");
        excerpt = parts[1].split("##")[0].trim().slice(0, 300);
      } else {
        excerpt = content.slice(0, 250).replace(/\n/g, " ");
      }

      if (excerpt) {
        entries.push({ date: dateMatch, excerpt });
      }
    }
    return entries;
  } catch (err) {
    console.error("[Obsidian Diary Error]", err);
    return [];
  }
}

/** 4. 调用 Magpie 智能路由模型 (group/smart-router) 生成 3 个三角交织的深度选题 */
async function callMagpieSynthesizer(factsPayload) {
  const systemPrompt = `你是一名拥有极高审美与洞察力的资深技术独立开发者、公众号与视频主理人周度内容策划。
你的核心任务是：从该开发者本周的【Otus 研发实操】、【w-report 微信技术群讨论】与【Obsidian 脱敏日记】三大数据源中，提炼出 3 个最具共鸣与实战价值的周度创作议题。

【核心创作哲学 · 三角印证与深度化学反应】：
不要把三个源头割裂成单点孤岛！最好的独立开发者内容，永远是「事实 + 观点 + 心流」的三角交织：
- 【Obsidian 日记】提供真实的【主观情绪、痛点与困惑】（文章的灵魂与共鸣切入点）；
- 【Otus 电脑实操】提供扎实的【硬核代码、Bug排坑与工程证据】（文章的实操支撑与独家细节）；
- 【w-report 微信群】提供生动的【外部语境、同行碰撞与行业共识/争议】（文章的时代背景与普遍价值）。

【选题提炼要求】：
提炼 3 个不同视角切入的深度选题，每个选题都必须将上述三者融会贯通：
- 选题方向 A（偏工程认知与取舍）：将社群对产品上线的争议（如“打通全流程 vs 死磕100分”），与自己本周实际修过的 Bug / 重构细节（Otus），以及内心的完美主义困境（日记）深度结合；
- 选题方向 B（偏心流自省与做事方法）：将日记中“忙碌却觉得虚度/commit很多却没产出”的真实痛点，与 Otus 记录的数十个 session 操作数据，以及社群讨论的行业节奏深度印证，提炼出有解法的自我解剖；
- 选题方向 C（偏架构反思与前沿落地）：将同行对前沿技术/Agent/工具生态的讨论，与自己本周真实遭遇的环境排坑（如 macOS 权限守护、工具链打通），以及给企业培训时的被问困惑结合，输出有真金白银价值的深度长文。

【硬性要求】：
1. 标题必须反套路、有思想张力，绝不使用假大空的 AI 味道或自嗨流水账；
2. 大纲逻辑紧密递进（4~5 条），既有故事还原，又有代码实操，还有升华总结；
3. evidence 必须明确说明这篇选题是如何把【Otus 真实动作】+【微信群聊碰撞】+【日记心流反思】三者交织印证的。

输出必须是严格的纯 JSON 格式（无 markdown 代码块）：
{
  "topics": [
    {
      "id": "topic-1",
      "title": "...",
      "type": "深度复盘 · 工程取舍",
      "hook": "...",
      "outline": ["1. ...", "2. ...", "3. ...", "4. ...", "5. ..."],
      "evidence": "【日记心流】... + 【Otus实操】... + 【微信碰撞】..."
    },
    {
      "id": "topic-2",
      "title": "...",
      "type": "心流自省 · 效率破局",
      "hook": "...",
      "outline": ["1. ...", "2. ...", "3. ...", "4. ...", "5. ..."],
      "evidence": "【日记心流】... + 【Otus实操】... + 【微信碰撞】..."
    },
    {
      "id": "topic-3",
      "title": "...",
      "type": "架构反思 · 工具落地",
      "hook": "...",
      "outline": ["1. ...", "2. ...", "3. ...", "4. ...", "5. ..."],
      "evidence": "【日记心流】... + 【Otus实操】... + 【微信碰撞】..."
    }
  ]
}`;

  const payload = {
    model: MAGPIE_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `请基于下面本周三个维度的完整事实，提炼本周的 3 个候选选题：\n\n${factsPayload}` },
    ],
    temperature: 0.25,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(MAGPIE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MAGPIE_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Magpie HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    let rawContent = data.choices?.[0]?.message?.content || "";
    rawContent = rawContent.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(rawContent);
    return parsed.topics || [];
  } catch (err) {
    console.warn(`[Magpie ${MAGPIE_MODEL} failed: ${err.message}], fallback to fast-scan`);
    payload.model = "group/fast-scan";
    const fbRes = await fetch(MAGPIE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MAGPIE_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const fbData = await fbRes.json();
    let fbContent = fbData.choices?.[0]?.message?.content || "";
    fbContent = fbContent.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const fbParsed = JSON.parse(fbContent);
    return fbParsed.topics || [];
  } finally {
    clearTimeout(timeout);
  }
}

/** 从已存在的 Weekly Context 文件中解析已有选题 */
function parseExistingContext(weekStr) {
  const filePath = path.join(OBSIDIAN_VAULT, "Weekly", `${weekStr}-Context.md`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const topics = [];
    const topicBlocks = content.split(/### 议题 \d+：/);
    for (let i = 1; i < topicBlocks.length; i++) {
      const block = topicBlocks[i];
      const lines = block.split("\n");
      const title = lines[0].trim();
      let type = "";
      let hook = "";
      let evidence = "";
      const outline = [];
      let inOutline = false;

      for (const l of lines.slice(1)) {
        if (l.startsWith("## ")) break;
        if (l.includes("- **内容定位**：")) {
          type = l.replace("- **内容定位**：", "").replace(/[`*]/g, "").trim();
        } else if (l.includes("- **核心 Hook**：")) {
          hook = l.replace("- **核心 Hook**：", "").trim();
        } else if (l.includes("- **事实依据**：")) {
          evidence = l.replace("- **事实依据**：", "").trim();
        } else if (l.includes("- **推荐大纲架构**：")) {
          inOutline = true;
        } else if (inOutline) {
          const trimmed = l.trim();
          if (trimmed.startsWith("- ")) {
            outline.push(trimmed.replace(/^- /, "").trim());
          } else if (trimmed.startsWith("### ") || trimmed.startsWith("---")) {
            break;
          }
        }
      }

      if (title) {
        topics.push({
          id: `topic-${i}`,
          title,
          type: type || "创作议题",
          hook,
          outline,
          evidence,
        });
      }
    }
    return {
      obsidianFile: `Weekly/${weekStr}-Context.md`,
      candidateTopics: topics,
    };
  } catch (err) {
    console.error("[Parse Context Error]", err);
    return null;
  }
}

export function automationPlugin() {
  return {
    name: "vite-local-automation",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || "", `http://${req.headers.host}`);

        // 跨域支持 (允许从本地静态文件直接请求)
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        // 1. 检查各本地基础设施状态
        if (url.pathname === "/api/automation/status" && req.method === "GET") {
          const hasOtusDb = fs.existsSync(OTUS_DB_PATH);
          const hasObsidian = fs.existsSync(OBSIDIAN_VAULT);
          const hasWReport = fs.existsSync(W_REPORT_BIN);

          let otusReportCount = 0;
          if (fs.existsSync(OTUS_REPORTS_DIR)) {
            otusReportCount = fs.readdirSync(OTUS_REPORTS_DIR).filter((f) => f.endsWith(".html")).length;
          }

          const currentWeek = getIsoWeek().weekStr;
          const existingContext = parseExistingContext(currentWeek);

          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              otus: {
                available: hasOtusDb,
                reportsCount: otusReportCount,
                dbPath: OTUS_DB_PATH,
              },
              obsidian: {
                available: hasObsidian,
                vaultPath: OBSIDIAN_VAULT,
              },
              wReport: {
                available: hasWReport,
              },
              currentWeek,
              existingContext,
            }),
          );
          return;
        }

        // 2. 一键唤醒本地 Obsidian 打开文件
        if (url.pathname === "/api/automation/open-obsidian" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const data = JSON.parse(body || "{}");
              const filePath = data.file || "";
              const uri = `obsidian://open?vault=MyVault&file=${encodeURIComponent(filePath)}`;
              exec(`open "${uri}"`, (err) => {
                res.setHeader("Content-Type", "application/json");
                if (err) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ ok: false, error: err.message }));
                } else {
                  res.end(JSON.stringify({ ok: true, uri }));
                }
              });
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
            }
          });
          return;
        }

        // 3. SSE 实时流式深度萃取周度素材全景与智能选题
        if (url.pathname === "/api/automation/weekly-extract" && req.method === "GET") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          const sendEvent = (type, data) => {
            res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
          };

          const log = (msg, level = "info") => {
            sendEvent("log", { message: msg, level, timestamp: new Date().toLocaleTimeString() });
          };

          (async () => {
            try {
              log("[PIPELINE] 启动周度素材真理源与智能推导引擎 (group/smart-router)...", "info");
              const { weekStr } = getIsoWeek();

              // Step 1: 深度读取 Otus 项目与实操
              log("[OTUS 1/4] 连接本地 SQLite (~/.otus/data.db) 深度提取实操项目与技术排坑...", "info");
              const { summaries, sessions, projectGroups, totalCount } = queryOtusRealActivities(7);
              const projectCount = Object.keys(projectGroups).length;
              log(`[OTUS OK] 提取到 ${totalCount} 条实质会话，成功按 ${projectCount} 个研发项目/议题深度归类`, "success");

              // Step 2: 深度抓取 w-report 技术讨论切片
              log("[WECHAT 2/4] 调用 w-report CLI 深入提取核心技术群聊观点实录...", "info");
              const { recentSessions, discussions } = queryWReportDeepDiscussions();
              log(`[WECHAT OK] 成功提取到 ${discussions.length} 个技术群深度讨论实录与 ${recentSessions.length} 组活跃社群`, "success");

              // Step 3: 读取 Obsidian 真实脱敏日记
              log("[OBSIDIAN 3/4] 检索 Obsidian Diary 主观日记并执行脱敏...", "info");
              const diaryEntries = queryObsidianDiary(7);
              log(`[OBSIDIAN OK] 筛选出 ${diaryEntries.length} 篇技术主线随笔`, "success");

              // 组织富信息 Prompt 上下文
              let otusPromptText = "";
              for (const [proj, items] of Object.entries(projectGroups)) {
                otusPromptText += `#### 项目/领域: 【${proj}】 (${items.length} 条记录)\n`;
                for (const it of items.slice(0, 4)) {
                  otusPromptText += `- 动作: ${it.title}\n`;
                  if (it.desc) otusPromptText += `  细节: ${it.desc}\n`;
                  if (it.highlights && it.highlights.length > 0) {
                    otusPromptText += `  核心亮点: ${it.highlights.join("; ")}\n`;
                  }
                }
                otusPromptText += "\n";
              }

              let wechatPromptText = "";
              for (const disc of discussions) {
                wechatPromptText += `#### 群聊: 【${disc.groupName}】真实讨论要点:\n`;
                for (const m of disc.messages) {
                  wechatPromptText += `- [${m.sender}]: ${m.text}\n`;
                }
                wechatPromptText += "\n";
              }

              let diaryPromptText = "";
              for (const d of diaryEntries) {
                diaryPromptText += `#### 日记 [${d.date}]:\n${d.excerpt}\n\n`;
              }

              const fullFactsPayload = `### 维度一：Otus 真实电脑研发与工程排坑记录
${otusPromptText || "无"}

### 维度二：w-report 微信核心技术社群真实讨论实录
${wechatPromptText || "无"}

### 维度三：Obsidian 个人主观反思与日记随笔
${diaryPromptText || "无"}`;

              // Step 4: 调用 Magpie group/smart-router
              log(`[AI SYNTHESIS] 正在唤醒本地 Magpie 智能路由模型 (${MAGPIE_MODEL}) 综合推演...`, "info");
              let candidateTopics = [];
              try {
                candidateTopics = await callMagpieSynthesizer(fullFactsPayload);
                log(`[AI OK] 成功推导并生成 ${candidateTopics.length} 个深度平衡的周度创作议题`, "success");
              } catch (aiErr) {
                log(`[AI WARN] 智能模型调用异常 (${aiErr.message})，使用事实提炼降级方案`, "warn");
                candidateTopics = [
                  {
                    id: "topic-1",
                    title: `修了 951 张图片与加粗失效：我的 Obsidian 微信发布插件排坑实战`,
                    type: "硬核研发实战",
                    hook: `当 Markdown 遇上微信富文本编辑器：那些官方文档没写的诡异排版陷阱与解法。`,
                    outline: ["现象：951 张图片为何偶发失效", "粗体未渲染：微信编辑器 DOM 过滤机制深度分析", "本地插件的优雅防御：打造稳定的微信直发流"],
                    evidence: "来自 Otus 真实研发：修复 Obsidian 公众号 951 张图片显示与微信编辑器粗体渲染 Bug",
                  },
                ];
              }

              // Step 5: 生成结构化全景母本并写入 Obsidian
              log(`[WRITE] 正在组装全景真理源并写入 Obsidian: Weekly/${weekStr}-Context.md ...`, "info");
              const weeklyDir = path.join(OBSIDIAN_VAULT, "Weekly");
              if (!fs.existsSync(weeklyDir)) {
                fs.mkdirSync(weeklyDir, { recursive: true });
              }

              // 生成结构化 Otus Markdown
              let otusMarkdown = "";
              for (const [proj, items] of Object.entries(projectGroups)) {
                otusMarkdown += `### 📁 项目/模块：${proj} (${items.length} 条实质活动)\n`;
                for (const it of items) {
                  otusMarkdown += `- **[${it.day}]** **${it.title}**\n`;
                  if (it.desc) {
                    otusMarkdown += `  - *说明*：${it.desc}\n`;
                  }
                  if (it.highlights && it.highlights.length > 0) {
                    otusMarkdown += `  - *亮点/产出*：${it.highlights.join(" · ")}\n`;
                  }
                }
                otusMarkdown += "\n";
              }

              // 生成结构化微信讨论 Markdown
              let wechatMarkdown = "";
              if (discussions.length > 0) {
                wechatMarkdown += `### 1. 深度讨论群聊实录切片\n\n`;
                for (const disc of discussions) {
                  wechatMarkdown += `#### 💬 ${disc.groupName}\n`;
                  for (const m of disc.messages) {
                    wechatMarkdown += `- **${m.sender}**：${m.text}\n`;
                  }
                  wechatMarkdown += "\n";
                }
              }

              if (recentSessions.length > 0) {
                wechatMarkdown += `### 2. 本周活跃技术社群分布\n`;
                wechatMarkdown += recentSessions.map((s) => `- ${s}`).join("\n") + "\n";
              }

              const markdownContent = `# ${weekStr} 周度素材母本与真理源 (Weekly Context)

> **生成时间**：${new Date().toLocaleString("zh-CN")}
> **底层数据源**：Otus 真实研发数据库 (\`~/.otus/data.db\`) · w-report 微信深度切片 (\`~/GitHub/w-report\`) · Obsidian Diary
> **定位说明**：本文件是**本周事实全景与灵感母本**。第一部分为 AI 深度综合推导的三大候选议题，后文真实呈现研发、群聊与日记细节。

---

## 一、AI 候选创作议题（三大维度精选）

${candidateTopics
  .map(
    (t, i) => `### 议题 0${i + 1}：${t.title}
- **内容定位**：\`${t.type}\`
- **核心 Hook**：${t.hook}
- **事实依据**：${t.evidence || "基于本周综合实操与记录"}
- **推荐大纲架构**：
${(t.outline || []).map((o) => `  - ${o}`).join("\n")}
`,
  )
  .join("\n")}

---

## 二、本周研发项目与技术实操全景 (Otus 深度记录)

> 本周共记录 **${totalCount} 条实质开发折腾**，涉及 **${projectCount} 个核心项目/模块**。已过滤锁屏与闲置。

${otusMarkdown || "- 暂无实质研发记录"}

### 📊 每日心流与利用率摘要
${summaries.length > 0 ? summaries.map((s) => `- **${s.date_key}**：${s.summary.slice(0, 160)}...`).join("\n") : "- 暂无日终总结"}

---

## 三、微信技术群聊与社群碰撞切片 (w-report 深度实录)

> 过滤了日常家校与公告禁言群，仅提取本周具有真实技术交流密度的讨论要点。

${wechatMarkdown || "- 暂无微信技术讨论"}

---

## 四、个人主观随感与思考切片 (Obsidian Diary 脱敏)

> 严格过滤个人隐私与敏感标签，保留与独立开发、技术学习、工作流相关的真实主线。

${diaryEntries.length > 0 ? diaryEntries.map((d) => `### 📝 日记 [${d.date}]\n> ${d.excerpt.replace(/\n/g, "\n> ")}`).join("\n\n") : "- 本周无公开随笔"}

---

## 五、下游流转指南
1. **工作台立项**：在 Creator Dashboard 中点击对应议题的【选定并立项】，将大纲导入创作看板；
2. **长文撰写**：在 Obsidian 中调用 \`Wechat 工作流 Skill\`，以此 Context 为真理源，直接扩写排版；
3. **视频录制**：对照大纲的 4~5 个核心要点，真人录制 5~8 分钟口播。
`;

              const targetFile = path.join(weeklyDir, `${weekStr}-Context.md`);
              fs.writeFileSync(targetFile, markdownContent, "utf-8");
              log(`[WRITE OK] 成功生成全景真理源: Weekly/${weekStr}-Context.md`, "success");

              // 返回最终结果给前端
              sendEvent("result", {
                weekStr,
                obsidianFile: `Weekly/${weekStr}-Context.md`,
                candidateTopics,
              });

              log("[COMPLETE] 周度全景素材与深度议题提炼已全部闭环就绪！", "success");
              res.end();
            } catch (err) {
              log(`[ERROR] 萃取管线执行异常: ${err.message}`, "error");
              sendEvent("error", { message: err.message });
              res.end();
            }
          })();
          return;
        }

        next();
      });
    },
  };
}
