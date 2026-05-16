import fs from "node:fs";
import http, { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { settings, rootDir, validateStartupConfig } from "./config";
import { logger } from "./logger";
import { generateEmailReply } from "./llm";
import {
  processFetchEmails,
  processListEmailSummaries,
  processSendEmail,
  processUpdateEmailDraft,
} from "./services";

const staticDir = path.join(rootDir, "static", "dist");

function sendJson(res: ServerResponse, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res: ServerResponse, text: string, status = 200, contentType = "text/plain") {
  res.writeHead(status, {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) return {};
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
  };
  return types[ext] ?? "application/octet-stream";
}

function serveStatic(req: IncomingMessage, res: ServerResponse, requestUrl: URL) {
  const decoded = decodeURIComponent(requestUrl.pathname);
  const requestedPath = decoded === "/" ? "index.html" : decoded.slice(1);
  const filePath = path.normalize(path.join(staticDir, requestedPath));
  const root = `${path.normalize(staticDir)}${path.sep}`;
  const target = filePath.startsWith(root) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(staticDir, "index.html");

  if (!fs.existsSync(target)) {
    sendText(res, "Frontend build not found. Run the UI build first.", 404);
    return;
  }

  res.writeHead(200, { "Content-Type": contentTypeFor(target) });
  fs.createReadStream(target).pipe(res);
}

async function handleFetchEmails(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  try {
    for await (const event of processFetchEmails()) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Error streaming email fetch", message);
    res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
  } finally {
    res.end();
  }
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? `${settings.host}:${settings.port}`}`);
  const method = req.method ?? "GET";

  if (method === "GET" && requestUrl.pathname === "/api/emails/fetch") {
    await handleFetchEmails(req, res);
    return;
  }

  if (method === "GET" && requestUrl.pathname === "/api/emails/summaries") {
    const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "100", 10);
    sendJson(res, await processListEmailSummaries(Number.isFinite(limit) ? limit : 100));
    return;
  }

  if (method === "POST" && requestUrl.pathname === "/api/emails/reply") {
    const data = await readJson(req);
    try {
      const [success, message] = await processSendEmail(
        String(data.message_id ?? ""),
        String(data.to_email ?? ""),
        String(data.subject ?? ""),
        String(data.body ?? ""),
      );
      sendJson(res, { success, message });
    } catch (error) {
      const message = `Error sending email: ${error instanceof Error ? error.message : String(error)}`;
      logger.error("Error sending email", message);
      sendJson(res, { success: false, message });
    }
    return;
  }

  if (method === "POST" && requestUrl.pathname === "/api/emails/draft") {
    const data = await readJson(req);
    const messageId = String(data.message_id ?? "");
    const draftReply = String(data.draft_reply ?? "");
    if (!messageId) {
      sendJson(res, { success: false, error: "message_id is required" });
      return;
    }
    sendJson(res, await processUpdateEmailDraft(messageId, draftReply));
    return;
  }

  if (method === "POST" && requestUrl.pathname === "/api/emails/generate_reply") {
    const data = await readJson(req);
    const emailContent = String(data.email_content ?? "");
    if (!emailContent) {
      sendJson(res, { success: false, error: "Email content is required" });
      return;
    }
    try {
      const reply = await generateEmailReply(emailContent);
      sendJson(res, { success: true, reply });
    } catch (error) {
      const message = `Error generating reply: ${error instanceof Error ? error.message : String(error)}`;
      logger.error("Error generating reply", message);
      sendJson(res, { success: false, error: message });
    }
    return;
  }

  if (method === "GET" || method === "HEAD") {
    serveStatic(req, res, requestUrl);
    return;
  }

  sendJson(res, { success: false, error: "Not found" }, 404);
}

validateStartupConfig();

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Unhandled request error", message);
    if (!res.headersSent) {
      sendJson(res, { success: false, error: message }, 500);
    } else {
      res.end();
    }
  });
});

server.listen(settings.port, settings.host, () => {
  logger.info(`TypeScript backend running on http://${settings.host}:${settings.port}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
