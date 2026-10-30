// Starts both demo servers (victim + attacker) in one terminal.
// No external dependencies: just spawns `pnpm --filter <pkg> dev` for each.
import { spawn } from "node:child_process";

const targets = [
  { name: "victim", color: "\x1b[36m" }, // cyan
  { name: "attacker", color: "\x1b[35m" }, // magenta
];
const reset = "\x1b[0m";

const children = [];
let shuttingDown = false;

const shutdown = (code) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  process.exit(code ?? 0);
};

for (const target of targets) {
  const child = spawn("pnpm", ["--filter", target.name, "dev"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  children.push(child);

  const prefix = `${target.color}[${target.name}]${reset} `;
  const pipe = (stream, out) => {
    stream.setEncoding("utf8");
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) out.write(`${prefix}${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on("exit", (code) => {
    process.stdout.write(`${prefix}exited with code ${code ?? 0}\n`);
    shutdown(code ?? 0);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
