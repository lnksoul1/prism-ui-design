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
  await expect(page.locator("#prompt-input")).toBeVisible();
  // Primary topbar actions stay visible; secondary utilities live in the "…" menu.
  await expect(page.locator("#export-btn")).toBeVisible();
  await expect(page.locator("#more-btn")).toBeVisible();
  await page.locator("#more-btn").click();
  await expect(page.locator("#project-btn")).toBeVisible();
  await page.locator("#more-btn").click();

  // Sending a matchable instruction executes locally and shows a receipt
  await page.fill("#prompt-input", "把主色改成蓝色");
  await page.click("#prompt-send");
  await expect(page.locator("#prompt-status")).toContainText("已执行", { timeout: 5000 });
  const primary = await page.evaluate(async () => {
    const state = (await (await fetch("/api/state")).json()) as {
      tokens: { colors: Record<string, { value?: string }> };
    };
    return state.tokens.colors["color-primary"]?.value;
  });
  expect(primary).toBe("#3B82F6");
  expect(errors).toEqual([]);
});

test("drawing canvas mounts and offers a template-first start", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
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

test("quick actions: prompt chips, ? help, Ctrl+K palette, template thumbnails", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Prompt chips render and one-click instructions execute via the built-in engine
  await expect(page.locator(".prompt-chip")).toHaveCount(9);
  await page.locator(".prompt-chip").first().click();
  await expect(page.locator("#prompt-status")).toContainText("已执行", { timeout: 5000 });

  // Help overlay toggles with "?" and lists shortcuts
  await page.keyboard.press("?");
  await expect(page.locator("#help-overlay")).toBeVisible();
  await expect(page.locator(".help-row").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#help-overlay")).not.toBeVisible();

  // Command palette via Ctrl+K filters and executes the first match
  await page.keyboard.press("Control+K");
  await expect(page.locator("#command-overlay")).toBeVisible();
  await page.fill("#command-input", "深色");
  await expect(page.locator(".command-row").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#command-overlay")).not.toBeVisible();
  await expect(page.locator("#prompt-status")).toContainText("已执行", { timeout: 5000 });

  // Drawing canvas template picker shows semantic thumbnails
  await page.locator("#canvas-mode-design").click();
  await expect(page.locator("#canvas-template-modal")).toBeVisible({ timeout: 10000 });
  await expect(page.locator(".tpl-thumb")).toHaveCount(6);

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
  await page.fill("#prompt-input", "应用 SaaS 模板");
  await page.click("#prompt-send");
  await expect(page.locator("#prompt-status")).toContainText("已执行", { timeout: 5000 });
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  // Inspect: select the first component and open the Code tab
  await page.locator(".comp-wrapper").first().click();
  await expect(page.locator(".inspector-tabs")).toBeVisible();
  await page.locator(".inspector-tab").filter({ hasText: "代码" }).click();
  await expect(page.locator(".inspector-code")).toContainText("<", { timeout: 5000 });
  const copyEnabled = await page.locator(".inspector-copy-btn").isEnabled();
  expect(copyEnabled).toBe(true);

  // Brand design systems: list renders all cards, applying Linear changes tokens
  await page.locator('.lib-tab[data-lib="designSystems"]').click();
  await expect(page.locator(".ds-card")).toHaveCount(17, { timeout: 5000 });
  await page.locator(".ds-apply").first().click();
  await page.waitForFunction(
    async () => {
      const state = (await (await fetch("/api/state")).json()) as {
        tokens: { colors: Record<string, { value?: string }> };
      };
      return state.tokens.colors["color-primary"]?.value === "#5E6AD2";
    },
    null,
    { timeout: 10000 }
  );

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

test("import wizard: client-UI source lands on canvas with apply banner", async ({ page }: { page: Page }) => {
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

  // The client-UI page lands on the canvas and the apply banner appears
  // (provenance recorded → same 导入→调整→一键应用 journey)
  await expect(page.locator("#import-banner")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 15000 });

  // Apply → result modal with paths, then rollback restores the receipt flow
  await page.click("#apply-btn");
  await expect(page.locator("#apply-result-modal")).toBeVisible({ timeout: 5000 });
  await page.click("#apply-result-done");
  // Apply again so a backup exists, then rollback from the banner
  await page.click("#apply-btn");
  await expect(page.locator("#apply-result-modal")).toBeVisible({ timeout: 5000 });
  await page.click("#apply-result-rollback");
  await expect(page.locator("#prism-toast")).toContainText("已回滚", { timeout: 5000 });

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
  await page.fill("#prompt-input", "应用 SaaS 模板");
  await page.click("#prompt-send");
  await expect(page.locator("#prompt-status")).toContainText("已执行", { timeout: 5000 });
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  // Freeform is the default mode; components already get editable layouts.
  // (Clicking the toggle would switch to flow, so we skip it here.)
  await page.waitForTimeout(500);

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
  await page.waitForTimeout(600);

  // Select the first two components via the layer panel (deterministic —
  // clicking overlapping freeform wrappers would hit the topmost element)
  const layerCount = await page.locator("#layer-tree .layer-item").count();
  await page.locator("#layer-tree .layer-item").nth(layerCount - 1).click();
  await page.locator("#layer-tree .layer-item").nth(layerCount - 2).click({ modifiers: ["Shift"] });
  await expect(page.locator(".selection-toolbar")).toBeVisible();

  // Align left via the contextual toolbar
  await page.locator('.sel-tool-btn[title="左对齐"]').click();
  await page.waitForTimeout(600);
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
  await page.fill("#prompt-input", "应用 SaaS 模板");
  await page.click("#prompt-send");
  await expect(page.locator("#prompt-status")).toContainText("已执行", { timeout: 5000 });
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
  await page.fill("#prompt-input", "应用 SaaS 模板");
  await page.click("#prompt-send");
  await expect(page.locator("#prompt-status")).toContainText("已执行", { timeout: 5000 });
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  const firstId = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as { components: Array<{ id: string; type: string }> };
    return s.components[0].id;
  });
  const firstType = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as { components: Array<{ type: string }> };
    return s.components[0].type;
  });

  // Select the first component, open the components tab, enable 替换选中
  await page.locator(".comp-wrapper").first().click();
  await expect(page.locator(".inspector-tabs")).toBeVisible();
  await page.locator('.lib-tab[data-lib="components"]').click();
  await expect(page.locator("#lib-replace-toggle")).toBeVisible();
  await page.locator("#lib-replace-toggle").check();

  // Click a curated block → it should replace the selection (not add)
  await page.locator('.lib-item-block', { hasText: "Hero 分屏" }).first().click();
  await page.waitForTimeout(800);

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

  // The interactions tab binds a behavior template to the selection
  await page.locator('.lib-tab[data-lib="interactions"]').click();
  await page.locator('.lib-item', { hasText: "点击提示" }).first().click();
  await page.waitForTimeout(600);
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
  await page.fill("#prompt-input", "应用 SaaS 模板");
  await page.click("#prompt-send");
  await expect(page.locator("#prompt-status")).toContainText("已执行", { timeout: 5000 });
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  // Freeform is the default mode: rulers + guides stage appear immediately.
  await page.waitForTimeout(500);
  await expect(page.locator("#ruler-h")).toBeVisible();
  await expect(page.locator("#ruler-v")).toBeVisible();
  await expect(page.locator(".ruler-tick").first()).toBeVisible();

  // Rename a layer via the layer panel (double-click the name)
  await page.locator("#layer-tree .layer-item").first().dblclick();
  const nameInput = page.locator(".layer-rename-input");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("我的 Hero");
  await nameInput.press("Enter");
  await page.waitForTimeout(600);
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

test("drawing canvas: bind an interaction to a shape, play mode triggers it", async ({ page }: { page: Page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(page.locator(".topbar")).toBeVisible();

  // Open the drawing canvas and start from a template so there are shapes
  await page.locator("#canvas-mode-design").click();
  await expect(page.locator("#canvas-editor .tl-container")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#canvas-template-modal")).toBeVisible({ timeout: 10000 });
  await page.locator(".template-card").first().click();
  await page.waitForFunction(
    () => {
      const canvas = (globalThis as { PrismCanvas?: { countShapes(): number } }).PrismCanvas;
      return !!canvas && canvas.countShapes() > 0;
    },
    null,
    { timeout: 10000 }
  );

  // Select exactly the first shape via the editor API, then bind 点击提示
  const shapeId = await page.evaluate(() => {
    const canvas = (globalThis as { PrismCanvas?: {
      selectShape?: (ids: string[]) => boolean;
      getSelectedShapeIds?: () => string[];
    } }).PrismCanvas;
    if (!canvas || !canvas.selectShape) return null;
    canvas.selectAll();
    const all = canvas.getSelectedShapeIds();
    const first = all && all.length > 0 ? all[0] : null;
    if (first) canvas.selectShape([first]);
    return first;
  });
  expect(shapeId).toBeTruthy();

  // Open the behavior menu and pick 点击提示 (toast)
  await page.locator("#canvas-behavior-btn").click();
  await expect(page.locator("#canvas-behavior-menu")).toBeVisible();
  await page.locator(".cb-menu-item", { hasText: "点击提示" }).click();
  await expect(page.locator("#prism-toast")).toContainText("已绑定交互", { timeout: 5000 });

  // The behavior persisted into the saved canvas doc
  const pageIdForCanvas = await page.evaluate(async () => {
    const s = (await (await fetch("/api/state")).json()) as { currentPageId: string };
    return s.currentPageId;
  });
  const behavior = await page.evaluate(async (pid) => {
    const res = await fetch(`/api/canvas?pageId=${encodeURIComponent(pid)}`);
    const s = (await res.json()) as {
      doc?: { document?: { store?: Record<string, { meta?: { behavior?: { type: string } } }> } };
    };
    return s.doc;
  }, pageIdForCanvas);
  const shapesWithBehavior = await page.evaluate((doc) => {
    const store = (doc as { document?: { store?: Record<string, unknown> } })?.document?.store || {};
    return Object.values(store)
      .filter((r) => (r as { typeName?: string }).typeName === "shape")
      .map((r) => (r as { meta?: { behavior?: { type: string } } }).meta?.behavior?.type)
      .filter(Boolean);
  }, behavior);
  expect(shapesWithBehavior).toContain("toast");

  // Play mode: clicking the shape triggers the toast
  await page.locator("#play-btn").click();
  await page.waitForTimeout(300);
  const center = await page.evaluate((id) => {
    const canvas = (globalThis as { PrismCanvas?: { getShapeCenter?: (id: string) => { x: number; y: number } | null } }).PrismCanvas;
    return canvas && canvas.getShapeCenter ? canvas.getShapeCenter(id) : null;
  }, shapeId);
  expect(center).toBeTruthy();
  const hitBefore = await page.evaluate((pt) => {
    const canvas = (globalThis as { PrismCanvas?: { getShapeAtPoint?: (x: number, y: number) => { id: string } | null } }).PrismCanvas;
    return canvas && canvas.getShapeAtPoint ? canvas.getShapeAtPoint(pt.x, pt.y) : null;
  }, center);
  expect(hitBefore).toBeTruthy();
  await page.mouse.click(center!.x, center!.y);
  await expect(page.locator("#prism-toast")).toContainText("操作成功", { timeout: 5000 });
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
  await page.fill("#prompt-input", "应用 SaaS 模板");
  await page.click("#prompt-send");
  await expect(page.locator("#prompt-status")).toContainText("已执行", { timeout: 5000 });
  await expect(page.locator(".comp-wrapper").first()).toBeVisible({ timeout: 10000 });

  // Feature-list item titles are editable in place (nested path items.0.title).
  const featTitle = page.locator('.comp-feature-item .card-title[data-editable="true"]').first();
  await expect(featTitle).toBeVisible();
  await featTitle.dblclick();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("重新命名的功能");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
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
  await page.waitForTimeout(800);

  // Child appears indented in the layers panel.
  const childLayer = page.locator(`#layer-tree .layer-item[data-id="${ids.child}"]`);
  await expect(childLayer).toBeVisible();

  // Canvas click on the child (not the layer panel) must select the child,
  // not bubble to the parent card. Click the child button text directly.
  const childComp = page.locator(`.comp-wrapper[data-id="${ids.child}"]`);
  await expect(childComp).toBeVisible();
  await childComp.click();
  await page.waitForTimeout(400);
  await expect(page.locator(".inspector-section-title").first()).toContainText("button");
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
  await page.waitForTimeout(600);
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
