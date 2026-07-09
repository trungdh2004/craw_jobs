export async function analyzeJob(job, cvConfig, aiConfig) {
  const prompt = buildPrompt(job, cvConfig);

  if (aiConfig.provider === "gemini") {
    return await callGemini(prompt, aiConfig);
  }

  throw new Error(`Unknown AI provider: ${aiConfig.provider}`);
}

function buildPrompt(job, cv) {
  const jobDesc =
    job.description
      ?.map((s) => `${s.title}:\n${s.items.join("\n")}`)
      .join("\n\n") || job.title;

  return `You are a job matching assistant. Analyze how well this job matches the candidate's profile.

## Candidate Profile
- Name: ${cv.name}
- Skills: ${cv.skills.join(", ")}
- Experience: ${cv.experience}
- Education: ${cv.education}
- Preferred locations: ${cv.preferredLocations.join(", ")}
- Preferred salary: ${cv.preferredSalary}
- Summary: ${cv.summary}

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
}

const MATCH_SCHEMA = {
  type: "object",
  properties: {
    matchPercentage: { type: "number", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    concerns: { type: "array", items: { type: "string" } },
  },
  required: ["matchPercentage", "summary", "strengths", "concerns"],
};

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

async function callGemini(prompt, aiConfig) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${aiConfig.geminiModel}:generateContent?key=${aiConfig.geminiApiKey}`;

  return {
    matchPercentage: 70,
    summary: "This job is a good match for your skills and experience",
    strengths: ["Skill 1", "Skill 2"],
    concerns: ["Concern 1", "Concern 2"],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: MATCH_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  try {
    const parsed = JSON.parse(text);
    return validateResult(parsed);
  } catch (parseErr) {
    console.error("[AI DEBUG] Raw response:", text.slice(0, 500));
    throw new Error(`JSON parse error: ${parseErr.message}`);
  }
}
