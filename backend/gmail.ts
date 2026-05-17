import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { google, gmail_v1 } from "googleapis";
import { rootDir, settings } from "./config";
import { logger } from "./logger";
import type { GmailMessage } from "./types";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

const credentialsPath = path.join(rootDir, "secrets", "credentials.json");
const tokenPath = path.join(rootDir, "secrets", "token.json");

type InstalledCredentials = {
  installed?: {
    client_id?: string;
    client_secret?: string;
    redirect_uris?: string[];
  };
  web?: {
    client_id?: string;
    client_secret?: string;
    redirect_uris?: string[];
  };
};

function openExternal(url: string) {
  const command =
    process.platform === "win32"
      ? "cmd"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function readOAuthClient() {
  if (!fs.existsSync(credentialsPath)) {
    logger.error(`Credentials file not found at ${credentialsPath}`);
    return null;
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8")) as InstalledCredentials;
  const source = credentials.installed ?? credentials.web;
  if (!source?.client_id || !source.client_secret) {
    throw new Error("secrets/credentials.json is missing OAuth client_id or client_secret.");
  }

  return new google.auth.OAuth2(source.client_id, source.client_secret, "http://127.0.0.1:0/oauth2callback");
}

async function getAuthorizationCode(auth: InstanceType<typeof google.auth.OAuth2>): Promise<string> {
  return await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
        const code = requestUrl.searchParams.get("code");
        const error = requestUrl.searchParams.get("error");
        if (error) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end(`Authentication failed: ${error}`);
          reject(new Error(error));
          server.close();
          return;
        }
        if (!code) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("No authorization code found.");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Gmail authentication complete. You can return to AI Agent Pro.");
        resolve(code);
        server.close();
      } catch (caught) {
        reject(caught);
        server.close();
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not start local OAuth callback server."));
        return;
      }
      const callbackUrl = `http://127.0.0.1:${address.port}/oauth2callback`;
      (auth as unknown as { redirectUri: string }).redirectUri = callbackUrl;
      const url = auth.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent",
      });
      logger.info(`Opening Gmail authorization URL: ${url}`);
      openExternal(url);
    });

    server.on("error", reject);
    server.setTimeout(180_000, () => {
      reject(new Error("Timed out waiting for Gmail authentication."));
      server.close();
    });
  });
}

export async function getGmailService() {
  try {
    const auth = readOAuthClient();
    if (!auth) return null;

    if (fs.existsSync(tokenPath)) {
      auth.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf8")));
    }

    const credentials = auth.credentials;
    if (!credentials.access_token && !credentials.refresh_token) {
      const code = await getAuthorizationCode(auth);
      const token = await auth.getToken(code);
      auth.setCredentials(token.tokens);
      fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
      fs.writeFileSync(tokenPath, JSON.stringify(token.tokens, null, 2), "utf8");
    } else if (credentials.expiry_date && credentials.expiry_date <= Date.now() && credentials.refresh_token) {
      const refreshed = await auth.refreshAccessToken();
      auth.setCredentials(refreshed.credentials);
      fs.writeFileSync(tokenPath, JSON.stringify(auth.credentials, null, 2), "utf8");
    }

    return google.gmail({ version: "v1", auth });
  } catch (error) {
    logger.error("Error authenticating with Gmail", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function fetchEmails(service: gmail_v1.Gmail, maxResults = settings.maxEmailsToFetch) {
  try {
    const results = await service.users.messages.list({
      userId: "me",
      q: "in:inbox is:unread",
      maxResults: Math.max(1, Math.min(maxResults, 10)),
      labelIds: ["INBOX"],
    });
    const messages = results.data.messages ?? [];
    if (messages.length === 0) {
      logger.info("No unread inbox messages found.");
      return [];
    }
    logger.info(`Found ${messages.length} unread inbox messages.`);

    const emailContents: GmailMessage[] = [];
    for (const message of messages) {
      if (!message.id) continue;
      try {
        const fullMessage = await service.users.messages.get({
          userId: "me",
          id: message.id,
          format: "full",
        });
        emailContents.push(fullMessage.data as GmailMessage);
        await service.users.messages.modify({
          userId: "me",
          id: message.id,
          requestBody: { removeLabelIds: ["UNREAD"] },
        });
        logger.info(`Fetched and marked message ${message.id} as read`);
      } catch (error) {
        logger.error(`Error fetching/modifying message ${message.id}`, error instanceof Error ? error.message : error);
      }
    }
    return emailContents;
  } catch (error) {
    logger.error("Error listing messages", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function sendReply(
  service: gmail_v1.Gmail,
  originalMessageId: string,
  toEmail: string,
  subject: string,
  messageBody: string,
): Promise<[boolean, string]> {
  try {
    const originalMessage = await service.users.messages.get({
      userId: "me",
      id: originalMessageId,
      format: "metadata",
    });
    const threadId = originalMessage.data.threadId ?? undefined;
    const raw = [
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      messageBody,
    ].join("\r\n");

    const sentMessage = await service.users.messages.send({
      userId: "me",
      requestBody: {
        raw: Buffer.from(raw).toString("base64url"),
        threadId,
      },
    });
    const id = sentMessage.data.id ?? "";
    logger.info(`Reply sent successfully. Message ID: ${id}`);
    return [true, id];
  } catch (error) {
    logger.error("Error sending reply", error instanceof Error ? error.message : error);
    return [false, error instanceof Error ? error.message : String(error)];
  }
}
