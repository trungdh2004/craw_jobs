import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeJobWithMimo } from "./mimo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ─── In-memory queue ───
const queue = [];
let processing = false;
let cvConfig = null;
let telegramConfig = null;

/**
 * Khởi tạo AI Queue với config
 */
export function initAIQueue(cv, telegram) {
  cvConfig = cv;
  telegramConfig = telegram;
  console.log("🤖 AI Queue initialized");
}

/**
 * Thêm jobs vào queue để phân tích
 * @param {Array} jobs - Array of job objects from response/{source}.json
 * @param {string} source - "topcv" or "vietnamwork"
 */
export function enqueueJobs(jobs, source) {
  for (const job of jobs) {
    // Tránh thêm job đã có trong queue
    const exists = queue.some(
      (q) => String(q.job.id) === String(job.id) && q.source === source,
    );
    if (!exists) {
      queue.push({ job, source });
    }
  }

  console.log(
    `📥 Đã thêm ${jobs.length} job(s) vào AI queue (tổng queue: ${queue.length})`,
  );

  // Bắt đầu xử lý nếu chưa chạy
  if (!processing) {
    processQueue();
  }
}

/**
 * Lấy đường dẫn file AI analysis theo ngày và source
 */
function getAnalysisFilePath(source, date) {
  const dateStr = date || new Date().toISOString().split("T")[0];
  return path.join(PROJECT_ROOT, "response", `${source}_ai_${dateStr}.json`);
}

/**
 * Đọc file AI analysis
 */
async function readAnalysis(source, date) {
  const filePath = getAnalysisFilePath(source, date);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * Ghi file AI analysis
 */
async function writeAnalysis(source, data, date) {
  const filePath = getAnalysisFilePath(source, date);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Kiểm tra job đã được phân tích chưa (trong ngày hôm nay)
 */
async function isAlreadyAnalyzed(jobId, source) {
  const existing = await readAnalysis(source);
  return existing.some((a) => String(a.jobId) === String(jobId));
}

/**
 * Chuẩn hóa job description cho MiMo
 * TopCV dùng items[], VietnamWorks dùng content string
 */
function normalizeJobForAI(job) {
  const normalized = { ...job };

  if (normalized.description && Array.isArray(normalized.description)) {
    normalized.description = normalized.description.map((section) => {
      // Nếu đã có items thì giữ nguyên (TopCV format)
      if (section.items && Array.isArray(section.items)) {
        return section;
      }

      // VietnamWorks format: content là string hoặc array of objects
      if (section.content) {
        let items = [];
        if (typeof section.content === "string") {
          items = section.content
            .split(/[-\n]/)
            .map((s) => s.trim())
            .filter(Boolean);
        } else if (Array.isArray(section.content)) {
          items = section.content.map((item) =>
            typeof item === "object" && item.name ? item.name : String(item),
          );
        }
        return { title: section.title, items };
      }

      return section;
    });
  }

  return normalized;
}

/**
 * Xử lý queue tuần tự
 */
async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;

  console.log(`\n🔄 Bắt đầu phân tích AI (${queue.length} jobs trong queue)`);

  let analyzed = 0;
  let failed = 0;

  while (queue.length > 0) {
    const { job, source } = queue.shift();

    // Kiểm tra đã phân tích chưa
    const alreadyDone = await isAlreadyAnalyzed(job.id, source);
    if (alreadyDone) {
      console.log(`⏭️ Skip (đã phân tích): ${job.title}`);
      continue;
    }

    try {
      console.log(
        `🔍 [${analyzed + failed + 1}] Đang phân tích: ${job.title} (${source})`,
      );

      // Chuẩn hóa job trước khi gửi cho AI
      const normalizedJob = normalizeJobForAI(job);
      const result = await analyzeJobWithMimo(normalizedJob, cvConfig);

      // Lưu kết quả
      const analysisEntry = {
        jobId: job.id,
        source,
        title: job.title,
        company: job.company,
        wage: job.wage || "Thoả thuận",
        experience: job.experience || "",
        urlDetail: job.urlDetail || "",
        matchPercentage: result.matchPercentage,
        summary: result.summary,
        strengths: result.strengths,
        concerns: result.concerns,
        analyzedAt: Date.now(),
      };

      const existing = await readAnalysis(source);
      existing.push(analysisEntry);
      await writeAnalysis(source, existing);

      analyzed++;
      console.log(
        `✅ ${job.title}: ${result.matchPercentage}% match`,
      );

      // Nghỉ 2s giữa mỗi lần gọi AI để tránh quá tải
      await sleep(2000);
    } catch (err) {
      failed++;
      console.error(`❌ Lỗi phân tích ${job.title}:`, err.message);

      // Nghỉ 5s nếu lỗi
      await sleep(5000);
    }
  }

  processing = false;
  console.log(
    `\n✅ AI Queue hoàn thành: ${analyzed} thành công, ${failed} thất bại`,
  );

  // Gửi thông báo Telegram nếu có kết quả
  if (analyzed > 0 && telegramConfig) {
    try {
      await sendTelegramNotification(analyzed, failed);
    } catch (err) {
      console.error("Lỗi gửi thông báo Telegram:", err.message);
    }
  }
}

/**
 * Gửi thông báo hoàn thành phân tích AI
 */
async function sendTelegramNotification(analyzed, failed) {
  const API_BASE = "https://api.telegram.org/bot";
  const url = `${API_BASE}${telegramConfig.botToken}/sendMessage`;

  const text =
    `🤖 <b>AI PHÂN TÍCH HOÀN THÀNH</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ Đã phân tích: <b>${analyzed}</b> jobs\n` +
    `❌ Thất bại: <b>${failed}</b> jobs\n\n` +
    `Gõ <b>ai</b> để xem kết quả`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegramConfig.chatId,
      text,
      parse_mode: "HTML",
    }),
  });
}

/**
 * Lấy tất cả kết quả AI analysis hôm nay (dùng cho telegram bot)
 */
export async function getTodayAnalysis() {
  const today = new Date().toISOString().split("T")[0];
  const responseDir = path.join(PROJECT_ROOT, "response");
  const allAnalysis = [];

  try {
    const files = await fs.readdir(responseDir);
    const todayAiFiles = files.filter(
      (f) => f.includes("_ai_") && f.endsWith(`${today}.json`),
    );

    for (const file of todayAiFiles) {
      const content = await fs.readFile(
        path.join(responseDir, file),
        "utf-8",
      );
      const data = JSON.parse(content);
      allAnalysis.push(...data);
    }
  } catch (err) {
    console.error("Error reading AI analysis:", err.message);
  }

  // Sắp xếp theo matchPercentage giảm dần
  allAnalysis.sort((a, b) => b.matchPercentage - a.matchPercentage);
  return allAnalysis;
}

/**
 * Lấy chi tiết phân tích AI của 1 job
 */
export async function getAnalysisForJob(jobId, source) {
  const today = new Date().toISOString().split("T")[0];
  const analysis = await readAnalysis(source, today);
  return analysis.find((a) => String(a.jobId) === String(jobId)) || null;
}

/**
 * Trạng thái queue hiện tại
 */
export function getQueueStatus() {
  return {
    pending: queue.length,
    processing,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
