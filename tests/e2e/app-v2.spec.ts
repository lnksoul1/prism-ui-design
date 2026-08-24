import { test, expect } from "@playwright/test";
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
      PRISM_PROJECT_DIR: path.join(os.tmpdir(), `prism-e2e-v2-${Date.now()}`),
      PRISM_PRODUCT_DIR: path.join(os.tmpdir(), `prism-e2e-v2-products-${Date.now()}`),
    },
    stdio: "ignore",
  });
  await waitForHealth(`http://127.0.0.1:${port}/health`, 20000);
});

test.afterEach(() => {
  if (server) server.kill();
  server = null;
});

// V2 React 客户端冒烟：依赖 client-v2/dist 构建产物（先 npm --prefix client-v2 run build）
// 与服务端 /v2 静态挂载（src/index.ts clientV2Dist）。断言只覆盖壳结构与
// API 驱动的 UI，不依赖 autoimport 生成的具体项目内容。
test.describe("Prism V2 React client", () => {
  test("shell renders with library, canvas and inspector", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(String(err)));

    await page.goto(`http://127.0.0.1:${port}/v2/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await expect(page.locator(".logo")).toHaveText("✦ Prism V2");
    await expect(page.locator(".panel-left .panel-title").first()).toBeVisible();
    await expect(page.locator(".canvas-host")).toBeVisible();
    await expect(page.locator(".panel-right")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("design library loads from API and breakpoint switch works", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(String(err)));

    await page.goto(`http://127.0.0.1:${port}/v2/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    // 设计库由 /api/design-library 驱动：目录渲染出“风格（N）”分区标题
    await expect(page.getByText("风格（")).toBeVisible({ timeout: 10_000 });
    // 断点切换：点击“手机”后 active 按钮文本为“手机”
    await page.getByRole("button", { name: "手机", exact: true }).click();
    await expect(page.locator(".bp-btn.active")).toHaveText("手机");

    expect(errors).toEqual([]);
  });
});

// V2 M2 冒烟：AI 面板与盒子模式渲染。第二个用例通过 REST 直接添加 chart
// 组件（绕过 LLM 依赖），依赖服务端 WS change 广播驱动客户端全量刷新。
test.describe("Prism V2 M2 features", () => {
  test("AI panel renders with input and generate button", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/v2/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await expect(page.getByPlaceholder(/描述你想要的页面/)).toBeVisible();
    await expect(page.getByRole("button", { name: "生成" })).toBeVisible();
  });

  test("adding a box-mode component renders placeholder", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/v2/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    // 等设计库/画布就绪后再发 POST，确保 WS 已连接以接收 change 广播
    await expect(page.locator(".canvas-host")).toBeVisible();
    // chart 等 BOX_MODE_TYPES 不在服务端 COMPONENT_TYPES 清单内（POST 会 400），
    // 因此走真实 M2 链路：先加一个 text 组件，再通过 box-mode 端点启用盒子模式。
    await page.evaluate(async () => {
      const res = await fetch("/api/component", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text", props: { text: "盒子模式" }, parent_id: null }),
      });
      const data = (await res.json()) as { id: string };
      await fetch(`/api/component/${data.id}/box-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
    });
    await expect(page.locator(".box-mode-placeholder")).toBeVisible({ timeout: 10_000 });
  });
});
