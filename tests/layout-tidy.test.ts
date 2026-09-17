// tests/layout-tidy.test.ts — 一键整理: overlap-cluster cohesion + anchored bars + semantic gaps
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import type { Server } from "node:http";
import { stateStore, type ComponentNode, type PageDef } from "../src/state.js";
import { tidyPageLayout } from "../src/layout/tidy.js";
import { registerLayoutRoutes } from "../src/routes/layout.js";
import { errorHandler } from "../src/routes/shared.js";

// ---------- helpers ----------

function comp(
  id: string,
  type: string,
  layout?: { x: number; y: number; w: number; h: number }
): ComponentNode {
  return { id, type, props: {}, children: [], ...(layout ? { layout } : {}) };
}

function pageOf(...components: ComponentNode[]): PageDef {
  return { id: "page_1", name: "Home", components };
}

type Update = { id: string; layout: { x: number; y: number; w: number; h: number } };

const layoutOf = (updates: Update[], id: string) => updates.find((u) => u.id === id)?.layout;

// ---------- pure function ----------

describe("tidyPageLayout (pure)", () => {
  test("navbar anchors to the top edge full width", () => {
    const updates = tidyPageLayout(pageOf(comp("nav", "navbar", { x: 40, y: 200, w: 900, h: 64 })));
    assert.deepEqual(updates, [{ id: "nav", layout: { x: 0, y: 0, w: 1200, h: 64 } }]);
  });

  test("footer lands at the bottom of the content stack full width", () => {
    const updates = tidyPageLayout(
      pageOf(
        comp("nav", "navbar", { x: 40, y: 200, w: 900, h: 64 }),
        comp("card", "card", { x: 100, y: 500, w: 600, h: 160 }),
        comp("footer", "footer", { x: 0, y: 900, w: 1100, h: 120 })
      )
    );
    assert.deepEqual(layoutOf(updates, "nav"), { x: 0, y: 0, w: 1200, h: 64 });
    assert.deepEqual(layoutOf(updates, "card"), { x: 100, y: 80, w: 600, h: 160 });
    assert.deepEqual(layoutOf(updates, "footer"), { x: 0, y: 256, w: 1200, h: 120 });
  });

  test("overlapping pair moves as one unit (same delta)", () => {
    const updates = tidyPageLayout(
      pageOf(
        comp("a", "card", { x: 100, y: 300, w: 200, h: 100 }),
        comp("b", "card", { x: 150, y: 350, w: 200, h: 100 }),
        comp("c", "card", { x: 100, y: 700, w: 200, h: 100 })
      )
    );
    const a = layoutOf(updates, "a");
    const b = layoutOf(updates, "b");
    const c = layoutOf(updates, "c");
    assert.ok(a && b && c, "all three repositioned");
    // 整簇整体平移: 成员相对位置不变（同一 delta）
    assert.equal(a.x, 100);
    assert.equal(a.y, 0);
    assert.equal(b.x - 150, a.x - 100);
    assert.equal(b.y - 350, a.y - 300);
    // 簇后第一个单元: card→card 语义间距 8
    assert.equal(c.y, a.y + 150 + 8);
  });

  test("semantic gaps: 8 after text / between list-like, 16 otherwise", () => {
    const updates = tidyPageLayout(
      pageOf(
        comp("card1", "card", { x: 16, y: 40, w: 400, h: 100 }),
        comp("text", "text", { x: 16, y: 300, w: 400, h: 40 }),
        comp("card2", "card", { x: 16, y: 600, w: 400, h: 100 }),
        comp("btn", "button", { x: 16, y: 900, w: 200, h: 48 })
      )
    );
    const card1 = layoutOf(updates, "card1");
    const text = layoutOf(updates, "text");
    const card2 = layoutOf(updates, "card2");
    const btn = layoutOf(updates, "btn");
    assert.ok(card1 && text && card2 && btn);
    // card → text: 16
    assert.equal(text.y - (card1.y + 100), 16);
    // text → card: 8 (text 后紧跟)
    assert.equal(card2.y - (text.y + 40), 8);
    // card → button: 16
    assert.equal(btn.y - (card2.y + 100), 16);
  });

  test("two list-like units get the tight 8px gap", () => {
    const updates = tidyPageLayout(
      pageOf(
        comp("c1", "card", { x: 16, y: 0, w: 400, h: 100 }),
        comp("t", "table", { x: 16, y: 500, w: 400, h: 80 })
      )
    );
    assert.equal(layoutOf(updates, "t")?.y, 108);
  });

  test("components already tidy or without layout are omitted", () => {
    const updates = tidyPageLayout(
      pageOf(
        comp("nav", "navbar", { x: 0, y: 0, w: 1200, h: 64 }),
        comp("flow", "text"),
        comp("card", "card", { x: 100, y: 80, w: 600, h: 160 })
      )
    );
    assert.deepEqual(updates, []);
  });

  test("hero/cta/banner sit directly below the top bars full width", () => {
    const updates = tidyPageLayout(
      pageOf(
        comp("nav", "navbar", { x: 0, y: 0, w: 1200, h: 64 }),
        comp("tabs", "tabs", { x: 20, y: 200, w: 800, h: 80 }),
        comp("hero", "hero", { x: 100, y: 300, w: 900, h: 360 }),
        comp("card", "card", { x: 50, y: 800, w: 600, h: 160 })
      )
    );
    assert.equal(updates.length, 3, "already-tidy navbar omitted");
    assert.deepEqual(layoutOf(updates, "tabs"), { x: 0, y: 64, w: 1200, h: 80 });
    assert.deepEqual(layoutOf(updates, "hero"), { x: 0, y: 144, w: 1200, h: 360 });
    assert.deepEqual(layoutOf(updates, "card"), { x: 50, y: 520, w: 600, h: 160 });
  });

  test("a unit wider than 70% of the page snaps to the margin", () => {
    const updates = tidyPageLayout(pageOf(comp("wide", "card", { x: 200, y: 0, w: 900, h: 100 })));
    assert.deepEqual(layoutOf(updates, "wide"), { x: 16, y: 0, w: 900, h: 100 });
  });

  test("deterministic ordering: bars, flow by y, footers", () => {
    const components = [
      comp("footer", "footer", { x: 0, y: 900, w: 1100, h: 120 }),
      comp("text", "text", { x: 16, y: 400, w: 400, h: 40 }),
      comp("nav", "navbar", { x: 0, y: 10, w: 1200, h: 64 }),
      comp("card", "card", { x: 16, y: 200, w: 400, h: 100 }),
    ];
    const updates = tidyPageLayout(pageOf(...components));
    assert.deepEqual(
      updates.map((u) => u.id),
      ["nav", "card", "text", "footer"]
    );
    // 相同输入两次调用结果一致
    assert.deepEqual(tidyPageLayout(pageOf(...components)), updates);
  });
});

