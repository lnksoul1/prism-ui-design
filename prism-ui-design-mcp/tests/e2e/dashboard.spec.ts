import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Optional: `PRISM_SKIP_E2E=1` skips the browser smoke (e.g. no Chromium in CI).
test.skip(process.env.PRISM_SKIP_E2E === "1", "e2e skipped via PRISM_SKIP_E2E");

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const p = addr.port;
        srv.close(() => resolve(p));
      } else {
        srv.close(() => reject(new Error("could not allocate a free port")));
      }
    });
  });
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not become healthy at ${url}`);
}

let server: ChildProcess | null = null;
let port = 0;

test.beforeAll(async () => {
  port = await getFreePort();
  server = spawn(process.execPath, [path.resolve(__dirname, "..", "..", "dist", "index.js")], {
    cwd: path.resolve(__dirname, "..", ".."),
    env: {
      ...process.env,
      DASHBOARD_PORT: String(port),
      PRISM_AUTOIMPORT: "off",
      PRISM_AUTOLOAD: "off",
      PRISM_PROJECT_DIR: path.join(os.tmpdir(), "prism-e2e"),
    },
    stdio: "ignore",
  });
  await waitForHealth(`http://127.0.0.1:${port}/health`, 20000);
});

test.afterAll(() => {
  if (server) server.kill();
});

test("dashboard loads with the premium empty state", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".placeholder-guide")).toBeVisible();
  await expect(page.locator("#prompt-input")).toBeVisible();
  await expect(page.locator("#project-btn")).toBeVisible();
  expect(errors).toEqual([]);
});

test("start-from-template creates a page", async ({ page }: { page: Page }) => {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await page.locator("#empty-template").click();
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });
});
