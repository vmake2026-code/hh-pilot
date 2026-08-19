const APP_CONFIG = {
  name: "ResumePilot",
  version: "0.1.0",
  description: "Сервис для создания и оптимизации резюме",
  allowedVacancyHosts: ["hh.ru"],
  maxFileSizeMB: 10,
  maxTextInputLength: 50_000,
} as const;

export { APP_CONFIG };
