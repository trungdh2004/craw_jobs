export default {
  cv: {
    name: "Đỗ Hữu Trung",
    skills: [
      "JavaScript",
      "TypeScript",
      "React",
      "Vue.js",
      "Node.js",
      "HTML5",
      "CSS3",
      "Tailwind CSS",
      "Git",
      "REST API",
      "Responsive Design",
    ],
    experience: "Frontend Developer, 2+ years experience with React and Vue.js",
    education: "University degree in Computer Science / IT",
    preferredLocations: ["Hà Nội"],
    preferredSalary: "15-30 triệu",
    summary:
      "Frontend developer with 2+ years of experience building web applications using React, Vue.js, and TypeScript. Skilled in responsive design, API integration, and modern frontend toolchains.",
  },

  ai: {
    provider: "gemini",
    geminiApiKey: "key",
    geminiModel: "gemini-2.5-flash",
  },

  telegram: {
    botToken: process.env.TELEGRAM_KEY,
    chatId: process.env.TELEGRAM_CHAT_ID,
    matchThreshold: 70,
  },

  mimo: {
    serverUrl: process.env.MIMO_SERVER_URL || "http://127.0.0.1:6000",
  },

  scheduler: {
    cronExpression: "0 * * * *",
    enabled: true,
  },

  scrapers: [
    {
      name: "topcv",
      enabled: true,
      searchUrl:
        "https://www.topcv.vn/tim-viec-lam-frontend-tai-ha-noi-kl1?sort=new&type_keyword=1&sba=1&locations=l1&saturday_status=0",
      file_ids: "./data/topcv.txt",
      response: "./response/topcv.json",
    },
    {
      name: "vietnamwork",
      enabled: true,
      searchUrl: "",
      file_ids: "./data/vietnamwork.txt",
      response: "./response/vietnamwork.json",
    },
  ],
};
