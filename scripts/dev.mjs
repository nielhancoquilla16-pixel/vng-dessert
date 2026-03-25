import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";

const isWindows = process.platform === "win32";
const rootDir = dirname(fileURLToPath(import.meta.url));
const backendHealthUrl = process.env.VNG_BACKEND_HEALTH_URL || "http://localhost:3001/api/health";
const backendHealthTimeoutMs = 30000;
const backendHealthPollMs = 500;

const services = [
  {
    name: "backend",
    cwd: resolve(rootDir, "../dessert-ai-system"),
    color: "\x1b[33m",
  },
  {
    name: "V&G_LecheFlan",
    cwd: resolve(rootDir, "../frontend"),
    color: "\x1b[36m",
  },
];

const children = [];
let shuttingDown = false;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function isBackendHealthy() {
  try {
    const response = await fetch(backendHealthUrl, {
      method: "GET",
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function waitForBackendHealth() {
  const deadline = Date.now() + backendHealthTimeoutMs;

  while (Date.now() < deadline) {
    if (await isBackendHealthy()) {
      return true;
    }

    await wait(backendHealthPollMs);
  }

  return false;
}

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

function spawnService(service) {
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

  return child;
}

async function main() {
  const backendService = services.find((service) => service.name === "backend");
  const frontendService = services.find((service) => service.name === "V&G_LecheFlan");

  if (!backendService || !frontendService) {
    throw new Error("Missing app or backend service configuration.");
  }

  if (await isBackendHealthy()) {
    process.stdout.write(`[dev] Reusing existing healthy backend at ${backendHealthUrl}\n`);
  } else {
    spawnService(backendService);
    process.stdout.write("[dev] Waiting for backend health before starting V&G_LecheFlan...\n");

    const backendReady = await waitForBackendHealth();
    if (!backendReady) {
      process.stderr.write(`[dev] Backend did not become healthy within ${backendHealthTimeoutMs}ms.\n`);
      shutdown(1);
      return;
    }
  }

  spawnService(frontendService);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

main().catch((error) => {
  process.stderr.write(`[dev] ${error.message}\n`);
  shutdown(1);
});
