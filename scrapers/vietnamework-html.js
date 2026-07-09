import { readFileSync } from "fs";

/**
 * Parse VietnamWorks Next.js HTML page to extract job data.
 *
 * VietnamWorks uses Next.js App Router with SSR.
 * Job data is embedded in `self.__next_f.push()` calls as RSC payload.
 * When fetched via axios, the response is raw RSC payload (no HTML tags).
 */

function extractRscPayload(html) {
  const segments = [];
  const pushRegex = /self\.__next_f\.push\(\[\s*1\s*,\s*(['"])/g;
  let match;

  while ((match = pushRegex.exec(html)) !== null) {
    const quoteChar = match[1];
    const startIdx = match.index + match[0].length - 1;

    let j = startIdx + 1;
    let escaped = false;
    while (j < html.length) {
      if (escaped) {
        escaped = false;
      } else if (html[j] === "\\") {
        escaped = true;
      } else if (html[j] === quoteChar) {
        break;
      }
      j++;
    }

    if (j < html.length) {
      let content = html.substring(startIdx + 1, j);
      if (content.includes('\\"')) {
        content = content.replace(/\\"/g, '"');
      }
      segments.push(content);
    }
  }

  return segments.join("");
}

function safeParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function decodeUnicodeEscapes(str) {
  if (!str) return "";
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

function stripHtml(html) {
  if (!html) return "";
  return decodeUnicodeEscapes(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJsonObjects(html) {
  const objects = [];
  const jsonRegex = /\{[^{}]*"jobId"[^{}]*\}/g;
  let match;
  while ((match = jsonRegex.exec(html)) !== null) {
    const parsed = safeParseJson(match[0]);
    if (parsed && parsed.jobId) {
      objects.push(parsed);
    }
  }
  return objects;
}

function extractJobFromHtml(html) {
  let rscPayload = "";

  if (html.includes("self.__next_f.push")) {
    rscPayload = extractRscPayload(html);
  } else if (html.includes('"jobId"')) {
    rscPayload = html;
  } else {
    console.warn("Khong nhan dien duoc format du lieu");
    return null;
  }

  const jobObjects = extractJsonObjects(rscPayload);
  const mainJob =
    jobObjects.find((j) => j.jobTitle && j.jobDescription) || jobObjects[0];

  if (!mainJob) {
    console.warn("Khong tim thay job data trong HTML");
    return null;
  }

  const skillsMap = new Map();
  const skillRegex = /"skillName"[:\s]+"([^"]+)"[\s\S]*?"skillId"[:\s]+(\d+)/g;
  let skillMatch;
  while ((skillMatch = skillRegex.exec(rscPayload)) !== null) {
    const id = parseInt(skillMatch[2]);
    if (!skillsMap.has(id)) {
      skillsMap.set(id, { name: skillMatch[1], id });
    }
  }
  const skills = [...skillsMap.values()];

  const benefitsMap = new Map();
  const benefitRegex =
    /"benefitId"[:\s]+(\d+)[\s\S]*?"benefitName"[:\s]+"([^"]+)"[\s\S]*?"benefitNameVI"[:\s]+"([^"]*)"[\s\S]*?"benefitValue"[:\s]+"([^"]*)"/g;
  let benefitMatch;
  while ((benefitMatch = benefitRegex.exec(rscPayload)) !== null) {
    const id = parseInt(benefitMatch[1]);
    if (!benefitsMap.has(id)) {
      benefitsMap.set(id, {
        name: benefitMatch[2],
        nameVI: benefitMatch[3],
        value: benefitMatch[4],
      });
    }
  }
  const benefits = [...benefitsMap.values()];

  const locationRegex =
    /"workingLocationId"[:\s]+(\d+)[\s\S]*?"address"[:\s]+"((?:[^"\\]|\\.)*)"[\s\S]*?"cityName"[:\s]+"([^"]*)"[\s\S]*?"cityNameVI"[:\s]+"([^"]*)"/;
  const locationMatch = rscPayload.match(locationRegex);
  const location = locationMatch
    ? {
        address: locationMatch[2].replace(/\\n/g, " ").replace(/\\r/g, ""),
        city: locationMatch[3],
        cityVI: locationMatch[4],
      }
    : null;

  const companyRegex =
    /"companyId"[:\s]+(\d+)[\s\S]*?"companyName"[:\s]+"([^"]*)"[\s\S]*?"companyProfile"[:\s]+"((?:[^"\\]|\\.)*)"[\s\S]*?"companySizeId"[:\s]+"?(\d*"?)/;
  const companyMatch = rscPayload.match(companyRegex);
  const company = companyMatch
    ? {
        id: parseInt(companyMatch[1]),
        name: companyMatch[2],
        profile: companyMatch[3],
        size: companyMatch[4] || "",
      }
    : null;

  const jobDescription = stripHtml(mainJob.jobDescription || "");
  const jobRequirement = stripHtml(mainJob.jobRequirement || "");

  const canonicalMatch = rscPayload.match(/"canonical"[:\s]+"([^"]*)"/);

  return {
    source: "vietnamework",
    id: mainJob.jobId,
    title: mainJob.jobTitle,
    company: company?.name || mainJob.companyName || "",
    companyId: company?.id || mainJob.companyId || null,
    companyLogo: mainJob.companyLogo || "",
    companyProfile: decodeUnicodeEscapes(company?.profile || ""),
    companySize: company?.size || mainJob.companySize || "",
    wage: mainJob.prettySalary || "",
    salaryMin: mainJob.salaryMin || null,
    salaryMax: mainJob.salaryMax || null,
    experience: mainJob.jobLevelVI || mainJob.jobLevel || "",
    address: location?.address || mainJob.address || "",
    city: location?.cityVI || location?.city || "",
    skills,
    benefits,
    description: jobDescription,
    requirement: jobRequirement,
    urlDetail:
      mainJob.jobUrl ||
      (canonicalMatch
        ? `https://www.vietnamworks.com/${canonicalMatch[1]}`
        : ""),
    urlCompany: "",
    createdOn: mainJob.createdOn || "",
    approvedOn: mainJob.approvedOn || "",
    expiredOn: mainJob.expiredOn || "",
    isActive: mainJob.isActive || false,
    isApproved: mainJob.isApproved || false,
    isAnonymous: mainJob.isAnonymous || false,
    dateCraw: Date.now(),
  };
}

export { extractJobFromHtml };
