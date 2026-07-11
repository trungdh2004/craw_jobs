import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { getTodayAnalysis, getAnalysisForJob, getQueueStatus } from "./ai-queue.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const API_BASE = "https://api.telegram.org/bot";
const POLL_INTERVAL = 3000;

let offset = 0;
let config = null;
let polling = false;

export function startBot(botConfig) {
  config = botConfig;
  console.log("🤖 Telegram bot started (polling)");
  poll();
}

async function poll() {
  if (!config || polling) return;
  polling = true;

  while (config) {
    try {
      const updates = await getUpdates();
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.callback_query) {
          await handleCallbackQuery(update.callback_query);
        } else if (update.message?.text) {
          await handleMessage(update.message);
        }
      }
    } catch (err) {
      console.error("Bot poll error:", err.message);
      await sleep(5000);
    }
    await sleep(POLL_INTERVAL);
  }
  polling = false;
}

async function getUpdates() {
  const url = `${API_BASE}${config.botToken}/getUpdates?offset=${offset}&timeout=1`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.ok ? data.result : [];
}

// ─── Callback Query (inline buttons) ───

async function handleCallbackQuery(cb) {
  const chatId = cb.message?.chat.id;
  const data = cb.data || "";

  // Answer callback to remove loading spinner
  await answerCallback(cb.id);

  // aidetail:{source}:{id} — show AI analysis detail
  if (data.startsWith("aidetail:")) {
    const parts = data.split(":");
    const source = parts[1];
    const jobId = parts[2];
    return sendAIDetail(chatId, source, jobId);
  }

  // detail:{source}:{id} — show job detail from response folder
  if (data.startsWith("detail:")) {
    const parts = data.split(":");
    const source = parts[1];
    const jobId = parts[2];
    return sendJobDetail(chatId, source, jobId);
  }

  if (data === "back:today") {
    return sendToday(chatId);
  }

  if (data === "back:ai") {
    return sendAI(chatId);
  }
}

async function answerCallback(callbackQueryId) {
  const url = `${API_BASE}${config.botToken}/answerCallbackQuery`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

// ─── Command handler ───

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text?.trim() || "";
  const [command, ...args] = text.split(" ");

  switch (command.toLowerCase()) {
    case "/start":
    case "/help":
      return sendHelp(chatId);
    case "today":
    case "/today":
      return sendToday(chatId);
    case "ai":
    case "/ai":
      return sendAI(chatId);
    case "/detail":
      return sendJobDetail(chatId, args[0], args[1]);
    case "/stats":
      return sendStats(chatId);
    case "/search":
      return sendSearch(chatId, args.join(" "));
    case "/threshold":
      return sendThreshold(chatId, args[0]);
    default:
      return sendMessageTo(chatId, `Command không rõ. Gõ /help để xem danh sách.`);
  }
}

// ─── Commands ───

async function sendHelp(chatId) {
  const status = getQueueStatus();
  const queueInfo = status.processing
    ? `\n⏳ AI đang phân tích (${status.pending} trong queue)`
    : status.pending > 0
    ? `\n📥 ${status.pending} jobs đang chờ phân tích`
    : "";

  const text = `🤖 <b>JOB SCRAPER BOT</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

📋 <b>Commands:</b>

today — Jobs đã crawl hôm nay
ai — Kết quả phân tích AI hôm nay
/detail &lt;source&gt; &lt;id&gt; — Xem chi tiết job
/stats — Thống kê hôm nay
/search &lt;từ khóa&gt; — Tìm job
/threshold [số] — Xem/đặt ngưỡng match %
/help — Hướng dẫn${queueInfo}

━━━━━━━━━━━━━━━━━━━━━━━━━`;

  return sendMessageTo(chatId, text);
}

function safeDate(ts) {
  if (!ts) return null;
  const d = new Date(typeof ts === "number" ? ts : Number(ts));
  return isNaN(d.getTime()) ? null : d;
}

