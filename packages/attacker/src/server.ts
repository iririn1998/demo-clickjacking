// The "attacker" site. It serves exactly one page: the trap. It never talks to
// the victim server itself — the victim embedding and the delete request all
// happen in the user's browser, carrying the user's own session cookie. That is
// what makes clickjacking work.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { trapPage } from "./page.ts";

const HOST = process.env.ATTACKER_HOST ?? "127.0.0.1";
const PORT = Number(process.env.ATTACKER_PORT ?? 5173);
const VICTIM_ORIGIN = process.env.VICTIM_ORIGIN ?? "http://127.0.0.1:5174";

export const handle = (req: IncomingMessage, res: ServerResponse): void => {
  const path = new URL(req.url ?? "/", `http://${req.headers.host ?? HOST}`).pathname;

  if (path === "/" || path === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(trapPage(VICTIM_ORIGIN));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
};

export const createAttackerServer = () => createServer(handle);

if (import.meta.main) {
  createAttackerServer().listen(PORT, HOST, () => {
    process.stdout.write(`attacker (trap page) listening on http://${HOST}:${PORT}\n`);
    process.stdout.write(`  embeds victim at ${VICTIM_ORIGIN}\n`);
  });
}
