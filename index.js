import "dotenv/config";
import { chromium } from "playwright-core";
import config from "./config.js";
import { formatTelegramMessage, sendMessage } from "./lib/telegram.js";
import init from "./scrapers/topcv.js";
import initVietnam from "./scrapers/vietnamework.js";

const scraperMap = {
  topcv: init,
  vietnamwork: initVietnam,
};

async function runPipeline() {
  const startTime = Date.now();
  console.log(`\n[${new Date().toISOString()}] Bắt đầu crawl pipeline...`);

  let browser;

  try {
    browser = await chromium.connectOverCDP("http://localhost:9222");
  } catch (err) {
    console.error(
      "Không thể kết nối Chrome. Đảm bảo Chrome đang chạy với --remote-debugging-port=9222",
    );
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

// // Start Telegram bot
// startBot(config.telegram);
