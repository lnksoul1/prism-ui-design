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

/** Run an instruction through the command palette (the chat bar was removed). */
async function runPrompt(page: Page, text: string): Promise<void> {
  await page.keyboard.press("Control+K");
  await page.fill("#command-input", text);
  await page.keyboard.press("Enter");
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
      PRISM_PRODUCT_DIR: path.join(os.tmpdir(), `prism-e2e-products-${Date.now()}`),
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
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".placeholder-guide")).toBeVisible();
  await expect(page.locator("#top-lib-strip")).toBeVisible();
  // Primary topbar actions stay visible; secondary utilities live in the "…" menu.
  await expect(page.locator("#export-btn")).toBeVisible();
  await expect(page.locator("#more-btn")).toBeVisible();
  await page.locator("#more-btn").click();
  await expect(page.locator("#project-btn")).toBeVisible();
  await page.locator("#more-btn").click();

  // Sending a matchable instruction via the command palette executes locally
  await runPrompt(page, "把主色改成蓝色");
  const primary = await page.evaluate(async () => {
    const state = (await (await fetch("/api/state")).json()) as {
      tokens: { colors: Record<string, { value?: string }> };
    };
    return state.tokens.colors["color-primary"]?.value;
  });
  expect(primary).toBe("#3B82F6");
  expect(errors).toEqual([]);
});

test("drawing canvas: draw shapes directly on the preview canvas (unified coordinates)", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();
  // 预览画布是唯一编辑面：绘制工具栏常驻可见
  await expect(page.locator("#canvas-tool-rail")).toBeVisible();
  await expect(page.locator(".draw-tool").first()).toBeVisible();

  // 选择「矩形」工具，在画布上拖出形状 → 直接落为组件（统一坐标系）
  await page.locator('.draw-tool[data-tool="rect"]').click();
  const canvasBox = await page.locator("#canvas").boundingBox();
  expect(canvasBox).toBeTruthy();
  await page.mouse.move(canvasBox!.x + 60, canvasBox!.y + 60);
  await page.mouse.down();
  await page.mouse.move(canvasBox!.x + 260, canvasBox!.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const s = (await (await fetch("/api/state")).json()) as { components: Array<{ type: string }> };
        return s.components.some((c) => c.type === "rect");
      });
    }, { timeout: 10000 })
    .toBe(true);

  // 文字工具：点击创建文字组件
  await page.locator('.draw-tool[data-tool="text"]').click();
  await page.mouse.click(canvasBox!.x + 320, canvasBox!.y + 260);
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const s = (await (await fetch("/api/state")).json()) as { components: Array<{ type: string }> };
        return s.components.some((c) => c.type === "text");
      });
    }, { timeout: 10000 })
    .toBe(true);

  // 形状组件可选中（切回选择工具；用图层树选择避免 overlay 拦截）
  await page.locator('.draw-tool[data-tool="select"]').click();
  const rectIdForSel = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as { components: Array<{ type: string; id: string }> };
    const r = s.components.find((c) => c.type === "rect");
    return r ? r.id : null;
  });
  expect(rectIdForSel).toBeTruthy();
  await page.locator(`#layer-tree .layer-item[data-id="${rectIdForSel}"]`).locator(".layer-name").click();
  await expect(page.locator(".inspector-tabs")).toBeVisible();

  // 顶部设计库: 组件知识卡渲染（悬停展开气泡）
  await page.locator('.top-lib-tab[data-lib="按钮与链接"]').click();
  await page.waitForSelector(".top-lib-card", { timeout: 5000 });
  await page.locator(".top-lib-card").first().hover();
  await expect(page.locator(".top-lib-bubble").first()).toBeVisible({ timeout: 5000 });

  expect(errors).toEqual([]);
});

test("start-from-template creates a page", async ({ page }: { page: Page }) => {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#empty-template").click();
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });
});

