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

test.beforeEach(async () => {
  port = await getFreePort();
  server = spawn(process.execPath, [path.resolve(__dirname, "..", "..", "dist", "index.js")], {
    cwd: path.resolve(__dirname, "..", ".."),
    env: {
      ...process.env,
      DASHBOARD_PORT: String(port),
      PRISM_AUTOIMPORT: "off",
      PRISM_AUTOLOAD: "off",
      PRISM_PROJECT_DIR: path.join(os.tmpdir(), `prism-e2e-${Date.now()}`),
    },
    stdio: "ignore",
  });
  await waitForHealth(`http://127.0.0.1:${port}/health`, 20000);
});

test.afterEach(() => {
  if (server) server.kill();
  server = null;
});

test("dashboard loads with the premium empty state", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".placeholder-guide")).toBeVisible();
  await expect(page.locator("#prompt-input")).toBeVisible();
  await expect(page.locator("#project-btn")).toBeVisible();

  // Sending a prompt shows a delivery status chip (queued for the agent)
  await page.fill("#prompt-input", "hello agent");
  await page.click("#prompt-send");
  await expect(page.locator("#prompt-status")).toHaveClass(/show/);
  await expect(page.locator("#prompt-status")).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test("drawing canvas mounts and offers a template-first start", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#canvas-mode-design").click();
  await expect(page.locator("#canvas-editor-wrap")).toBeVisible();
  // tldraw mounts its editor surface inside #canvas-editor
  await expect(page.locator("#canvas-editor .tl-container")).toBeVisible({ timeout: 15000 });
  // Empty page => the template picker appears
  await expect(page.locator("#canvas-template-modal")).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".template-card").first()).toBeVisible();
  // Start from the first template: closes the picker and materializes shapes
  await page.locator(".template-card").first().click();
  await page.waitForFunction(
    () => {
      const canvas = (globalThis as { PrismCanvas?: { countShapes(): number } }).PrismCanvas;
      return !!canvas && canvas.countShapes() > 0;
    },
    null,
    { timeout: 10000 }
  );

  // Drag a library component straight onto the drawing canvas
  await page.locator('.lib-tab[data-lib="components"]').click();
  await page.waitForSelector('#library-list .lib-item[data-lib-type="components"]', { timeout: 5000 });
  const beforeDrop = await page.evaluate(() => {
    const canvas = (globalThis as { PrismCanvas?: { countShapes(): number } }).PrismCanvas;
    return canvas ? canvas.countShapes() : -1;
  });
  await page.evaluate(`(() => {
    const item = document.querySelector('#library-list .lib-item[data-lib-type="components"]');
    const editor = document.querySelector("#canvas-editor");
    if (!item || !editor) return;
    const rect = editor.getBoundingClientRect();
    const dt = new DataTransfer();
    item.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    const x = rect.left + 140;
    const y = rect.top + 140;
    editor.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
    editor.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
  })()`);
  await page.waitForTimeout(900);
  const afterDrop = await page.evaluate(() => {
    const canvas = (globalThis as { PrismCanvas?: { countShapes(): number } }).PrismCanvas;
    return canvas ? canvas.countShapes() : -1;
  });
  expect(afterDrop).toBeGreaterThan(beforeDrop);
  expect(errors).toEqual([]);
});

test("start-from-template creates a page", async ({ page }: { page: Page }) => {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#empty-template").click();
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });
});
