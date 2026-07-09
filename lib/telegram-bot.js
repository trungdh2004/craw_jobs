import fs from "fs/promises";

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

  if (data.startsWith("detail:")) {
    const jobId = data.split(":")[1];
    return sendJobDetail(chatId, jobId);
  }

  if (data === "back:list") {
    return sendList(chatId);
  }

  if (data === "back:ai") {
    return sendAI(chatId);
  }

  if (data.startsWith("page:list:")) {
    const page = parseInt(data.split(":")[2]) || 0;
    return sendList(chatId, page);
  }

  if (data.startsWith("page:ai:")) {
    const page = parseInt(data.split(":")[2]) || 0;
    return sendAI(chatId, page);
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
    case "/list":
      return sendList(chatId);
    case "/ai":
      return sendAI(chatId);
    case "/detail":
      return sendJobDetail(chatId, args[0]);
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
  const text = `🤖 <b>JOB SCRAPER BOT</b>
━━━━━━━━━━━━━━━━━━━━━━━━━

📋 <b>Commands:</b>

/list — Jobs vừa crawl (hôm nay)
/ai — Jobs đã phân tích AI
/detail &lt;id&gt; — Xem chi tiết job
/stats — Thống kê hôm nay
/search &lt;từ khóa&gt; — Tìm job
/threshold [số] — Xem/đặt ngưỡng match %
/help — Hướng dẫn

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

const PAGE_SIZE = 5;

async function sendList(chatId, page = 0) {
  const jobs = await readJson("./jobdetail.json");
  if (!jobs.length) {
    return sendMessageTo(chatId, "Chưa có job nào.");
  }

  const recent = jobs.filter((j) => isToday(j.dateCrawled)).reverse();

  if (!recent.length) {
    return sendMessageTo(chatId, "Hôm nay chưa có job mới nào.");
  }

  const totalPages = Math.ceil(recent.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageJobs = recent.slice(start, start + PAGE_SIZE);

  let text = `📋 <b>JOBS VỪA CRAWL</b> (trang ${page + 1}/${totalPages})\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const job of pageJobs) {
    const time = formatTime(job.dateCrawled);
    text += `📌 <b>${esc(job.title)}</b>\n`;
    text += `   🏢 ${esc(job.company)}\n`;
    text += `   💰 ${esc(job.wage || "Thoả thuận")} | ⏳ ${esc(job.experience || "")}\n`;
    text += `   📅 ${time}\n\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Tổng: <b>${recent.length}</b> jobs`;

  // Build inline keyboard
  const buttons = pageJobs.map((job) => [
    { text: `${job.title.slice(0, 30)}${job.title.length > 30 ? "..." : ""}`, callback_data: `detail:${job.id}` },
  ]);

  // Pagination buttons
  const navRow = [];
  if (page > 0) {
    navRow.push({ text: "⬅️ Trước", callback_data: `page:list:${page - 1}` });
  }
  if (page < totalPages - 1) {
    navRow.push({ text: "Sau ➡️", callback_data: `page:list:${page + 1}` });
  }
  if (navRow.length) buttons.push(navRow);

  return sendMessageWithButtons(chatId, text.slice(0, 4096), buttons);
}