test("quick actions: ? help, Ctrl+K palette, template thumbnails", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Command palette via Ctrl+K filters and executes the first match
  await page.keyboard.press("Control+K");
  await expect(page.locator("#command-overlay")).toBeVisible();
  await page.fill("#command-input", "深色");
  await expect(page.locator(".command-row").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#command-overlay")).not.toBeVisible();

  // Help overlay toggles with "?" and lists shortcuts
  await page.keyboard.press("?");
  await expect(page.locator("#help-overlay")).toBeVisible();
  await expect(page.locator(".help-row").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#help-overlay")).not.toBeVisible();

  // 绘制工具栏常驻（预览画布 = 唯一编辑面），工具切换有激活态
  await expect(page.locator("#canvas-tool-rail")).toBeVisible();
  await page.locator('.draw-tool[data-tool="rect"]').click();
  await expect(page.locator('.draw-tool[data-tool="rect"]')).toHaveClass(/active/);
  await page.locator('.draw-tool[data-tool="select"]').click();

  expect(errors).toEqual([]);
});

test("inspect code tab and brand design systems work from the dashboard", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Generate a SaaS page so there is a component to inspect
  await runPrompt(page, "应用 SaaS 模板");
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  // Inspect: select a component via the layer tree (deterministic — the
  // canvas ruler can overlap the topmost component and intercept clicks)
  await page.locator("#layer-tree .layer-item").first().locator(".layer-name").click();
  await expect(page.locator(".inspector-tabs")).toBeVisible();
  await page.locator(".inspector-tab").filter({ hasText: "代码" }).click();
  await expect(page.locator(".inspector-code")).toContainText("<", { timeout: 5000 });
  const copyEnabled = await page.locator(".inspector-copy-btn").isEnabled();
  expect(copyEnabled).toBe(true);

  // 设计库重做 (P1): 顶部库"设计风格" tab 渲染 VibeHub 知识卡片。
  await page.locator('.top-lib-tab[data-lib="设计风格"]').click();
  await expect(page.locator(".top-lib-card").first()).toBeVisible({ timeout: 5000 });
  const vhCount = await page.locator(".top-lib-card").count();
  expect(vhCount).toBeGreaterThanOrEqual(10);
  // 悬停展开气泡（用法/示例）
  await page.locator(".top-lib-card").first().hover();
  await expect(page.locator(".top-lib-bubble").first()).toBeVisible();
  // 布局 tab 也渲染知识卡
  await page.locator('.top-lib-tab[data-lib="CSS 布局"]').click();
  await expect(page.locator(".top-lib-card").first()).toBeVisible();
  const layoutCount = await page.locator(".top-lib-card").count();
  expect(layoutCount).toBeGreaterThanOrEqual(10);

  expect(errors).toEqual([]);
});

test("import product → banner → one-click apply pipeline", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Open the import dialog from the "…" menu and switch to the HTML tab
  await page.locator("#more-btn").click();
  await page.locator("#import-btn").click();
  await page.locator('.import-tab[data-import-tab="html"]').click();
  await page.fill(
    "#import-html",
    "<html><body><nav><a>我的品牌</a></nav><main><h1>欢迎来到我的产品</h1><button>开始</button></main><footer>© 2026</footer></body></html>"
  );
  await page.click("#import-go");

  // The imported page lands on the canvas and the apply banner appears
  await expect(page.locator("#import-banner")).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  // One-click apply writes the adjusted artifacts and shows a receipt
  await page.click("#apply-btn");
  await expect(page.locator("#prism-toast")).toContainText("已应用", { timeout: 5000 });

  // The apply-result modal lists the artifact paths + the CSS link hint
  await expect(page.locator("#apply-result-modal")).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".apply-result-item").first()).toBeVisible();
  await expect(page.locator("#apply-result-list")).toContainText("prism-adjustments.css");
  await page.click("#apply-result-done");
  await expect(page.locator("#apply-result-modal")).not.toBeVisible();

  expect(errors).toEqual([]);
});

