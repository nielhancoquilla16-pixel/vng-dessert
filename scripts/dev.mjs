import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";

const isWindows = process.platform === "win32";
const rootDir = dirname(fileURLToPath(import.meta.url));

const services = [
  {
    name: "backend",
    cwd: resolve(rootDir, "../dessert-ai-system"),
    color: "\x1b[33m",
  },
  {
    name: "frontend",
    cwd: resolve(rootDir, "../frontend"),
    color: "\x1b[36m",
  },
];

const children = [];
let shuttingDown = false;

function prefixOutput(name, color, stream, target) {
  let buffered = "";

  stream.on("data", (chunk) => {
    buffered += chunk.toString();
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";

    for (const line of lines) {
      target.write(`${color}[${name}]\x1b[0m ${line}\n`);
    }
  });

  stream.on("end", () => {
    if (buffered) {
      target.write(`${color}[${name}]\x1b[0m ${buffered}\n`);
    }
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }

  setTimeout(() => process.exit(exitCode), 200);
}

for (const service of services) {
  const command = isWindows ? "cmd.exe" : "npm";
  const args = isWindows ? ["/d", "/s", "/c", "npm run dev"] : ["run", "dev"];

  const child = spawn(command, args, {
    cwd: service.cwd,
    stdio: ["inherit", "pipe", "pipe"],
    shell: false,
  });

  children.push(child);
  prefixOutput(service.name, service.color, child.stdout, process.stdout);
  prefixOutput(service.name, service.color, child.stderr, process.stderr);

  child.on("exit", (code) => {
    if (!shuttingDown && code && code !== 0) {
      process.stderr.write(`${service.color}[${service.name}]\x1b[0m exited with code ${code}\n`);
      shutdown(code);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
