const API_BASE = "https://api.telegram.org/bot";

export async function sendMessage(text, config) {
  const url = `${API_BASE}${config.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${res.status} - ${err}`);
  }

  return res.json();
}

function matchBar(pct) {
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

function matchColor(pct) {
  if (pct >= 80) return "🟢 Phù hợp cao";
  if (pct >= 60) return "🟡 Khá phù hợp";
  if (pct >= 40) return "🟠 Trung bình";
  return "🔴 Không phù hợp";
}

export function formatJobAlert(job, matchResult) {
  const pct = matchResult.matchPercentage;
  const DIVIDER = "━".repeat(28);

  let text = ``;

  // Header
  text += `${matchColor(pct)}\n`;
  text += `<b>Match: ${pct}%</b>  <code>${matchBar(pct)}</code>\n`;
  text += `${DIVIDER}\n\n`;

  // Job title
  text += `📌 <b>${escapeHtml(job.title)}</b>\n\n`;

  // Info grid
  text += `🏢 <code>${escapeHtml(job.company)}</code>\n`;
  text += `💰 <b>${escapeHtml(job.wage || "Thoả thuận")}</b>\n`;
  text += `⏳ ${escapeHtml(job.experience || "")}\n`;
  text += `📍 ${escapeHtml(job.address || "")}\n`;
  text += `\n${DIVIDER}\n`;

  // Description sections
  if (job.description?.length) {
    for (const section of job.description) {
      text += `\n<b>▸ ${escapeHtml(section.title)}</b>\n`;
      for (const item of section.items) {
        const lines = escapeHtml(item).split("\n").filter(Boolean);
        for (const line of lines) {
          text += `  ◦ ${line.trim()}\n`;
        }
      }
    }
    text += `\n${DIVIDER}\n`;
  }

  // AI Analysis
  text += `\n<b>🤖 PHÂN TÍCH AI</b>\n`;
  text += `<i>${escapeHtml(matchResult.summary)}</i>\n`;

  if (matchResult.strengths?.length) {
    text += `\n✅ <b>Điểm mạnh:</b>\n`;
    for (const s of matchResult.strengths) {
      text += `  ✓ ${escapeHtml(s)}\n`;
    }
  }

  if (matchResult.concerns?.length) {
    text += `\n⚠️ <b>Lưu ý:</b>\n`;
    for (const c of matchResult.concerns) {
      text += `  ✗ ${escapeHtml(c)}\n`;
    }
  }

  text += `\n${DIVIDER}\n`;
  text += `🔗 <a href="${job.urlDetail}">Xem trên TopCV →</a>`;

  return text.slice(0, 4096);
}

export function formatTelegramMessage(data) {
  const now = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });

  const lines = data.map(
    (item, index) =>
      `${index + 1}. <b>${item.locator}</b>: ${item.newJobsCount} việc mới`,
  );

  return `
<b>📊 Báo cáo Crawl Job</b>

🕒 <b>Thời gian:</b> ${now}

${lines.join("\n")}

<i>Tự động gửi bởi Job Crawler Bot 🤖</i>
`.trim();
}

export function formatSummary(totalNew, analyzed, notified) {
  const DIVIDER = "━".repeat(28);
  return (
    `📊 <b>CRAWL SUMMARY</b>\n` +
    `${DIVIDER}\n` +
    `📦 Jobs mới: <b>${totalNew}</b>\n` +
    `🤖 Đã phân tích: <b>${analyzed}</b>\n` +
    `📨 Đã gửi Telegram: <b>${notified}</b>\n` +
    `${DIVIDER}`
  );
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