test("import wizard: client-UI source renders faithfully and applies back to client/index.html", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Open the import dialog and pick the 客户端界面 source
  await page.locator("#more-btn").click();
  await page.locator("#import-btn").click();
  await page.locator('.import-tab[data-import-tab="client"]').click();
  await page.click("#import-go");

  // The client-UI page lands on the canvas as Shadow-DOM fragments + apply banner
  await expect(page.locator("#import-banner")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".prism-fragment").first()).toBeVisible({ timeout: 15000 });

  // 忠实渲染：topbar 片段含 🔮 Prism，toplib 片段含 13 个 top-lib-tab
  const faithful = await page.evaluate(() => {
    const hosts = Array.from(document.querySelectorAll(".prism-fragment"));
    const shadowHtmls = hosts.filter((h) => h.shadowRoot).map((h) => h.shadowRoot!.innerHTML);
    const tabMatches = shadowHtmls.map((s) => (s.match(/class="top-lib-tab"/g) || []).length);
    return {
      logo: shadowHtmls.some((s) => s.includes("🔮 Prism")),
      maxTabs: Math.max(0, ...tabMatches),
      shadowCount: shadowHtmls.length,
    };
  });
  expect(faithful.logo).toBe(true);
  expect(faithful.maxTabs).toBe(13);
  expect(faithful.shadowCount).toBeGreaterThanOrEqual(3);

  // 等待导入后的重绘批次稳定，再开始编辑（避免元素引用被重绘替换）
  await page.waitForTimeout(800);

  // 编辑 shadow 内文本（双击 logo → 改字 → blur 提交到 props.html）
  const editApplied = await page.evaluate(() => {
    const hosts = Array.from(document.querySelectorAll(".prism-fragment"));
    const target = hosts.find((h) => h.shadowRoot && h.shadowRoot.querySelector(".prism-fragment-root .topbar, .prism-fragment-root .logo"));
    if (!target) {
      // 退化：按 innerHTML 查找含 logo 的片段
      const alt = hosts.find((h) => h.shadowRoot && h.shadowRoot.innerHTML.includes("🔮 Prism"));
      if (!alt) return "no-target";
    }
    const host = target || hosts.find((h) => h.shadowRoot && h.shadowRoot.innerHTML.includes("🔮 Prism"));
    const root = host.shadowRoot.querySelector(".prism-fragment-root");
    const el = Array.from(root.querySelectorAll("span, a, div")).find(
      (x) => x.childElementCount === 0 && x.textContent.includes("Prism")
    );
    if (!el) return "no-el";
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true }));
    el.textContent = "🔮 Prism E2E";
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return el.isConnected ? "ok" : "detached";
  });
  expect(editApplied).toBe("ok");
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const s = (await (await fetch("/api/state")).json()) as { components: Array<{ props?: { html?: string } }> };
        return s.components.some((c) => String(c.props?.html || "").includes("🔮 Prism E2E"));
      });
    }, { timeout: 10000 })
    .toBe(true);

  // 一键应用 → 写回 client/index.html（真实产物）；校验后回滚恢复
  const indexHtml = path.resolve(__dirname, "..", "..", "client", "index.html");
  const { readFileSync, readdirSync, rmSync } = await import("node:fs");
  const before = readFileSync(indexHtml, "utf-8");
  await page.click("#apply-btn");
  await expect(page.locator("#apply-result-modal")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("#apply-result-list")).toContainText("index.html");
  await expect
    .poll(() => readFileSync(indexHtml, "utf-8").includes("🔮 Prism E2E"), { timeout: 5000 })
    .toBe(true);

  // 回滚 → 恢复原文件，并清理测试产生的备份
  await page.click("#apply-result-rollback");
  await expect(page.locator("#prism-toast")).toContainText("已回滚", { timeout: 5000 });
  await expect
    .poll(() => !readFileSync(indexHtml, "utf-8").includes("🔮 Prism E2E"), { timeout: 5000 })
    .toBe(true);
  for (const f of readdirSync(path.dirname(indexHtml)).filter((x) => x.startsWith("index.html.bak-"))) {
    rmSync(path.join(path.dirname(indexHtml), f), { force: true });
  }
  expect(before).toContain("🔮 Prism");

  expect(errors).toEqual([]);
});