function formatTime(ts) {
  const d = safeDate(ts);
  if (!d) return "?";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function isToday(ts) {
  const d = safeDate(ts);
  if (!d) return false;
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

// ─── TODAY command: reads CSV files from news/ folder ───

async function getTodayJobs() {
  const today = new Date().toISOString().split("T")[0];
  const newsDir = path.join(PROJECT_ROOT, "news");
  const jobs = [];

  try {
    const files = await fs.readdir(newsDir);
    const todayFiles = files.filter((f) => f.endsWith(`_${today}.csv`));

    for (const file of todayFiles) {
      // Extract source name from filename: "topcv_2026-07-10.csv" → "topcv"
      const source = file.replace(`_${today}.csv`, "");
      const filePath = path.join(newsDir, file);
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      // Skip header line (id,title,timestamp)
      for (let i = 1; i < lines.length; i++) {
        const parsed = parseCsvLine(lines[i]);
        if (parsed && parsed.id) {
          jobs.push({
            id: parsed.id,
            title: parsed.title || "Không rõ",
            timestamp: parsed.timestamp,
            source,
          });
        }
      }
    }
  } catch (err) {
    console.error("Error reading today jobs:", err.message);
  }

  // Sort by timestamp descending (newest first)
  jobs.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  return jobs;
}

function parseCsvLine(line) {
  // Parse CSV line: "id","title","timestamp"
  const parts = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);

  if (parts.length >= 3) {
    return {
      id: parts[0].trim(),
      title: parts[1].trim(),
      timestamp: parts[2].trim(),
    };
  }
  return null;
}

async function sendToday(chatId) {
  const jobs = await getTodayJobs();

  if (!jobs.length) {
    return sendMessageTo(chatId, "📭 Hôm nay chưa có job nào được crawl.");
  }

  let text = `📋 <b>JOBS HÔM NAY</b> (${jobs.length} jobs)\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const time = formatTime(job.timestamp);
    const sourceLabel = job.source === "topcv" ? "TopCV" : job.source === "vietnamwork" ? "VietnamWorks" : job.source;

    text += `${i + 1}. 📌 <b>${esc(job.title)}</b>\n`;
    text += `   🏷️ ${esc(sourceLabel)} | ⏰ ${time}\n\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━━━━━`;

  // Build inline keyboard — each job has a detail button
  const buttons = jobs.map((job) => {
    const label = `🔍 ${job.title.slice(0, 28)}${job.title.length > 28 ? "..." : ""}`;
    return [
      { text: label, callback_data: `detail:${job.source}:${job.id}` },
    ];
  });

  return sendLongMessageWithButtons(chatId, text, buttons);
}

// ─── Job Detail from response/ folder ───

async function getJobFromResponse(source, jobId) {
  const responsePath = path.join(PROJECT_ROOT, "response", `${source}.json`);

  try {
    const content = await fs.readFile(responsePath, "utf-8");
    const jobs = JSON.parse(content);
    return jobs.find((j) => String(j.id) === String(jobId)) || null;
  } catch (err) {
    console.error(`Error reading response/${source}.json:`, err.message);
    return null;
  }
}

async function sendJobDetail(chatId, source, jobId) {
  if (!source || !jobId) {
    return sendMessageTo(chatId, "Dùng: /detail <source> <job_id>\nVí dụ: /detail topcv 1839478");
  }

  const job = await getJobFromResponse(source, jobId);
  if (!job) {
    return sendMessageTo(chatId, `❌ Không tìm thấy job <b>${esc(jobId)}</b> trong <b>${esc(source)}</b>`);
  }

  const sourceLabel = source === "topcv" ? "TopCV" : source === "vietnamwork" ? "VietnamWorks" : source;

  let text = `📌 <b>${esc(job.title)}</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `🏢 <code>${esc(job.company)}</code>\n`;
  text += `💰 <b>${esc(job.wage || "Thoả thuận")}</b>\n`;
  text += `⏳ ${esc(job.experience || "")}\n`;
  text += `📍 ${esc(job.address || "")}\n`;
  if (job.label) text += `🏷️ ${esc(job.label)}\n`;
  if (job.deadline) text += `⏱️ Hạn: ${esc(job.deadline)}\n`;
  text += `🌐 ${esc(sourceLabel)}\n`;
  text += `🔗 <a href="${job.urlDetail}">Xem chi tiết →</a>\n\n`;

  if (job.description?.length) {
    for (const section of job.description) {
      text += `<b>▸ ${esc(section.title)}</b>\n`;

      // Handle both formats: items array (topcv) and content string/array (vietnamwork)
      if (section.items && Array.isArray(section.items)) {
        for (const item of section.items.slice(0, 6)) {
          text += `  ◦ ${esc(item)}\n`;
        }
        if (section.items.length > 6) {
          text += `  ... và ${section.items.length - 6} mục nữa\n`;
        }
      } else if (section.content) {
        if (typeof section.content === "string") {
          const lines = section.content.split(/[-\n]/).filter((l) => l.trim());
          for (const line of lines.slice(0, 6)) {
            text += `  ◦ ${esc(line.trim())}\n`;
          }
          if (lines.length > 6) {
            text += `  ... và ${lines.length - 6} mục nữa\n`;
          }
        } else if (Array.isArray(section.content)) {
          // Skills array from vietnamwork
          for (const skill of section.content.slice(0, 10)) {
            if (typeof skill === "object" && skill.name) {
              text += `  • ${esc(skill.name)}\n`;
            } else {
              text += `  ◦ ${esc(String(skill))}\n`;
            }
          }
        }
      }
      text += `\n`;
    }
  }

  const buttons = [
    [{ text: "⬅️ Quay lại danh sách", callback_data: "back:today" }],
  ];

  return sendMessageWithButtons(chatId, text.slice(0, 4096), buttons);
}



async function sendAI(chatId) {
  const todayAnalysis = await getTodayAnalysis();
  const status = getQueueStatus();

  if (!todayAnalysis.length && !status.processing) {
    return sendMessageTo(chatId, "📭 Hôm nay chưa có phân tích AI nào.");
  }

  if (!todayAnalysis.length && status.processing) {
    return sendMessageTo(
      chatId,
      `⏳ AI đang phân tích (${status.pending} jobs trong queue)...\nHãy thử lại sau vài phút.`,
    );
  }

  let text = `🤖 <b>PHÂN TÍCH AI HÔM NAY</b> (${todayAnalysis.length} jobs)\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let i = 0; i < todayAnalysis.length; i++) {
    const a = todayAnalysis[i];
    const pct = a.matchPercentage;
    const icon = pct >= 70 ? "🟢" : pct >= 50 ? "🟡" : "🔴";
    const sourceLabel = a.source === "topcv" ? "TopCV" : a.source === "vietnamwork" ? "VietnamWorks" : a.source;

    text += `${i + 1}. ${icon} <b>${pct}%</b> — <b>${esc(a.title)}</b>\n`;
    text += `   🏢 ${esc(a.company)} | 💰 ${esc(a.wage || "Thoả thuận")}\n`;
    text += `   🌐 ${esc(sourceLabel)}\n`;
    text += `   <i>${esc(a.summary?.slice(0, 80))}${a.summary?.length > 80 ? "..." : ""}</i>\n\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━━━━━`;

  if (status.processing) {
    text += `\n⏳ ${status.pending} jobs đang chờ phân tích`;
  }

  // Mỗi job có nút xem chi tiết AI
  const buttons = todayAnalysis.map((a) => {
    const icon = a.matchPercentage >= 70 ? "🟢" : a.matchPercentage >= 50 ? "🟡" : "🔴";
    return [
      {
        text: `${icon} ${a.matchPercentage}% ${a.title.slice(0, 22)}${a.title.length > 22 ? "..." : ""}`,
        callback_data: `aidetail:${a.source}:${a.jobId}`,
      },
    ];
  });

  return sendLongMessageWithButtons(chatId, text, buttons);
}

// ─── AI Detail: show full AI analysis for a job ───

async function sendAIDetail(chatId, source, jobId) {
  const analysis = await getAnalysisForJob(jobId, source);

  if (!analysis) {
    return sendMessageTo(chatId, `❌ Không tìm thấy phân tích AI cho job ${esc(jobId)}`);
  }

  const pct = analysis.matchPercentage;
  const icon = pct >= 70 ? "🟢" : pct >= 50 ? "🟡" : "🔴";
  const sourceLabel = source === "topcv" ? "TopCV" : source === "vietnamwork" ? "VietnamWorks" : source;
  const time = formatTime(analysis.analyzedAt);

  let text = `${icon} <b>AI PHÂN TÍCH: ${pct}%</b>\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `📌 <b>${esc(analysis.title)}</b>\n`;
  text += `🏢 <code>${esc(analysis.company)}</code>\n`;
  text += `💰 <b>${esc(analysis.wage || "Thoả thuận")}</b>\n`;
  text += `⏳ ${esc(analysis.experience || "")}\n`;
  text += `🌐 ${esc(sourceLabel)} | ⏰ ${time}\n`;
  if (analysis.urlDetail) {
    text += `🔗 <a href="${analysis.urlDetail}">Xem job gốc →</a>\n`;
  }
  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Summary
  text += `📝 <b>Nhận xét:</b>\n`;
  text += `<i>${esc(analysis.summary)}</i>\n\n`;

  // Strengths
  if (analysis.strengths?.length) {
    text += `✅ <b>Điểm mạnh:</b>\n`;
    for (const s of analysis.strengths) {
      text += `  ✓ ${esc(s)}\n`;
    }
    text += `\n`;
  }

  // Concerns
  if (analysis.concerns?.length) {
    text += `⚠️ <b>Lưu ý:</b>\n`;
    for (const c of analysis.concerns) {
      text += `  ✗ ${esc(c)}\n`;
    }
    text += `\n`;
  }

  // Match bar
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  text += `<code>${"█".repeat(filled)}${"░".repeat(empty)}</code> ${pct}%`;

  const buttons = [
    [{ text: "📋 Xem job gốc", callback_data: `detail:${source}:${jobId}` }],
    [{ text: "⬅️ Quay lại danh sách AI", callback_data: "back:ai" }],
  ];

  return sendMessageWithButtons(chatId, text.slice(0, 4096), buttons);
}

async function sendStats(chatId) {
  const todayJobs = await getTodayJobs();
  const todayAnalysis = await getTodayAnalysis();
  const status = getQueueStatus();

  const platforms = {};
  for (const job of todayJobs) {
    const label = job.source === "topcv" ? "TopCV" : job.source === "vietnamwork" ? "VietnamWorks" : job.source;
    platforms[label] = (platforms[label] || 0) + 1;
  }

  const highMatch = todayAnalysis.filter((a) => a.matchPercentage >= 70).length;
  const medMatch = todayAnalysis.filter((a) => a.matchPercentage >= 50 && a.matchPercentage < 70).length;

  let text = `📊 <b>THỐNG KÊ HÔM NAY</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `📦 Jobs mới: <b>${todayJobs.length}</b>\n`;
  text += `🤖 Đã phân tích AI: <b>${todayAnalysis.length}</b>\n`;
  text += `🟢 Match ≥ 70%: <b>${highMatch}</b>\n`;
  text += `🟡 Match 50-69%: <b>${medMatch}</b>\n\n`;

  if (Object.keys(platforms).length) {
    text += `<b>Theo nền tảng:</b>\n`;
    for (const [name, count] of Object.entries(platforms)) {
      text += `  • ${name}: <b>${count}</b> jobs\n`;
    }
  }

  if (status.processing) {
    text += `\n⏳ AI đang xử lý (${status.pending} jobs trong queue)`;
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━`;

  return sendMessageTo(chatId, text);
}

async function sendSearch(chatId, keyword) {
  if (!keyword) {
    return sendMessageTo(chatId, "Dùng: /search <từ khóa>");
  }

  // Search across all response files
  const allJobs = [];
  const responseDir = path.join(PROJECT_ROOT, "response");

  try {
    const files = await fs.readdir(responseDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const source = file.replace(".json", "");
      const content = await fs.readFile(path.join(responseDir, file), "utf-8");
      const jobs = JSON.parse(content);
      for (const job of jobs) {
        allJobs.push({ ...job, source });
      }
    }
  } catch {}

  const kw = keyword.toLowerCase();
  const matched = allJobs
    .filter(
      (j) =>
        j.title?.toLowerCase().includes(kw) ||
        j.company?.toLowerCase().includes(kw),
    )
    .slice(0, 10);

  if (!matched.length) {
    return sendMessageTo(chatId, `Không tìm thấy job nào chứa "${keyword}"`);
  }

  let text = `🔍 <b>KẾT QUẢ: "${esc(keyword)}"</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const job of matched) {
    const sourceLabel = job.source === "topcv" ? "TopCV" : job.source === "vietnamwork" ? "VietnamWorks" : job.source;
    text += `📌 <b>${esc(job.title)}</b>\n`;
    text += `   🏢 ${esc(job.company)} | 🌐 ${esc(sourceLabel)}\n\n`;
  }

  text += `Tìm thấy ${matched.length} jobs`;

  const buttons = matched.map((job) => [
    { text: `${job.title.slice(0, 30)}${job.title.length > 30 ? "..." : ""}`, callback_data: `detail:${job.source}:${job.id}` },
  ]);

  return sendMessageWithButtons(chatId, text.slice(0, 4096), buttons);
}

async function sendThreshold(chatId, newThreshold) {
  if (newThreshold && !isNaN(newThreshold)) {
    const num = Math.max(0, Math.min(100, parseInt(newThreshold)));
    config.matchThreshold = num;
    return sendMessageTo(
      chatId,
      `✅ Đã đổi ngưỡng match threshold: <b>${num}%</b>`,
    );
  }

  return sendMessageTo(
    chatId,
    `📊 Match threshold hiện tại: <b>${config.matchThreshold}%</b>\nDùng: /threshold <số> để thay đổi`,
  );
}

// ─── Send helpers ───

async function sendMessageTo(chatId, text) {
  // Tự chia message nếu quá 4096 ký tự
  const chunks = splitText(text, 4096);
  for (const chunk of chunks) {
    const url = `${API_BASE}${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Telegram send error: ${res.status} - ${err}`);
    }
  }
}

async function sendMessageWithButtons(chatId, text, buttons) {
  const url = `${API_BASE}${config.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: buttons },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Telegram send error: ${res.status} - ${err}`);
  }
}

/**
 * Gửi message dài + buttons.
 * Text được chia thành nhiều message, buttons đi kèm message cuối.
 */
async function sendLongMessageWithButtons(chatId, text, buttons) {
  const chunks = splitText(text, 4096);

  // Gửi các chunk đầu không có buttons
  for (let i = 0; i < chunks.length - 1; i++) {
    await sendMessageTo(chatId, chunks[i]);
  }

  // Chunk cuối đi kèm buttons
  return sendMessageWithButtons(chatId, chunks[chunks.length - 1], buttons);
}

/**
 * Chia text thành các chunk <= maxLen, cắt theo dòng
 */
function splitText(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Tìm vị trí xuống dòng cuối cùng trong khoảng cho phép
    let cutAt = remaining.lastIndexOf("\n", maxLen);
    if (cutAt <= 0) cutAt = maxLen;

    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).trimStart();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

// ─── Utils ───

async function readJson(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function esc(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
