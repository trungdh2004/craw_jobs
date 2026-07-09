import { execSync } from "child_process";

export async function analyzeJobWithMimo(job, cvConfig) {
  const jobDesc = job.description
    ?.map((s) => `${s.title}:\n${s.items.join("\n")}`)
    .join("\n\n") || job.title;

  const prompt = `You are a job matching assistant. Analyze how well this job matches the candidate's profile.

## Candidate Profile
- Name: ${cvConfig.name}
- Skills: ${cvConfig.skills.join(", ")}
- Experience: ${cvConfig.experience}
- Education: ${cvConfig.education}
- Preferred locations: ${cvConfig.preferredLocations.join(", ")}
- Preferred salary: ${cvConfig.preferredSalary}
- Summary: ${cvConfig.summary}

## Job Details
- Title: ${job.title}
- Company: ${job.company}
- Wage: ${job.wage}
- Experience required: ${job.experience}
- Location: ${job.address}
- Description:
${jobDesc}

## Instructions
Return ONLY a JSON object (no markdown, no code blocks) with this exact structure:
{
  "matchPercentage": <number 0-100>,
  "summary": "<1-2 sentence summary of why this job matches or doesn't>",
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "concerns": ["<concern 1>", "<concern 2>", ...]
}

Consider: skill match, experience level match, location match, salary match. Be realistic and honest.`;

  console.log("[MIMO] Analyzing job:", job.title);

  const escapedPrompt = prompt.replace(/'/g, "'\\''");
  const result = execSync(
    `echo '${escapedPrompt}' | mimo run`,
    { encoding: "utf-8", timeout: 120000, maxBuffer: 1024 * 1024 }
  );

  const jsonMatch = result.match(/\{[\s\S]*"matchPercentage"[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[MIMO DEBUG] No JSON found in response");
    throw new Error("No JSON found in MiMo response");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return validateResult(parsed);
}

function validateResult(data) {
  if (typeof data.matchPercentage !== "number") {
    data.matchPercentage = 0;
  }
  data.matchPercentage = Math.max(
    0,
    Math.min(100, Math.round(data.matchPercentage)),
  );
  if (typeof data.summary !== "string") data.summary = "";
  if (!Array.isArray(data.strengths)) data.strengths = [];
  if (!Array.isArray(data.concerns)) data.concerns = [];
  return data;
}