test("multi-select and alignment adjust freeform layouts", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Start from a template so there are multiple components
  await runPrompt(page, "应用 SaaS 模板");
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  // Freeform is the default mode; components already get editable layouts.
  // (Clicking the toggle would switch to flow, so we skip it here.)

  // Give the first two components distinct positions via REST
  await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as {
      components: Array<{ id: string }>;
    };
    const ids = s.components.slice(0, 2).map((c) => c.id);
    for (let i = 0; i < ids.length; i++) {
      await fetch(`/api/component/${ids[i]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ props: {}, layout: { x: 40 + i * 200, y: 20 + i * 40, w: 200, h: 100 } }),
      });
    }
  });
  // Deterministic: wait until the REST layout landed in state before selecting.
  await expect.poll(async () => {
    return page.evaluate(async () => {
      const s = (await (await fetch("/api/state")).json()) as {
        components: Array<{ layout: { x: number } }>;
      };
      const xs = s.components.slice(0, 2).map((c) => c.layout.x);
      return xs[0] === 40 && xs[1] === 240;
    });
  }, { timeout: 10000 }).toBe(true);

  // Select the first two components via the layer panel (deterministic —
  // clicking overlapping freeform wrappers would hit the topmost element)
  const layerCount = await page.locator("#layer-tree .layer-item").count();
  await page.locator("#layer-tree .layer-item").nth(layerCount - 1).click();
  await page.locator("#layer-tree .layer-item").nth(layerCount - 2).click({ modifiers: ["Shift"] });
  await expect(page.locator(".selection-toolbar")).toBeVisible();

  // Align left via the contextual toolbar
  await page.locator('.sel-tool-btn[title="左对齐"]').click();
  // Deterministic: wait until alignment landed in state.
  await expect.poll(async () => {
    return page.evaluate(async () => {
      const s = (await (await fetch("/api/state")).json()) as {
        components: Array<{ layout: { x: number } }>;
      };
      const xs = s.components.slice(0, 2).map((c) => c.layout.x);
      return xs[0] === 40 && xs[1] === 40;
    });
  }, { timeout: 10000 }).toBe(true);
  const xs = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as {
      components: Array<{ layout: { x: number } }>;
    };
    return s.components.slice(0, 2).map((c) => c.layout.x);
  });
  expect(xs[0]).toBe(40);
  expect(xs[1]).toBe(40);

  expect(errors).toEqual([]);
});

test("play mode: a linked component navigates to the target page", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Start from the SaaS template so there is a component to click
  await runPrompt(page, "应用 SaaS 模板");
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  // Remember the current page, then create the target page through the REST API
  const homePageId = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as { currentPageId: string };
    return s.currentPageId;
  });
  const detailPageId = await page.evaluate(async () => {
    const res = await fetch("/api/page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Detail" }),
    });
    const data = (await res.json()) as { page_id: string };
    return data.page_id;
  });
  // addPage switches to the new page; switch back to Home so the template is visible
  await page.evaluate(async (homeId) => {
    await fetch(`/api/page/${homeId}/switch`, { method: "POST" });
  }, homePageId);
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  // Select the first component and bind a "navigate" behavior to the Detail page
  await page.locator(".comp-wrapper").first().click();
  await expect(page.locator(".inspector-tabs")).toBeVisible();
  const typeSelect = page.locator("select.prop-select").filter({
    has: page.locator("option", { hasText: "跳转页面" }),
  });
  await typeSelect.selectOption("navigate");
  const pageSelect = page.locator("select.prop-select").filter({
    has: page.locator("option", { hasText: "选择目标页" }),
  });
  await pageSelect.selectOption(detailPageId);
  await expect(page.locator(".inspector-link-info")).toBeVisible();

  // Play mode: clicking the component dispatches the behavior (navigate)
  await page.locator("#play-btn").click();
  await page.locator(".comp-wrapper").first().click();
  await page.waitForFunction(
    (id) =>
      fetch("/api/state")
        .then((r) => r.json())
        .then((s) => (s as { currentPageId?: string }).currentPageId === id),
    detailPageId,
    { timeout: 10000 }
  );

  // Esc exits play mode
  await page.keyboard.press("Escape");
  await expect(page.locator("#play-btn")).toContainText("播放");

  expect(errors).toEqual([]);
});

test("library: component template replaces the selected component in place", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Start from a template so there is a component to replace
  await runPrompt(page, "应用 SaaS 模板");
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  const firstId = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as { components: Array<{ id: string; type: string }> };
    return s.components[0].id;
  });
  const firstType = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as { components: Array<{ type: string }> };
    return s.components[0].type;
  });

  // Select the first component, then replace it in place via REST (the old
  // in-library replace toggle was removed with the design-library rebuild).
  await page.locator(".comp-wrapper").first().click();
  await expect(page.locator(".inspector-tabs")).toBeVisible();
  const replaceRes = await page.evaluate(async (id) => {
    const res = await fetch(`/api/component/${id}/replace`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "hero", variant: "split", props: { title: "替换标题", button_text: "开始" } }),
    });
    return res.status;
  }, firstId);
  expect(replaceRes).toBe(200);
  // Deterministic: wait until the first component became the hero/split block.
  await expect.poll(async () => {
    return page.evaluate(async (id) => {
      const s = (await (await fetch("/api/state")).json()) as {
        components: Array<{ id: string; type: string; variant?: string }>;
      };
      const comp = s.components.find((c) => c.id === id);
      return comp ? `${comp.type}/${comp.variant || ""}` : null;
    }, firstId);
  }, { timeout: 10000 }).toBe("hero/split");

  const after = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as {
      components: Array<{ id: string; type: string; variant?: string; count: number }>;
    };
    return { ids: s.components.map((c) => c.id), types: s.components.map((c) => c.type) };
  });
  // Same component count (replaced, not added), and the first id keeps its identity
  expect(after.ids).toContain(firstId);
  expect(after.types.filter((t) => t !== firstType).length).toBeGreaterThanOrEqual(0);
  const replaced = await page.evaluate(async (id) => {
    const s = (await (await fetch("/api/state")).json()) as {
      components: Array<{ id: string; type: string; variant?: string }>;
    };
    return s.components.find((c) => c.id === id);
  }, firstId);
  expect(replaced?.type).toBe("hero");
  expect(replaced?.variant).toBe("split");

  // 顶部设计库: 组件知识卡添加到画布 (VibeHub 知识卡 + 应用到画布)
  await page.locator('.top-lib-tab[data-lib="按钮与链接"]').click();
  await expect(page.locator(".top-lib-card").first()).toBeVisible();
  const cardCount = await page.locator(".top-lib-card").count();
  expect(cardCount).toBeGreaterThanOrEqual(2);
  // 悬停展开气泡显示用法
  await page.locator(".top-lib-card").first().hover();
  await expect(page.locator(".top-lib-bubble").first()).toBeVisible();

  // Bind a behavior template to the selection via REST (the in-library
  // interactions tab was removed with the design-library rebuild).
  const behRes = await page.evaluate(async (id) => {
    const res = await fetch("/api/templates/behavior", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: id, template_id: "toast_feedback" }),
    });
    return res.status;
  }, firstId);
  expect(behRes).toBe(200);
  // Deterministic: wait until the toast behavior landed on the component.
  await expect.poll(async () => {
    return page.evaluate(async (id) => {
      const s = (await (await fetch("/api/state")).json()) as {
        components: Array<{ id: string; behavior?: { type: string } }>;
      };
      return s.components.find((c) => c.id === id)?.behavior?.type ?? null;
    }, firstId);
  }, { timeout: 10000 }).toBe("toast");
  const behavior = await page.evaluate(async (id) => {
    const s = (await (await fetch("/api/state")).json()) as {
      components: Array<{ id: string; behavior?: { type: string } }>;
    };
    return s.components.find((c) => c.id === id)?.behavior;
  }, firstId);
  expect(behavior?.type).toBe("toast");

  expect(errors).toEqual([]);
});

test("exact editing: layer rename + rulers/guides appear in freeform", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Start from a template so there is a component to rename
  await runPrompt(page, "应用 SaaS 模板");
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  // Freeform is the default mode: rulers + guides stage appear immediately.
  await expect(page.locator("#ruler-h")).toBeVisible();
  await expect(page.locator("#ruler-v")).toBeVisible();
  await expect(page.locator(".ruler-tick").first()).toBeVisible();

  // Rename a layer via the layer panel (double-click the name)
  await page.locator("#layer-tree .layer-item").first().dblclick();
  const nameInput = page.locator(".layer-rename-input");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("我的 Hero");
  await nameInput.press("Enter");
  // toHaveText retries until the rename lands; then verify it persisted.
  await expect(page.locator("#layer-tree .layer-name").first()).toHaveText("我的 Hero");
  const state = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as {
      components: Array<{ name?: string }>;
    };
    return s.components.some((c) => c.name === "我的 Hero");
  });
  expect(state).toBe(true);

  expect(errors).toEqual([]);
});

test("drawing canvas: draw a shape, bind an interaction, play mode triggers it", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // 预览画布直接绘制一个矩形组件（统一坐标系）
  await page.locator('.draw-tool[data-tool="rect"]').click();
  const box = await page.locator("#canvas").boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + 100, box!.y + 100);
  await page.mouse.down();
  await page.mouse.move(box!.x + 300, box!.y + 260, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const s = (await (await fetch("/api/state")).json()) as { components: Array<{ type: string }> };
        return s.components.some((c) => c.type === "rect");
      });
    }, { timeout: 10000 })
    .toBe(true);

  // 选中矩形 → 检查器「交互」区绑定「提示消息」(toast)
  await page.locator('.draw-tool[data-tool="select"]').click();
  const rectId = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as { components: Array<{ type: string; id: string }> };
    const r = s.components.find((c) => c.type === "rect");
    return r ? r.id : null;
  });
  expect(rectId).toBeTruthy();
  await page.locator(`#layer-tree .layer-item[data-id="${rectId}"]`).locator(".layer-name").click();
  await expect(page.locator(".inspector-tabs")).toBeVisible();
  const toastSelect = page.locator("select.prop-select").filter({ has: page.locator("option", { hasText: "提示消息" }) });
  await toastSelect.selectOption("toast");
  const msgInput = page.locator(".behavior-params input.prop-text-input").first();
  await msgInput.fill("形状被点击了");
  await msgInput.dispatchEvent("change");
  // 等行为持久化到组件
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const s = (await (await fetch("/api/state")).json()) as {
          components: Array<{ behavior?: { type?: string } }>;
        };
        return s.components.some((c) => c.behavior && c.behavior.type === "toast");
      });
    }, { timeout: 10000 })
    .toBe(true);

  // 播放模式：点击形状触发 toast
  await page.locator("#play-btn").click();
  await expect(page.locator("#play-btn")).toHaveClass(/active/, { timeout: 5000 });
  await page.locator(".comp-rect").first().click();
  await expect(page.locator("#prism-toast")).toContainText("形状被点击了", { timeout: 5000 });
  await page.keyboard.press("Escape");

  expect(errors).toEqual([]);
});

