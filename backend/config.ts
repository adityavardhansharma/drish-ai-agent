import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

export const rootDir = path.resolve(__dirname, "..");

for (const fileName of [".env", ".env.local"]) {
  const envPath = path.join(rootDir, fileName);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: fileName === ".env.local" });
  }
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function intEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

export const settings = {
  aiProvider: process.env.AI_PROVIDER ?? "openrouter",
  openrouterApiKey: optionalEnv("OPENROUTER_API_KEY"),
  openrouterModel: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
  openrouterEmailModel: optionalEnv("OPENROUTER_EMAIL_MODEL"),
  openrouterProviderOrder: process.env.OPENROUTER_PROVIDER_ORDER ?? "",
  openrouterHttpReferer: optionalEnv("OPENROUTER_HTTP_REFERER"),
  openrouterAppTitle: process.env.OPENROUTER_APP_TITLE ?? "AI Agent Pro",
  maxEmailsToFetch: intEnv("MAX_EMAILS_TO_FETCH", 10),
  logLevel: process.env.LOG_LEVEL ?? "INFO",
  logFile: process.env.LOG_FILE ?? "logs/email_summarizer.log",
  host: process.env.HOST ?? "127.0.0.1",
  port: intEnv("PORT", 5000),
  convexUrl: optionalEnv("CONVEX_URL"),
  convexAppSecret: optionalEnv("CONVEX_APP_SECRET"),
  convexAdminKey: optionalEnv("CONVEX_ADMIN_KEY"),
};

export function validateStartupConfig() {
  if (settings.aiProvider.toLowerCase() !== "openrouter") {
    throw new Error("Only AI_PROVIDER=openrouter is currently supported.");
  }
  if (!settings.openrouterApiKey) {
    throw new Error("API key missing. Set OPENROUTER_API_KEY.");
  }
}
