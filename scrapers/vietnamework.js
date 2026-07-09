import axios from "axios";
import { extractJobFromHtml } from "./vietnamework-html.js";
import {
  appendCrawledIds,
  readCrawledIds,
  readJsonFile,
  writeJobToCsv,
  writeJsonFile,
} from "../lib/common.js";

async function list() {
  try {
    const { data } = await axios.post(
      "https://ms.vietnamworks.com/job-search/v1.0/search",
      {
        query: "frontend",
        filter: [
          {
            field: "workingLocations.cityId",
            value: "24",
          },
          {
            field: "workingLocations.districtId",
            value: '[{"cityId":24,"districtId":[-1]}]',
          },
        ],
        ranges: [],
        order: [
          {
            field: "approvedOn",
            value: "desc",
          },
        ],
        hitsPerPage: 50,
        page: 0,
        retrieveFields: [
          "address",
          "benefits",
          "jobTitle",
          "salaryMax",
          "salaryMin",
          "prettySalary",
          "jobLevelVI",
          "companyName",
          "jobLevel",
          "jobLevelId",
          "jobId",
          "jobUrl",
          "companyId",
          "approvedOn",
          "isAnonymous",
          "alias",
          "expiredOn",
          "industries",
          "industriesV3",
          "workingLocations",
          "services",
          "companyName",
          "salary",
          "onlineOn",
          "onlineOnText",
          "simpleServices",
          "visibilityDisplay",
          "isShowLogoInSearch",
          "priorityOrder",
          "skills",
          "profilePublishedSiteMask",
          "jobDescription",
          "jobRequirement",
          "requiredCoverLetter",
          "languageSelectedVI",
          "languageSelected",
          "languageSelectedId",
          "typeWorkingId",
          "createdOn",
          "isAdrLiteJob",
          "applicantSignal",
          "numOfApplications",
        ],
        summaryVersion: "",
      },
    );

    const selectJob = data?.data?.map((job) => ({
      id: job.jobId,
      alias: job.alias,
      source: "vietnamwork",
      title: job.jobTitle,
      company: job.companyName,
      wage: job.prettySalary,
      experience: job.jobLevelVI,
      address: job.address,
      label:
        job.prettySalary +
        " | " +
        job.jobLevelVI +
        "|" +
        job?.workingLocations[0]?.cityName,
      urlDetail: job.jobUrl,
      urlCompany: "",
      description: [],
    }));

    return selectJob;
  } catch (error) {
    console.log(error);
    throw new Error(`Error occurred while fetching job list: ${error.message}`);
  }
}

async function fetchJobDetail(listJob) {
  try {
    const jobDetails = await Promise.all(
      listJob.map(async (job) => {
        try {
          console.log(`https://www.vietnamworks.com/${job}`);
          const { data } = await axios.get(
            `https://www.vietnamworks.com/${job}`,
            {
              responseType: "text", // Ép Axios hiểu kết quả trả về là chuỗi thuần (HTML/Text)
            },
          );
          const value = await extractJobFromHtml(data);

          return {
            deadline: value?.deadline || "",
            description: [
              {
                title: "Mô tả công việc",
                content: value?.description || "",
              },
              {
                title: "Yêu cầu công việc",
                content: value?.requirement || "",
              },
              {
                title: "Quyền lợi",
                content:
                  value?.benefits?.map((benefit) => benefit.value).join(",") ||
                  "",
              },
              {
                title: "Kỹ năng",
                content: value?.skills || "",
              },
            ],
            source: "vietnamwork",
            id: value.id,
            title: value.title,
            company: value.company,
            wage: value.wage,
            experience: value.experience,
            address: value.address,
            label: value.label,
            urlDetail: value.urlDetail,
            urlCompany: value.urlCompany,
            is_AI: false,
            create_at: Date.now(),
          };
        } catch (error) {
          console.error(
            `Error occurred while fetching detail for job ${job}:`,
            error,
          );
          return null;
        }
      }),
    );

    return jobDetails;
  } catch (error) {
    console.error("Error occurred while fetching job details:", error);
    return [];
  }
}

export default async function initVietnam(browser, source) {
  try {
    console.log(`\n[${new Date().toISOString()}] Bắt đầu crawl Vietnamwork...`);
    const crawledIds = await readCrawledIds(source.file_ids);
    const listJob = await list();
    console.log(
      `\n[${new Date().toISOString()}] Số lượng công việc tìm thấy: ${listJob.length}`,
    );
    const newJobs = listJob.filter(
      (job) => job.id && !crawledIds.has("" + job.id),
    );

    if (newJobs.length === 0) {
      return;
    }
    console.log(
      `\n[${new Date().toISOString()}] Số lượng công việc mới: ${newJobs.length}`,
    );

    const listAlias = newJobs.map((job) => `${job.alias}-${job.id}-jv`);
    console.log(listAlias);

    const listDetail = await fetchJobDetail(listAlias);

    if (listDetail.length === 0) return;

    const listIdNew = listDetail.map((job) => job.id);
    console.log(listIdNew);
    if (listIdNew.length > 0) {
      await appendCrawledIds(listIdNew, source.file_ids);
      listIdNew.forEach((id) => crawledIds.add(id));
    }

    const existingJobs = await readJsonFile(source.response);
    const mergedJobs = [...existingJobs, ...listDetail];
    await writeJsonFile(source.response, mergedJobs);
    await writeJobToCsv(source.name, mergedJobs);
    console.log(
      "===================== Đã cào data từ TopCV lúc " +
        new Date().toISOString() +
        " =====================",
    );
    return {
      locator: source.name,
      newJobsCount: listDetail.length,
    };
  } catch (error) {
    console.log("Error occurred while scraping Vietnamwork:", error);
    return {
      locator: source.name,
      newJobsCount: 0,
      error: error.message,
    };
  }
}