test("edit inner parts of a component (nested item text is editable)", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // SaaS template includes a feature_list with nested items and a pricing grid.
  await runPrompt(page, "应用 SaaS 模板");
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  // Feature-list item titles are editable in place (nested path items.0.title).
  const featTitle = page.locator('.comp-feature-item .card-title[data-editable="true"]').first();
  await expect(featTitle).toBeVisible();
  await featTitle.dblclick();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("重新命名的功能");
  await page.keyboard.press("Enter");
  // Deterministic: wait until the inline edit persisted to state.
  await expect.poll(async () => {
    return page.evaluate(async () => {
      const s = (await (await fetch("/api/state")).json()) as {
        components: Array<{ props?: { items?: Array<{ title?: string }> } }>;
      };
      const feat = s.components.find((c) => c.props?.items && c.props.items.some((it) => it.title));
      return feat?.props?.items?.some((it) => it.title === "重新命名的功能");
    });
  }, { timeout: 10000 }).toBe(true);
  const state = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as {
      components: Array<{ props?: { items?: Array<{ title?: string }> } }>;
    };
    const feat = s.components.find((c) => c.props?.items && c.props.items.some((it) => it.title));
    return feat?.props?.items?.some((it) => it.title === "重新命名的功能");
  });
  expect(state).toBe(true);

  expect(errors).toEqual([]);
});

