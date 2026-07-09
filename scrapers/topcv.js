import * as cheerio from "cheerio";
import {
  appendCrawledIds,
  readCrawledIds,
  readJsonFile,
  writeJobToCsv,
  writeJsonFile,
} from "../lib/common.js";

const CONCURRENCY = 5;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
];

export async function scrape(browser, sourceConfig) {
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = await context.newPage();

  try {
    await page.goto(sourceConfig.searchUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const jobDataList = await page.evaluate(() => {
      const jobElements = document.querySelectorAll(".job-item-search-result");
      return Array.from(jobElements).map((job, index) => {
        const titleEl = job.querySelector(".title-block .title");
        const companyEl = job.querySelector(".title-block .company");
        const updateEl = job.querySelector(
          ".address.mobile-hidden.label-update",
        );
        const label = Array.from(
          job.querySelectorAll(".label-content span"),
        ).map((span) => span.textContent.trim());
        const urlDetail = job
          .querySelector(".title-block .title a")
          ?.getAttribute("href");
        const urlCompany = job
          .querySelector(".title-block a.company")
          ?.getAttribute("href");

        return {
          jobIndex: index + 1,
          id: job.getAttribute("data-job-id") || null,
          title: titleEl
            ? titleEl.textContent.trim().replace(/\s+/g, " ").trim()
            : "",
          company: companyEl
            ? companyEl.textContent.trim().replace(/\s+/g, " ").trim()
            : "",
          update: updateEl
            ? updateEl.textContent.trim().replace(/\s+/g, " ").trim()
            : "",
          urlDetail,
          urlCompany,
          label: label.join(", "),
        };
      });
    });

    return jobDataList.filter((job) => job.id);
  } finally {
    await page.close();
  }
}

export default async function init(browser, source) {
  try {
    const crawledIds = await readCrawledIds(source.file_ids);
    const allJobs = await scrape(browser, source);
    const newJobs = allJobs.filter((job) => job.id && !crawledIds.has(job.id));

    if (newJobs.length === 0) {
      return;
    }
    const detailedJobs = await runQueueScraper(browser, newJobs);
    const successfulJobs = detailedJobs.filter((r) => !r.error);

    const newIds = successfulJobs.map((r) => r.id).filter(Boolean);
    if (newIds.length > 0) {
      await appendCrawledIds(newIds, source.file_ids);
      newIds.forEach((id) => crawledIds.add(id));
    }

    // Load existing data
    const existingJobs = await readJsonFile(source.response);

    // Add new jobs to detail file with is_AI = false
    const newJobEntries = successfulJobs.map((job) => ({
      source: source.name,
      id: job.id,
      title: job.title,
      company: job.company,
      wage: job.wage,
      experience: job.experience,
      address: job.address,
      label: job.label,
      urlDetail: job.urlDetail,
      urlCompany: job.urlCompany,
      description: job.description,
      is_AI: false,
      create_at: Date.now(),
    }));

    const mergedJobs = [...existingJobs, ...newJobEntries];
    await writeJsonFile(source.response, mergedJobs);
    await writeJobToCsv(source.name, newJobEntries);
    console.log(
      "===================== Đã cào data từ TopCV lúc " +
        new Date().toISOString() +
        " =====================",
    );
    return {
      locator: source.name,
      newJobsCount: successfulJobs.length,
    };
  } catch (error) {
    console.error("Error occurred while scraping TopCV:", error);
  }
}

/**
 * Scraper dùng Worker Pool + Queue với Playwright
 * - Chạy serial (CONCURRENCY=1) để tránh bị Cloudflare detect
 * - Có User-Agent rotation, viewport random, human-like behavior
 * - Retry logic với exponential backoff
 */

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Hàm xử lý logic cào data cho từng URL
async function scrapePageTopCV(page, item) {
  await page.goto(`https://www.topcv.vn/job-view-detail?id=${item.id}`, {
    waitUntil: "domcontentloaded",
  });
  const rawText = await page.textContent("body");
  const data = JSON.parse(rawText);

  const json_content = data?.data?.html_job_detail;
  const $ = cheerio.load(json_content);
  const sections = [];
  $(".box-job-info")
    .children()
    .each((_, el) => {
      const node = $(el);

      if (!node.is("h3")) return;

      const title = node.clone().children().remove().end().text().trim();

      const content = node.next(".content-tab");

      if (!content.length) return;

      const items = [];

      content.children().each((_, el) => {
        const node = $(el);

        // ul > li
        if (node.is("ul") || node.is("ol")) {
          node.find("li").each((_, li) => {
            const text = $(li).text().replace(/\s+/g, " ").trim();

            if (text) items.push(text);
          });
        }

        // p
        else if (node.is("p")) {
          const text = node.text().replace(/\s+/g, " ").trim();

          if (text) items.push(text);
        }

        // div
        else if (node.is("div")) {
          const text = node.text().replace(/\s+/g, " ").trim();

          if (text) items.push(text);
        }
      });

      sections.push({
        title,
        items: items,
      });
    });
  const rawAddress = $(".box-address div").text().trim();
  const address = [
    ...new Set(
      rawAddress
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].join("\n");
  const experience = $(".box-item-header").eq(2).find("div").text().trim();
  const wage = $(".box-item-header").eq(0).find("div").text().trim();
  return {
    ...item,
    address,
    experience,
    wage,
    description: sections,
    dateCraw: Date.now(),
  };
}

class Queue {
  constructor(items) {
    this.items = [...items];
    this.results = [];
  }

  // Lấy URL tiếp theo, trả về undefined khi hết
  next() {
    return this.items.shift();
  }

  isEmpty() {
    return this.items.length === 0;
  }
}

const MAX_RETRIES = 3;

async function worker(id, browser, queue) {
  const userAgent = randomPick(USER_AGENTS);
  const viewport = randomPick(VIEWPORTS);
  const context = await browser.newContext({ userAgent, viewport });
  const page = await context.newPage();

  while (!queue.isEmpty()) {
    const item = queue.next();
    if (!item) break;

    let success = false;
    let jobCount = 0;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await scrapePageTopCV(page, item);
        queue.results.push(result);
        success = true;
        break;
      } catch (err) {
        console.log(
          `[worker ${id}] Attempt ${attempt}/${MAX_RETRIES} FAIL: ${item.urlDetail} -> ${err.message}`,
        );
        if (attempt < MAX_RETRIES) {
          const backoff = Math.random() * 30000 + 30000; // 30-60s
          console.log(
            `[worker ${id}] Retrying in ${(backoff / 1000).toFixed(0)}s...`,
          );
          await page.waitForTimeout(backoff);
        }
      }
    }

    if (success) {
      jobCount++;
      // Nghỉ thêm 20-40s sau mỗi 5 job để tránh bị detect
      if (jobCount % 5 === 0 && !queue.isEmpty()) {
        const extraDelay = Math.random() * 20000 + 20000;
        console.log(
          `[worker ${id}] Nghỉ thêm ${(extraDelay / 1000).toFixed(0)}s sau ${jobCount} job...`,
        );
        await page.waitForTimeout(extraDelay);
      }
    }

    if (!success) {
      console.log(
        `[worker ${id}] SKIP (all retries failed): ${item.urlDetail}`,
      );
      queue.results.push({ ...item, error: "all retries failed" });
    }
  }

  await context.close();
}

export async function runQueueScraper(browser, items) {
  const queue = new Queue(items);
  console.log(`Bắt đầu crawl ${items.length} job...`);

  const workers = Array.from({ length: CONCURRENCY }, (_, i) =>
    worker(i + 1, browser, queue),
  );

  await Promise.all(workers);

  const successCount = queue.results.filter((r) => !r.error).length;
  const failCount = queue.results.filter((r) => r.error).length;
  console.log(`Hoàn thành: ${successCount} thành công, ${failCount} thất bại`);
  return queue.results;
}
