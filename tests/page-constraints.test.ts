// tests/page-constraints.test.ts — R1 M2 修正记忆: 页面级布局约束
// （stateStore 存储 / REST / AI 生成锁定 / 简报输出）
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import type { Server } from "node:http";
import { stateStore, type ComponentNode } from "../src/state.js";
import { registerComponentsRoutes } from "../src/routes/components.js";
import { errorHandler } from "../src/routes/shared.js";
import { applySpec, buildConstraintsExtra } from "../src/llm/agent.js";
import { compilePageBrief } from "../src/prompt-brief.js";

function addWithLayout(type: string, layout: { x: number; y: number; w: number; h: number }): ComponentNode {
  const node = stateStore.addComponent(type, undefined, {}, null, "user");
  stateStore.updateComponent(node.id, {}, "user", layout);
  return node;
}

describe("stateStore page constraints (R1 M2)", () => {
  beforeEach(() => {
    stateStore.resetForTests();
  });

  test("records a component layout as a page constraint by type", () => {
    const nav = addWithLayout("navbar", { x: 0, y: 0, w: 1200, h: 64 });
    const constraint = stateStore.addPageConstraint(nav.id);
    assert.ok(constraint);
    const page = stateStore.getState().pages.find((p) => p.id === stateStore.getState().currentPageId);
    assert.equal(page?.constraints?.length, 1);
    assert.equal(page?.constraints?.[0].component_type, "navbar");
    assert.deepEqual(page?.constraints?.[0].layout, { x: 0, y: 0, w: 1200, h: 64 });
    assert.equal(page?.constraints?.[0].source_component_id, nav.id);
  });

  test("component without layout cannot be constrained", () => {
    const node = stateStore.addComponent("card", undefined, {}, null, "user");
    assert.equal(stateStore.addPageConstraint(node.id), null);
  });

  test("re-constraining the same component replaces the old constraint", () => {
    const nav = addWithLayout("navbar", { x: 0, y: 0, w: 1200, h: 64 });
    stateStore.addPageConstraint(nav.id);
    stateStore.updateComponent(nav.id, {}, "user", { x: 0, y: 0, w: 1200, h: 80 });
    stateStore.addPageConstraint(nav.id);
    const page = stateStore.getState().pages.find((p) => p.id === stateStore.getState().currentPageId);
    assert.equal(page?.constraints?.length, 1);
    assert.equal(page?.constraints?.[0].layout.h, 80);
  });

  test("caps at 20 constraints per page (oldest evicted)", () => {
    for (let i = 0; i < 22; i++) {
      const c = addWithLayout("card", { x: 0, y: i * 100, w: 400, h: 80 });
      stateStore.addPageConstraint(c.id);
    }
    const page = stateStore.getState().pages.find((p) => p.id === stateStore.getState().currentPageId);
    assert.equal(page?.constraints?.length, 20);
    // 最早两条被淘汰，y=1600（第 17 条）与 y=2100（最后一条）仍在
    assert.ok(page?.constraints?.some((c) => c.layout.y === 1600));
    assert.ok(page?.constraints?.some((c) => c.layout.y === 2100));
    assert.ok(!page?.constraints?.some((c) => c.layout.y === 0));
  });

  test("removePageConstraint deletes by id", () => {
    const nav = addWithLayout("navbar", { x: 0, y: 0, w: 1200, h: 64 });
    const constraint = stateStore.addPageConstraint(nav.id);
    assert.ok(constraint);
    assert.equal(stateStore.removePageConstraint(constraint.id), true);
    assert.equal(stateStore.removePageConstraint(constraint.id), false);
    const page = stateStore.getState().pages.find((p) => p.id === stateStore.getState().currentPageId);
    assert.equal(page?.constraints?.length, 0);
  });
});

// ---------- REST ----------

let app: Express;
let server: Server;
let base = "";

before(async () => {
  app = express();
  app.use(express.json());
  app.use(registerComponentsRoutes());
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

function send(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  return fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> }));
}

describe("page-constraints REST (R1 M2)", () => {
  test("POST / GET / DELETE lifecycle", async () => {
    const nav = addWithLayout("navbar", { x: 0, y: 0, w: 1200, h: 64 });

    const created = await send("POST", "/api/page-constraints", { component_id: nav.id });
    assert.equal(created.status, 200);
    const id = (created.body.constraint as { id: string }).id;
    assert.ok(id);

    const list = await send("GET", "/api/page-constraints");
    assert.equal(list.status, 200);
    assert.equal((list.body.constraints as unknown[]).length, 1);

    const removed = await send("DELETE", `/api/page-constraints/${id}`);
    assert.equal(removed.status, 200);
    const afterList = await send("GET", "/api/page-constraints");
    assert.equal((afterList.body.constraints as unknown[]).length, 0);
  });

  test("missing component_id → 400; unknown component → 400; unknown id → 404", async () => {
    assert.equal((await send("POST", "/api/page-constraints", {})).status, 400);
    assert.equal((await send("POST", "/api/page-constraints", { component_id: "nope" })).status, 400);
    assert.equal((await send("DELETE", "/api/page-constraints/pc_none")).status, 404);
  });
});

// ---------- AI 生成锁定 + 提示词注入 + 简报 ----------

describe("constraints in the generation pipeline (R1 M2)", () => {
  beforeEach(() => {
    stateStore.resetForTests();
  });

  test("applySpec locks matching-type components to the constrained rect", () => {
    const nav = addWithLayout("navbar", { x: 0, y: 0, w: 1200, h: 64 });
    const constraint = stateStore.addPageConstraint(nav.id);
    assert.ok(constraint);

    const result = applySpec({
      page: "current",
      style: null,
      base_color: null,
      components: [
        { type: "navbar", props: { brand: "新导航" } },
        { type: "card", props: { title: "新卡片" } },
      ],
    });
    assert.equal(result.report?.overlaps, 0);
    const layouts: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const n of result.nodes) {
      if (n.layout) layouts[n.type] = n.layout;
    }
    // navbar 按 type 匹配到约束矩形，不被重排
    assert.deepEqual(layouts.navbar, { x: 0, y: 0, w: 1200, h: 64 });
    // card 在锁定 navbar 之下流式让位（64 + 16）
    assert.equal(layouts.card.y, 80);
  });

  test("buildConstraintsExtra lists constraints; empty without them", () => {
    const pageId = stateStore.getState().currentPageId as string;
    assert.equal(buildConstraintsExtra(pageId), "");
    assert.equal(buildConstraintsExtra(null), "");

    const nav = addWithLayout("navbar", { x: 0, y: 0, w: 1200, h: 64 });
    stateStore.addPageConstraint(nav.id);
    const extra = buildConstraintsExtra(pageId);
    assert.match(extra, /navbar/);
    assert.match(extra, /page:"current"/);
    // few-shot 简报附注
    assert.match(extra, /当前页面结构简报/);
  });

  test("compilePageBrief renders the constraint block", () => {
    const pageId = stateStore.getState().currentPageId as string;
    assert.equal(compilePageBrief(stateStore.getState(), "nope"), "");
    const nav = addWithLayout("navbar", { x: 0, y: 0, w: 1200, h: 64 });
    stateStore.addPageConstraint(nav.id);
    const brief = compilePageBrief(stateStore.getState(), pageId);
    assert.match(brief, /### 布局约束/);
    assert.match(brief, /navbar：固定在 x=0，y=0，1200×64/);
  });
});