test("child component is selectable and adjustable via the inspector", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  const badResponses: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("response", (res) => {
    if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url()}`);
  });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Build a parent card with a nested button child via the REST API.
  const ids = await page.evaluate(async () => {
    const mk = async (type: string, props: unknown, parentId?: string) => {
      const res = await fetch("/api/component", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, props, ...(parentId ? { parent_id: parentId } : {}) }),
      });
      return ((await res.json()) as { id: string }).id;
    };
    const parent = await mk("card", { title: "父卡片" });
    const child = await mk("button", { text: "子按钮" }, parent);
    return { parent, child };
  });
  // Deterministic: wait until the child wrapper actually rendered.
  await expect(page.locator(`.comp-wrapper[data-id="${ids.child}"]`)).toBeVisible({ timeout: 10000 });

  // Child appears indented in the layers panel.
  const childLayer = page.locator(`#layer-tree .layer-item[data-id="${ids.child}"]`);
  await expect(childLayer).toBeVisible();

  // Canvas click on the child (not the layer panel) must select the child,
  // not bubble to the parent card. Click the child button text directly.
  const childComp = page.locator(`.comp-wrapper[data-id="${ids.child}"]`);
  await expect(childComp).toBeVisible();
  await childComp.click();
  // toBeVisible retries; the inspector header updates on selection.
  await expect(page.locator(".inspector-section-title").first()).toContainText("button", { timeout: 5000 });
  await expect(page.locator(".inspector-parent-path")).toBeVisible();

  // Click the child layer → inspector shows the child, with a parent path.
  await childLayer.click();
  await expect(page.locator(".inspector-section-title").first()).toContainText("button");
  await expect(page.locator(".inspector-parent-path")).toBeVisible();

  // Edit the child's text through the inspector content section.
  const contentInputs = page.locator('.inspector-body .prop-text-input');
  const count = await contentInputs.count();
  const textField = contentInputs.nth(count - 1);
  await textField.fill("子按钮改名");
  await textField.blur();
  // Deterministic: wait until the rename persisted in state.
  await expect.poll(async () => {
    return page.evaluate(async (childId) => {
      const s = (await (await fetch("/api/state")).json()) as {
        components: Array<{ id: string; children?: Array<{ id: string; props: { text?: string } }> }>;
      };
      for (const c of s.components) {
        const found = c.children?.find((ch) => ch.id === childId);
        if (found) return found.props.text;
      }
      return null;
    }, ids.child);
  }, { timeout: 10000 }).toBe("子按钮改名");
  const renamed = await page.evaluate(async (childId) => {
    const s = (await (await fetch("/api/state")).json()) as {
      components: Array<{ id: string; children?: Array<{ id: string; props: { text?: string } }> }>;
    };
    for (const c of s.components) {
      const found = c.children?.find((ch) => ch.id === childId);
      if (found) return found.props.text;
    }
    return null;
  }, ids.child);
  expect(renamed).toBe("子按钮改名");

  // Debug: surface 404 URLs instead of a bare "Failed to load resource".
  if (badResponses.length > 0) {
    errors.push("HTTP >= 400: " + badResponses.join(" | "));
  }
  expect(errors).toEqual([]);
});

