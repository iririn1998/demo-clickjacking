// The "victim" site: SecureBook. A deliberately simple login + account page
// with a 退会 (withdraw / delete account) button. By default it serves the
// account page WITHOUT any framing protection, so it can be embedded in an
// attacker's transparent iframe. A `?protection=` query flips on the usual
// defenses so the demo can show them working.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { accountPage, deletedPage, loginPage } from "./pages.ts";
import {
  checkCredentials,
  createSession,
  deleteAccount,
  destroySession,
  getAccount,
  getSessionUser,
  resetAccount,
} from "./store.ts";

const HOST = process.env.VICTIM_HOST ?? "127.0.0.1";
const PORT = Number(process.env.VICTIM_PORT ?? 5174);

export type Protection = "none" | "xfo-deny" | "xfo-sameorigin" | "csp";

const PROTECTIONS = new Set<Protection>(["none", "xfo-deny", "xfo-sameorigin", "csp"]);

const parseProtection = (value: string | null): Protection =>
  value && PROTECTIONS.has(value as Protection) ? (value as Protection) : "none";

// Apply the framing defense that matches the selected mode. This is the whole
// point of the demo: "none" is vulnerable, the others block embedding.
const applyProtection = (res: ServerResponse, protection: Protection): void => {
  switch (protection) {
    case "xfo-deny":
      res.setHeader("X-Frame-Options", "DENY");
      break;
    case "xfo-sameorigin":
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      break;
    case "csp":
      res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
      break;
    case "none":
      break;
  }
};

const parseCookies = (header: string | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
};

const readBody = (req: IncomingMessage): Promise<URLSearchParams> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      // Guard against runaway bodies; form posts here are tiny.
      if (size > 64 * 1024) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(new URLSearchParams(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });

const html = (res: ServerResponse, status: number, body: string): void => {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
};

const redirect = (res: ServerResponse, location: string, cookie?: string): void => {
  const headers: Record<string, string> = { Location: location };
  if (cookie) headers["Set-Cookie"] = cookie;
  res.writeHead(303, headers);
  res.end();
};

const sessionCookie = (sid: string): string =>
  `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`;

const clearCookie = (): string => "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";

// CORS that works with credentials: reflect the caller's Origin (instead of
// "*") and allow cookies, so the attacker page can read whether the victim is
// currently logged in. Mirrors how a careless API might be configured.
const corsHeaders = (req: IncomingMessage): Record<string, string> => {
  const origin = req.headers.origin;
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        Vary: "Origin",
      }
    : { "Access-Control-Allow-Origin": "*" };
};

const json = (req: IncomingMessage, res: ServerResponse, status: number, data: unknown): void => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(req),
  });
  res.end(JSON.stringify(data));
};

export const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? HOST}`);
  const path = url.pathname;
  const method = req.method ?? "GET";
  const cookies = parseCookies(req.headers.cookie);
  const user = getSessionUser(cookies["sid"]);

  // CORS preflight for the status/reset API used by the attacker page.
  if (method === "OPTIONS" && path.startsWith("/api/")) {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...corsHeaders(req),
    });
    res.end();
    return;
  }

  if (path === "/api/status") {
    const account = getAccount();
    json(req, res, 200, {
      username: account.username,
      exists: account.exists,
      deletedAt: account.deletedAt,
      deleteCount: account.deleteCount,
      loggedIn: Boolean(user),
    });
    return;
  }

  if (path === "/api/reset" && method === "POST") {
    resetAccount();
    json(req, res, 200, { ok: true, exists: true });
    return;
  }

  if (path === "/" && method === "GET") {
    if (user) {
      redirect(res, "/account");
      return;
    }
    html(res, 200, loginPage());
    return;
  }

  if (path === "/login" && method === "POST") {
    const body = await readBody(req);
    const username = body.get("username") ?? "";
    const password = body.get("password") ?? "";
    if (checkCredentials(username, password)) {
      redirect(res, "/account", sessionCookie(createSession(username)));
      return;
    }
    html(res, 401, loginPage("ユーザー名またはパスワードが正しくありません。"));
    return;
  }

  if (path === "/logout" && method === "POST") {
    destroySession(cookies["sid"]);
    redirect(res, "/", clearCookie());
    return;
  }

  if (path === "/account" && method === "GET") {
    const protection = parseProtection(url.searchParams.get("protection"));
    applyProtection(res, protection);
    if (!user) {
      // Not logged in: show the login page (still framable when protection=none
      // so the demo degrades gracefully, but nothing can be deleted).
      html(res, 200, loginPage("先にログインしてください。"));
      return;
    }
    html(res, 200, accountPage(user));
    return;
  }

  if (path === "/account/delete" && method === "POST") {
    // Protection also applies here so a blocked frame cannot even submit.
    const protection = parseProtection(url.searchParams.get("protection"));
    applyProtection(res, protection);
    if (!user) {
      html(res, 401, loginPage("セッションが無効です。"));
      return;
    }
    deleteAccount();
    destroySession(cookies["sid"]);
    res.setHeader("Set-Cookie", clearCookie());
    html(res, 200, deletedPage());
    return;
  }

  html(res, 404, loginPage("ページが見つかりません。"));
};

export const createVictimServer = () => createServer(handle);

// Start only when run directly, not when imported by tests.
if (import.meta.main) {
  createVictimServer().listen(PORT, HOST, () => {
    process.stdout.write(`victim (SecureBook) listening on http://${HOST}:${PORT}\n`);
  });
}