async function sendAI(chatId, page = 0) {
  const analysis = await readJson("./ai-analysis.json");
  if (!analysis.length) {
    return sendMessageTo(chatId, "Chưa có kết quả phân tích AI nào.");
  }

  const todayAnalysis = analysis
    .filter((a) => isToday(a.dateAnalyzed))
    .sort((a, b) => b.matchPercentage - a.matchPercentage);

  if (!todayAnalysis.length) {
    return sendMessageTo(chatId, "Hôm nay chưa có phân tích AI nào.");
  }

  const totalPages = Math.ceil(todayAnalysis.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageItems = todayAnalysis.slice(start, start + PAGE_SIZE);

  let text = `🤖 <b>PHÂN TÍCH AI</b> (trang ${page + 1}/${totalPages})\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (const a of pageItems) {
    const pct = a.matchPercentage;
    const icon = pct >= 70 ? "🟢" : pct >= 50 ? "🟡" : "🔴";

    text += `${icon} <b>${pct}%</b> — <b>${esc(a.title)}</b>\n`;
    text += `   🏢 ${esc(a.company)} | 💰 ${esc(a.wage || "Thoả thuận")}\n`;
    text += `   <i>${esc(a.summary?.slice(0, 60))}${a.summary?.length > 60 ? "..." : ""}</i>\n\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Tổng: <b>${todayAnalysis.length}</b> jobs`;

  const buttons = pageItems.map((a) => {
    const icon = a.matchPercentage >= 70 ? "🟢" : a.matchPercentage >= 50 ? "🟡" : "🔴";
    return [
      { text: `${icon} ${a.matchPercentage}% ${a.title.slice(0, 25)}${a.title.length > 25 ? "..." : ""}`, callback_data: `detail:${a.jobId}` },
    ];
  });

  const navRow = [];
  if (page > 0) {
    navRow.push({ text: "⬅️ Trước", callback_data: `page:ai:${page - 1}` });
  }
  if (page < totalPages - 1) {
    navRow.push({ text: "Sau ➡️", callback_data: `page:ai:${page + 1}` });
  }
  if (navRow.length) buttons.push(navRow);

  return sendMessageWithButtons(chatId, text.slice(0, 4096), buttons);
}

async function sendJobDetail(chatId, jobId) {
  if (!jobId) {
    return sendMessageTo(chatId, "Dùng: /detail <job_id>");
  }

  const jobs = await readJson("./jobdetail.json");
  const analysis = await readJson("./ai-analysis.json");

  const job = jobs.find((j) => String(j.id) === String(jobId));
  if (!job) {
    return sendMessageTo(chatId, `Không tìm thấy job ID: ${jobId}`);
  }

  const a = analysis.find((x) => x.jobId === job.id);

  let text = `📌 <b>${esc(job.title)}</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `🏢 <code>${esc(job.company)}</code>\n`;
  text += `💰 <b>${esc(job.wage || "Thoả thuận")}</b>\n`;
  text += `⏳ ${esc(job.experience || "")}\n`;
  text += `📍 ${esc(job.address || "")}\n`;
  text += `🏷️ ${esc(job.label || "")}\n`;
  text += `📅 ${esc(job.update || "")}\n`;
  text += `🔗 <a href="${job.urlDetail}">Xem trên TopCV</a>\n\n`;

  if (job.description?.length) {
    for (const section of job.description) {
      text += `<b>▸ ${esc(section.title)}</b>\n`;
      for (const item of section.items.slice(0, 5)) {
        text += `  ◦ ${esc(item)}\n`;
      }
      if (section.items.length > 5) {
        text += `  ... và ${section.items.length - 5} mục nữa\n`;
      }
      text += `\n`;
    }
  }

  if (a) {
    const pct = a.matchPercentage;
    const icon = pct >= 70 ? "🟢" : pct >= 50 ? "🟡" : "🔴";
    text += `${icon} <b>AI Match: ${pct}%</b>\n`;
    text += `<i>${esc(a.summary)}</i>\n`;
    if (a.strengths?.length) {
      text += `\n✅ <b>Điểm mạnh:</b>\n`;
      a.strengths.forEach((s) => (text += `  ✓ ${esc(s)}\n`));
    }
    if (a.concerns?.length) {
      text += `\n⚠️ <b>Lưu ý:</b>\n`;
      a.concerns.forEach((c) => (text += `  ✗ ${esc(c)}\n`));
    }
  } else {
    text += `⚪ <i>Chưa được phân tích AI</i>`;
  }

  const buttons = [[{ text: "⬅️ Quay lại", callback_data: "back:list" }]];

  return sendMessageWithButtons(chatId, text.slice(0, 4096), buttons);
}

async function sendStats(chatId) {
  const jobs = await readJson("./jobdetail.json");
  const analysis = await readJson("./ai-analysis.json");

  const todayJobs = jobs.filter((j) => isToday(j.dateCrawled));

  const platforms = {};
  for (const job of todayJobs) {
    platforms[job.source] = (platforms[job.source] || 0) + 1;
  }

  const todayAnalysis = analysis.filter((a) => isToday(a.dateAnalyzed));
  const highMatch = todayAnalysis.filter((a) => a.matchPercentage >= 70).length;

  let text = `📊 <b>THỐNG KÊ HÔM NAY</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `📦 Jobs mới hôm nay: <b>${todayJobs.length}</b>\n`;
  text += `🤖 Đã phân tích: <b>${todayAnalysis.length}</b>\n`;
  text += `🟢 Match ≥ 70%: <b>${highMatch}</b>\n\n`;

  if (Object.keys(platforms).length) {
    text += `<b> Theo nền tảng:</b>\n`;
    for (const [name, count] of Object.entries(platforms)) {
      text += `  • ${name}: <b>${count}</b> jobs\n`;
    }
  }

  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Tổng cộng: <b>${jobs.length}</b> jobs | <b>${analysis.length}</b> đã phân tích`;

  return sendMessageTo(chatId, text);
}

async function sendSearch(chatId, keyword) {
  if (!keyword) {
    return sendMessageTo(chatId, "Dùng: /search <từ khóa>");
  }

  const jobs = await readJson("./jobdetail.json");
  const analysis = await readJson("./ai-analysis.json");
  const kw = keyword.toLowerCase();

  const matched = jobs
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
    const a = analysis.find((x) => x.jobId === job.id);
    const pct = a ? a.matchPercentage : null;
    const icon = pct === null ? "⚪" : pct >= 70 ? "🟢" : pct >= 50 ? "🟡" : "🔴";
    const matchStr = pct !== null ? `${icon} ${pct}%` : `${icon} ?`;

    text += `📌 <b>${esc(job.title)}</b>\n`;
    text += `   🏢 ${esc(job.company)} | ${matchStr}\n\n`;
  }

  text += `Tìm thấy ${matched.length} / ${jobs.length} jobs`;

  const buttons = matched.map((job) => [
    { text: `${job.title.slice(0, 30)}${job.title.length > 30 ? "..." : ""}`, callback_data: `detail:${job.id}` },
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
  const url = `${API_BASE}${config.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Telegram send error: ${res.status} - ${err}`);
  }
}

async function sendMessageWithButtons(chatId, text, buttons) {
  const url = `${API_BASE}${config.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
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