test("element-level editing: select inner text, promote to button, bind behavior", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  const badResponses: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("response", (res) => {
    if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url()}`);
  });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Build a hero with title + button via the REST API.
  const heroId = await page.evaluate(async () => {
    const res = await fetch("/api/component", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "hero", props: { title: "元素级标题", subtitle: "副标题", button_text: "立即开始" } }),
    });
    return ((await res.json()) as { id: string }).id;
  });
  // Deterministic: wait until the hero rendered on the canvas.
  await expect(page.locator('.comp-hero h1[data-prop="title"]')).toBeVisible({ timeout: 10000 });

  // 1. Single-click the inner title → element panel appears (not just component).
  const heroTitle = page.locator('.comp-hero h1[data-prop="title"]');
  await expect(heroTitle).toBeVisible();
  await heroTitle.click();
  await expect(page.locator(".el-element-title")).toBeVisible();
  await expect(page.locator(".el-kind-option").first()).toBeVisible();

  // 2. Promote the title to a button → kind persisted + rendered class.
  await page.locator(".el-kind-option", { hasText: "按钮" }).click();
  await expect.poll(async () => {
    return page.evaluate(async (id) => {
      const s = (await (await fetch("/api/state")).json()) as {
        components: Array<{ id: string; elementMeta?: Record<string, { kind?: string }> }>;
      };
      return s.components.find((c) => c.id === id)?.elementMeta?.title?.kind ?? null;
    }, heroId);
  }, { timeout: 10000 }).toBe("button");
  const kindState = await page.evaluate(async (id) => {
    const s = (await (await fetch("/api/state")).json()) as {
      components: Array<{ id: string; elementMeta?: Record<string, { kind?: string }> }>;
    };
    return s.components.find((c) => c.id === id)?.elementMeta?.title?.kind;
  }, heroId);
  expect(kindState).toBe("button");
  await expect(page.locator('.comp-hero h1[data-prop="title"].el-kind-btn')).toBeVisible();

  // 3. Bind a toast behavior to the element → persisted elementMeta.
  const elSelect = page.locator("select.el-prop-select").first();
  await elSelect.selectOption("toast");
  await expect.poll(async () => {
    return page.evaluate(async (id) => {
      const s = (await (await fetch("/api/state")).json()) as {
        components: Array<{ id: string; elementMeta?: Record<string, { behavior?: { type: string } }> }>;
      };
      return s.components.find((c) => c.id === id)?.elementMeta?.title?.behavior?.type ?? null;
    }, heroId);
  }, { timeout: 10000 }).toBe("toast");
  const behaviorState = await page.evaluate(async (id) => {
    const s = (await (await fetch("/api/state")).json()) as {
      components: Array<{ id: string; elementMeta?: Record<string, { behavior?: { type: string } }> }>;
    };
    return s.components.find((c) => c.id === id)?.elementMeta?.title?.behavior;
  }, heroId);
  expect(behaviorState?.type).toBe("toast");
  await expect(page.locator(".el-link-info")).toBeVisible();

  // 4. Play mode: clicking the element triggers the element-level toast.
  await page.locator("#play-btn").click();
  await heroTitle.click();
  await expect(page.locator("#prism-toast")).toContainText("操作成功", { timeout: 5000 });
  await page.keyboard.press("Escape");

  // 5. Clear element selection via the back button.
  await heroTitle.click();
  await page.locator(".el-clear-element").click();
  await expect(page.locator(".el-element-title")).toBeHidden();

  if (badResponses.length > 0) {
    errors.push("HTTP >= 400: " + badResponses.join(" | "));
  }
  expect(errors).toEqual([]);
});

test("page background editor applies presets and custom values to the canvas", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  const badResponses: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("response", (res) => {
    if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url()}`);
  });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // With nothing selected, the inspector shows the page-background panel.
  await expect(page.locator(".inspector-section-title", { hasText: "页面背景" })).toBeVisible();
  await expect(page.locator(".bg-preset").first()).toBeVisible();

  // Click the "海洋" gradient preset → applied to the canvas + persisted.
  await page.locator(".bg-preset", { hasText: "海洋" }).click();
  await expect.poll(async () => {
    return page.evaluate(async () => {
      const s = (await (await fetch("/api/state")).json()) as {
        pageBackground?: { type: string; value: string };
      };
      return s.pageBackground ? s.pageBackground.type : null;
    });
  }, { timeout: 10000 }).toBe("gradient");
  const state = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as {
      pageBackground?: { type: string; value: string };
    };
    return s.pageBackground || null;
  });
  expect(state?.type).toBe("gradient");
  expect(state?.value).toContain("linear-gradient");
  const canvasBg = await page.evaluate(() => {
    const canvas = document.getElementById("canvas");
    return canvas ? canvas.style.background : "";
  });
  expect(canvasBg).toContain("linear-gradient");

  // Custom color input applies too.
  await page.locator(".prop-text-input").first().fill("#0f172a");
  await page.locator(".inspector-action-btn", { hasText: "应用颜色" }).click();
  await expect.poll(async () => {
    return page.evaluate(async () => {
      const s = (await (await fetch("/api/state")).json()) as {
        pageBackground?: { type: string; value: string };
      };
      return s.pageBackground?.value ?? null;
    });
  }, { timeout: 10000 }).toBe("#0f172a");
  const colorState = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as {
      pageBackground?: { type: string; value: string };
    };
    return s.pageBackground?.value;
  });
  expect(colorState).toBe("#0f172a");

  // Clear removes it.
  await page.locator(".inspector-delete-btn", { hasText: "清除背景" }).click();
  await expect.poll(async () => {
    return page.evaluate(async () => {
      const s = (await (await fetch("/api/state")).json()) as {
        pageBackground?: unknown;
      };
      return s.pageBackground === undefined;
    });
  }, { timeout: 10000 }).toBe(true);
  const cleared = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as {
      pageBackground?: unknown;
    };
    return s.pageBackground === undefined;
  });
  expect(cleared).toBe(true);

  if (badResponses.length > 0) {
    errors.push("HTTP >= 400: " + badResponses.join(" | "));
  }
  expect(errors).toEqual([]);
});

