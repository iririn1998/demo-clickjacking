import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

type Session = {
  csrf: string;
  isPublic: boolean;
  publications: number;
  lastChanged: string | null;
};

export const protectionHeaders = {
  none: {},
  csp: { "Content-Security-Policy": "frame-ancestors 'none'" },
  deny: { "X-Frame-Options": "DENY" },
  sameorigin: { "X-Frame-Options": "SAMEORIGIN" },
} as const;

const observerOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  "http://localhost:5173",
  "http://localhost:4173",
]);

const accountPage = (
  session: Session,
  protection: keyof typeof protectionHeaders,
) => `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>デモ SNS — 公開設定</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #222; background: white; }
    main { position: relative; height: 260px; padding: 16px 20px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { margin: 4px 0; }
    button { position: absolute; left: 20px; top: 150px; width: 240px; height: 44px; font: inherit; cursor: pointer; }
    small { position: absolute; left: 20px; top: 210px; }
  </style>
</head>
<body>
  <main>
    <h1>デモ SNS：プロフィール設定</h1>
    <p>デモ利用者としてログイン済み</p>
    <p>公開範囲：<strong>${session.isPublic ? "全体公開" : "非公開"}</strong></p>
    <form method="post" action="/publish?protection=${protection}">
      <input type="hidden" name="csrf" value="${session.csrf}">
      <button type="submit" ${session.isPublic ? "disabled" : ""}>${session.isPublic ? "公開しました" : "プロフィールを全体公開する"}</button>
    </form>
    <small>架空の設定です。実データは扱いません。</small>
  </main>
</body>
</html>`;

export const createDemoServer = () => {
  const sessions = new Map<string, Session>();

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    // Ports separate origins, but remain same-site in this local demo.
    const host = request.headers.host ?? "";
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
      response.writeHead(403).end("Local demo only");
      return;
    }
    const url = new URL(request.url ?? "/", `http://${host}`);
    const origin = request.headers.origin;
    const observerAllowed = origin !== undefined && observerOrigins.has(origin);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");

    // Read/reset access is presenter instrumentation, not an attack prerequisite.
    if (url.pathname.startsWith("/api/") && observerAllowed) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      response.setHeader("Vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      response
        .writeHead(observerAllowed ? 204 : 403, {
          "Access-Control-Allow-Methods": "GET, POST",
        })
        .end();
      return;
    }

    const cookieId = request.headers.cookie?.match(
      /(?:^|;\s*)clickjack_demo=([a-f0-9]{48})(?:;|$)/,
    )?.[1];
    const id = cookieId && sessions.has(cookieId) ? cookieId : randomBytes(24).toString("hex");
    if (!sessions.has(id)) {
      sessions.set(id, {
        csrf: randomBytes(24).toString("hex"),
        isPublic: false,
        publications: 0,
        lastChanged: null,
      });
      response.setHeader("Set-Cookie", `clickjack_demo=${id}; HttpOnly; SameSite=Lax; Path=/`);
    }
    const session = sessions.get(id)!;
    const mode = url.searchParams.get("protection") ?? "none";
    const protection = Object.hasOwn(protectionHeaders, mode)
      ? (mode as keyof typeof protectionHeaders)
      : "none";

    if (url.pathname === "/account" && request.method === "GET") {
      response
        .writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          ...protectionHeaders[protection],
        })
        .end(accountPage(session, protection));
      return;
    }

    if (url.pathname === "/publish" && request.method === "POST") {
      if (origin !== `http://${host}`) {
        response.writeHead(403).end("Invalid origin");
        return;
      }
      try {
        let body = "";
        for await (const chunk of request) {
          body += chunk.toString();
          if (body.length > 1024) {
            response.writeHead(413).end("Request too large");
            return;
          }
        }
        if (new URLSearchParams(body).get("csrf") !== session.csrf) {
          response.writeHead(403).end("Invalid CSRF token");
          return;
        }
        session.isPublic = true;
        session.publications += 1;
        session.lastChanged = new Date().toISOString();
        response.writeHead(303, { Location: `/account?protection=${protection}` }).end();
      } catch {
        if (!response.headersSent) response.writeHead(400).end("Invalid request");
      }
      return;
    }

    if (url.pathname === "/api/reset" && request.method === "POST" && observerAllowed) {
      session.isPublic = false;
      session.publications = 0;
      session.lastChanged = null;
      session.csrf = randomBytes(24).toString("hex");
      response.writeHead(204).end();
      return;
    }

    if (url.pathname === "/api/state" && request.method === "GET" && observerAllowed) {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(
        JSON.stringify({
          isPublic: session.isPublic,
          publications: session.publications,
          lastChanged: session.lastChanged,
        }),
      );
      return;
    }

    response.writeHead(404).end("Not found");
  });
};

export const demoServerPlugin = (): Plugin => {
  let demoServer: ReturnType<typeof createDemoServer> | undefined;
  const start = async (
    parent: { once: (event: "close", listener: () => void) => unknown } | null,
  ) => {
    demoServer = createDemoServer();
    const activeServer = demoServer;
    parent?.once("close", () => activeServer.close());
    await new Promise<void>((resolve, reject) => {
      activeServer.once("error", reject);
      activeServer.listen(5174, "127.0.0.1", () => {
        activeServer.removeListener("error", reject);
        resolve();
      });
    });
  };
  return {
    name: "local-clickjacking-demo",
    configureServer: (server) => {
      if (server.config.mode !== "test") return start(server.httpServer);
    },
    configurePreviewServer: (server) => start(server.httpServer),
    closeBundle: () => {
      demoServer?.close();
    },
  };
};
