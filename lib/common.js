import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
export async function appendCrawledIds(ids, file) {
  const lines = [...ids].join("\n") + "\n";
  await fs.appendFile(file, lines, "utf-8");
}

export async function readCrawledIds(file) {
  const set = new Set();
  try {
    const content = await fs.readFile(file, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) set.add(trimmed);
    }
  } catch {}
  return set;
}

export async function readJsonFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export async function writeJsonFile(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function writeJobToCsv(fileName, jobs) {
  const today = new Date().toISOString().split("T")[0];
  const filePath = path.join("./news", `${fileName}_${today}.csv`);
  const now = Date.now();
  // Nếu file chưa có thì ghi header
  if (!existsSync(filePath)) {
    await fs.writeFile(filePath, "id,title,timestamp\n", "utf8");
  }

  const rows = jobs
    .map((job) =>
      [escapeCsv(job.id), escapeCsv(job.title), escapeCsv(now)].join(","),
    )
    .join("\n");

  await fs.appendFile(filePath, rows + "\n", "utf8");

  console.log(`Đã thêm ${jobs.length} job vào ${filePath}`);
}

function escapeCsv(value) {
  if (value == null) return "";

  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}