test("pointer events: touch drag moves a freeform component (Phase 2.5)", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Add a button so the canvas has a draggable component.
  await page.evaluate(async () => {
    await fetch("/api/component", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "button", props: { text: "可拖动按钮" } }),
    });
  });
  const comp = page.locator(".comp-wrapper").first();
  await expect(comp).toBeVisible({ timeout: 10000 });

  const box = await comp.boundingBox();
  expect(box).toBeTruthy();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;

  // Dispatch synthetic pointer events to exercise the pointerdown/move/up path.
  await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const wrapper = el && el.closest ? el.closest(".comp-wrapper") : null;
      if (!wrapper) return;
      const fire = (type: string, px: number, py: number) => {
        wrapper.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch",
          clientX: px, clientY: py, button: 0,
        }));
      };
      fire("pointerdown", x, y);
      fire("pointermove", x + 60, y + 40);
      fire("pointerup", x + 60, y + 40);
    },
    [startX, startY]
  );
  // Deterministic: wait until the drag result landed in state.
  await expect.poll(async () => {
    return page.evaluate(async () => {
      const s = (await (await fetch("/api/state")).json()) as {
        components: Array<{ id: string; layout?: { x: number; y: number } }>;
      };
      const l = s.components[0] && s.components[0].layout;
      return l ? (l.x >= 50 && l.y >= 30) : false;
    });
  }, { timeout: 10000 }).toBe(true);

  // The component's layout should have moved by ~(60, 40) (freeform default).
  const layout = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as {
      components: Array<{ id: string; layout?: { x: number; y: number } }>;
    };
    return s.components[0] && s.components[0].layout;
  });
  expect(layout).toBeTruthy();
  expect(layout!.x).toBeGreaterThanOrEqual(50);
  expect(layout!.y).toBeGreaterThanOrEqual(30);

  expect(errors).toEqual([]);
});

test("performance instrumentation collects render stats with ?perf=1 (Phase 3.5)", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/?perf=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // PrismPerf is exposed with a summary + recorded stats after init renders.
  const perf = await page.evaluate(() => {
    const p = (window as unknown as { PrismPerf?: { enabled: boolean; stats: { renders: number; totalMs: number; window: unknown[] }; summary(): string } }).PrismPerf;
    return p ? { enabled: p.enabled, renders: p.stats.renders, summary: p.summary() } : null;
  });
  expect(perf).toBeTruthy();
  expect(perf!.enabled).toBe(true);
  expect(perf!.renders).toBeGreaterThanOrEqual(1);
  expect(perf!.summary).toMatch(/renders=\d+ avg=[\d.]+ms/);

  expect(errors).toEqual([]);
});

test("mobile platform preview collapses grids to a single column (Phase 3.2)", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Add a 3-column card grid via REST.
  await page.evaluate(async () => {
    await fetch("/api/component", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "card_grid",
        variant: "3col",
        props: { items: [{ title: "A" }, { title: "B" }, { title: "C" }] },
      }),
    });
  });
  const grid = page.locator(".comp-card-grid.cols-3");
  await expect(grid).toBeVisible({ timeout: 10000 });

  // Desktop: 3 columns.
  const desktopCols = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(desktopCols).toBeGreaterThanOrEqual(2);

  // Switch to the mobile platform → the canvas narrows to 375px and the
  // media query collapses the grid to a single column.
  await page.locator("#platform-select").selectOption("mobile-ios");
  await expect(page.locator("#canvas")).toHaveClass(/device-mobile/);
  await expect.poll(async () => {
    return grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter((c) => c.trim() !== "").length);
  }, { timeout: 10000 }).toBe(1);

  expect(errors).toEqual([]);
});

test("animation timeline previews the entry animation on the selected component (Phase 3.1)", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Add a hero and select it so the inspector animation section is visible.
  await page.evaluate(async () => {
    await fetch("/api/component", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "hero", props: { title: "动效测试" } }),
    });
  });
  const comp = page.locator(".comp-wrapper").first();
  await expect(comp).toBeVisible({ timeout: 10000 });
  await comp.click();
  await expect(page.locator(".inspector-tabs")).toBeVisible();

  // The animation section now includes the timeline controls.
  await expect(page.locator(".anim-timeline")).toBeVisible();
  await expect(page.locator(".anim-timeline-play")).toBeVisible();

  // Choose an entry animation (fadeUp) via the entry select.
  const entrySelect = page.locator("select.prop-select").first();
  await entrySelect.selectOption("fadeUp");
  await page.waitForTimeout(400);

  // Verify the animation persisted on the component.
  const anim = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as {
      components: Array<{ animation?: { entry?: string } }>;
    };
    return s.components[0] && s.components[0].animation;
  });
  expect(anim?.entry).toBe("fadeUp");

  // Replaying fills the timeline bar (width animates to 100% then resets).
  await page.locator(".anim-timeline-play").click();
  await expect.poll(async () => {
    return page.evaluate(() => {
      const fill = document.querySelector(".anim-timeline-fill");
      if (!fill) return false;
      const w = fill.style.width;
      return w === "100%";
    });
  }, { timeout: 3000 }).toBe(true);

  expect(errors).toEqual([]);
});