// ---------- route ----------

let app: Express;
let server: Server;
let base = "";

before(async () => {
  app = express();
  app.use(express.json());
  app.use(registerLayoutRoutes());
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") base = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  stateStore.resetForTests();
});

function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> }));
}

function rootLayouts(): Record<string, { x: number; y: number; w: number; h: number }> {
  const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const c of stateStore.getState().components as ComponentNode[]) {
    if (c.layout) out[c.id] = c.layout;
  }
  return out;
}

describe("POST /api/layout/tidy (route)", () => {
  test("applies tidy layouts as one undo step on the current page", async () => {
    const nav = stateStore.addComponent("navbar", undefined, {}, null, "user");
    const card = stateStore.addComponent("card", undefined, {}, null, "user");
    const footer = stateStore.addComponent("footer", undefined, {}, null, "user");
    stateStore.updateComponent(nav.id, {}, "user", { x: 40, y: 200, w: 900, h: 64 });
    stateStore.updateComponent(card.id, {}, "user", { x: 100, y: 500, w: 600, h: 160 });
    stateStore.updateComponent(footer.id, {}, "user", { x: 0, y: 900, w: 1100, h: 120 });

    const res = await post("/api/layout/tidy", {});
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.applied, 3);

    const after = rootLayouts();
    assert.deepEqual(after[nav.id], { x: 0, y: 0, w: 1200, h: 64 });
    assert.deepEqual(after[card.id], { x: 100, y: 80, w: 600, h: 160 });
    assert.deepEqual(after[footer.id], { x: 0, y: 256, w: 1200, h: 120 });

    // 单个 undo 步: 一次 undo 全部回滚
    assert.equal(stateStore.undo(), true);
    const restored = rootLayouts();
    assert.deepEqual(restored[nav.id], { x: 40, y: 200, w: 900, h: 64 });
    assert.deepEqual(restored[card.id], { x: 100, y: 500, w: 600, h: 160 });
    assert.deepEqual(restored[footer.id], { x: 0, y: 900, w: 1100, h: 120 });
  });

  test("unknown page_id returns 404", async () => {
    const res = await post("/api/layout/tidy", { page_id: "nope" });
    assert.equal(res.status, 404);
  });

  test("explicit page_id tidies a non-current page (single undo step)", async () => {
    const homeId = stateStore.getState().currentPageId as string;
    const pageB = stateStore.addPage("B", "user").id;
    const card = stateStore.addComponent("card", undefined, {}, null, "user");
    stateStore.updateComponent(card.id, {}, "user", { x: 40, y: 300, w: 600, h: 160 });
    stateStore.switchPage(homeId, "user");

    const res = await post("/api/layout/tidy", { page_id: pageB });
    assert.equal(res.status, 200);
    assert.equal(res.body.applied, 1);

    const pageBafter = stateStore
      .getState()
      .pages.find((p) => p.id === pageB)?.components[0]?.layout;
    assert.deepEqual(pageBafter, { x: 40, y: 0, w: 600, h: 160 });

    stateStore.undo();
    const pageBrestored = stateStore
      .getState()
      .pages.find((p) => p.id === pageB)?.components[0]?.layout;
    assert.deepEqual(pageBrestored, { x: 40, y: 300, w: 600, h: 160 });
  });

  test("empty page reports applied 0", async () => {
    const res = await post("/api/layout/tidy", {});
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.applied, 0);
  });
});
