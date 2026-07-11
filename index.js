import "dotenv/config";
import cron from "node-cron";
import { chromium } from "playwright-core";
import config from "./config.js";
import { formatTelegramMessage, sendMessage } from "./lib/telegram.js";
import { startBot } from "./lib/telegram-bot.js";
import { initAIQueue, enqueueJobs } from "./lib/ai-queue.js";
import { readJsonFile } from "./lib/common.js";
import init from "./scrapers/topcv.js";
import initVietnam from "./scrapers/vietnamework.js";

const scraperMap = {
  topcv: init,
  vietnamwork: initVietnam,
};

// Khởi tạo AI Queue
initAIQueue(config.cv, config.telegram);

async function runPipeline() {
  const startTime = Date.now();
  console.log(`\n[${new Date().toISOString()}] Bắt đầu crawl pipeline...`);

  let browser;

  try {
    browser = await chromium.connectOverCDP("http://localhost:9222");
  } catch (err) {
    // Playwright crashes when Chrome has extensions (e.g. Tampermonkey) loaded,
    // because extension service_worker targets don't have browserContextId.
    if (err.message.includes("service_worker") || err.message.includes("targetInfo")) {
      console.error(
        "❌ Lỗi: Chrome đang chạy với extensions (ví dụ Tampermonkey).\n" +
        "   Playwright không hỗ trợ extension service workers khi dùng connectOverCDP.\n" +
        "   Hãy khởi động lại Chrome với flag --disable-extensions:\n" +
        "   google-chrome --remote-debugging-port=9222 --user-data-dir=/home/do-huu-trung/chrome-auto --disable-extensions",
      );
    } else {
      console.error(
        "Không thể kết nối Chrome. Đảm bảo Chrome đang chạy với --remote-debugging-port=9222",
      );
    }
    console.error(err.message);
    return;
  }

  let totalNew = [];

  try {
    for (const source of config.scrapers) {
      if (!source.enabled) continue;

      const scraperHandler = scraperMap[source.name];
      if (!scraperHandler) {
        console.log(`Không tìm thấy scraper cho: ${source.name}`);
        continue;
      }

      const result = await scraperHandler(browser, source);
      if (result) {
        totalNew.push(result);

        // Đọc các job mới từ response file và đẩy vào AI queue
        try {
          const allJobs = await readJsonFile(source.response);
          // Lấy các job chưa được phân tích AI (is_AI = false)
          const unanalyzedJobs = allJobs.filter((j) => j.is_AI === false);
          if (unanalyzedJobs.length > 0) {
            enqueueJobs(unanalyzedJobs, source.name);
          }
        } catch (err) {
          console.error(`Lỗi đọc response file ${source.name}:`, err.message);
        }
      }
    }
  } finally {
    await browser.close();
  }

  const count = totalNew.reduce((sum, item) => sum + item.newJobsCount, 0);
  if (count === 0) {
    if (browser) await browser.close();
    return;
  }
  console.log(totalNew);
  try {
    if (totalNew.length > 0) {
      const message = formatTelegramMessage(totalNew);
      await sendMessage(message, config.telegram);
    }
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn Telegram:", error);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nHoàn thành trong ${elapsed}s: ${totalNew.length} mới`);
}

// Run immediately on start
runPipeline().catch(console.error);

// // Schedule if enabled
if (config.scheduler.enabled) {
  cron.schedule(config.scheduler.cronExpression, () => {
    console.log("\n⏰ Cron triggered");
    runPipeline().catch(console.error);
  });
  console.log(
    `📅 Đã đặt lịch: "${config.scheduler.cronExpression}" (${config.scheduler.cronExpression})`,
  );
}

// Start Telegram bot
startBot(config.telegram);
