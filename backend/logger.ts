import fs from "node:fs";
import path from "node:path";
import { rootDir, settings } from "./config";

const levels = ["ERROR", "WARN", "INFO", "DEBUG"] as const;
type Level = (typeof levels)[number];

function shouldLog(level: Level) {
  const configured = settings.logLevel.toUpperCase() as Level;
  const configuredIndex = levels.includes(configured) ? levels.indexOf(configured) : levels.indexOf("INFO");
  return levels.indexOf(level) <= configuredIndex;
}

function write(level: Level, message: string, meta?: unknown) {
  if (!shouldLog(level)) return;

  const suffix =
    meta === undefined
      ? ""
      : typeof meta === "string"
        ? ` ${meta}`
        : ` ${JSON.stringify(meta)}`;
  const line = `${new Date().toISOString()} - backend - ${level} - ${message}${suffix}`;
  console[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log"](line);

  try {
    const logPath = path.isAbsolute(settings.logFile)
      ? settings.logFile
      : path.join(rootDir, settings.logFile);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${line}\n`, "utf8");
  } catch {
  }
}

export const logger = {
  error: (message: string, meta?: unknown) => write("ERROR", message, meta),
  warn: (message: string, meta?: unknown) => write("WARN", message, meta),
  info: (message: string, meta?: unknown) => write("INFO", message, meta),
  debug: (message: string, meta?: unknown) => write("DEBUG", message, meta),
};
