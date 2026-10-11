/**
 * R2 对话式精准修改: parse/diff 纯函数 + requestPageEdit（stub provider）+
 * applyEditOperations（runBatch 单 undo 步、skip 已删组件、add 落在锚点下方）。
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import os from "node:os";
import path from "node:path";
import { stateStore, type PageDef } from "../src/state.js";
import {
  applyEditOperations,
  clearPendingEditsForTests,
  collectPageComponents,
  computeEditDiffs,
  parseEditOperations,
  requestPageEdit,
  takePendingEdit,
  type PendingEdit,
} from "../src/llm/edit.js";

let tmp: string;
let originalDir: string | undefined;
let page: PageDef;
let heroId: string;
let buttonId: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "prism-edit-"));
  originalDir = process.env.PRISM_PROJECT_DIR;
  process.env.PRISM_PROJECT_DIR = tmp;
  stateStore.resetForTests();
  clearPendingEditsForTests();
  page = stateStore.addPage("测试页");
  heroId = stateStore.addComponent("hero", undefined, { title: "旧标题", subtitle: "副标题" }, null, "user").id;
  buttonId = stateStore.addComponent("button", undefined, { text: "点我" }, null, "user").id;
  stateStore.updateComponent(heroId, {}, "user", { x: 0, y: 0, w: 1200, h: 120 });
  stateStore.updateComponent(buttonId, {}, "user", { x: 0, y: 136, w: 200, h: 44 });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  if (originalDir === undefined) delete process.env.PRISM_PROJECT_DIR;
  else process.env.PRISM_PROJECT_DIR = originalDir;
});

const CFG = { provider: "openai" as const, apiKey: "sk-stub", model: "gpt-4o-mini" };

function stubContent(content: string): void {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
}

function restoreFetch(): void {
  delete (globalThis as { fetch?: unknown }).fetch;
}

// ===== parseEditOperations =====

test("parseEditOperations parses update/delete/add and tolerates fences", () => {
  const raw = '```json\n{"operations":[{"op":"update","component_id":"c1","props":{"title":"新"},"reason":"改标题"},{"op":"delete","component_id":"c2"},{"op":"add","component_type":"banner","props":{"text":"公告"}}]}\n```';
  const { operations, dropped } = parseEditOperations(raw, new Set(["c1", "c2"]));
  assert.equal(dropped, 0);
  assert.equal(operations.length, 3);
  assert.deepEqual(operations[0], {
    op: "update", component_id: "c1", props: { title: "新" }, reason: "改标题",
  });
  assert.equal(operations[1]!.op, "delete");
  assert.equal(operations[2]!.component_type, "banner");
});

test("parseEditOperations drops unknown ids, bad add types, non-object props", () => {
  const raw = JSON.stringify({
    operations: [
      { op: "update", component_id: "alien", props: { a: 1 } },
      { op: "delete", component_id: "c1" },
      { op: "add", component_type: "not_a_type", props: {} },
      { op: "add", component_type: "button", props: "oops" },
      { op: "nope" },
    ],
  });
  const { operations, dropped } = parseEditOperations(raw, new Set(["c1"]));
  assert.equal(dropped, 3);
  assert.equal(operations.length, 2);
  assert.equal(operations[0]!.op, "delete");
  assert.deepEqual(operations[1]!.props, {}, "非对象 props 归一为空对象");
});

test("parseEditOperations returns empty for unparseable text", () => {
  const { operations, dropped } = parseEditOperations("抱歉，我没理解", new Set(["c1"]));
  assert.equal(operations.length, 0);
  assert.equal(dropped, 0);
});

// ===== computeEditDiffs =====

test("computeEditDiffs lists only changed fields for update", () => {
  const byId = new Map([
    ["c1", { id: "c1", type: "hero", props: { title: "旧标题", subtitle: "副标题" } } as never],
  ]);
  const diffs = computeEditDiffs(
    [{ op: "update", component_id: "c1", props: { title: "新标题", subtitle: "副标题", cta_text: "立即抢购" } }],
    byId
  );
  assert.equal(diffs.length, 1);
  assert.deepEqual(diffs[0]!.changes, [
    { field: "title", before: "旧标题", after: "新标题" },
    { field: "cta_text", before: "（无）", after: "立即抢购" },
  ]);
  assert.equal(diffs[0]!.title, "旧标题");
  assert.equal(diffs[0]!.component_type, "hero");
});

test("computeEditDiffs: delete has empty changes, add lists all props as new", () => {
  const diffs = computeEditDiffs(
    [
      { op: "delete", component_id: "c1" },
      { op: "add", component_type: "banner", props: { text: "限时优惠" } },
    ],
    new Map([["c1", { id: "c1", type: "button", props: { text: "点我" } } as never]])
  );
  assert.equal(diffs[0]!.changes.length, 0);
  assert.equal(diffs[0]!.component_type, "button");
  assert.deepEqual(diffs[1]!.changes, [{ field: "text", before: "（无）", after: "限时优惠" }]);
});

test("computeEditDiffs truncates long values and serializes objects", () => {
  const long = "长".repeat(80);
  const diffs = computeEditDiffs(
    [{ op: "update", component_id: "c1", props: { items: [{ a: 1 }], body: long } }],
    new Map([["c1", { id: "c1", type: "text_section", props: {} } as never]])
  );
  assert.equal(diffs[0]!.changes[0]!.after, '[{"a":1}]');
  assert.ok(diffs[0]!.changes[1]!.after.endsWith("…"));
  assert.ok(diffs[0]!.changes[1]!.after.length <= 61);
});

// ===== requestPageEdit (stub provider) =====

test("requestPageEdit builds diff preview and stages a one-shot pending edit", async () => {
  stubContent(
    JSON.stringify({
      operations: [
        { op: "update", component_id: heroId, props: { title: "新标题" }, reason: "换标题" },
        { op: "update", component_id: "comp_deleted", props: { title: "x" } },
      ],
    })
  );
  try {
    const preview = await requestPageEdit("把标题换成新标题", [heroId], CFG);
    assert.equal(preview.requested, 1, "未知 id 的操作被过滤");
    assert.equal(preview.dropped, 1);
    assert.match(preview.summary, /1 处修改建议/);
    assert.equal(preview.diffs[0]!.changes[0]!.field, "title");

    const pending = takePendingEdit(preview.edit_id);
    assert.ok(pending);
    assert.equal(pending!.operations.length, 1);
    assert.equal(takePendingEdit(preview.edit_id), null, "一次性消费");
  } finally {
    restoreFetch();
  }
});

test("requestPageEdit throws when no selected component exists", async () => {
  await assert.rejects(() => requestPageEdit("改一下", ["comp_missing"], CFG), /不存在/);
});

test("collectPageComponents keeps tree order across nesting", () => {
  const childId = stateStore.addComponent("banner", undefined, { text: "子" }, heroId, "user").id;
  const found = collectPageComponents(
    stateStore.getState().pages.find((p) => p.id === page.id)!.components,
    [childId, buttonId]
  );
  assert.deepEqual(found.map((n) => n.id), [childId, buttonId], "DFS 树序: hero 的子 banner 先于 button");
});

// ===== applyEditOperations =====

function buildPending(operations: PendingEdit["operations"]): PendingEdit {
  return {
    id: "edit_test",
    created_at: Date.now(),
    target_ids: [heroId, buttonId],
    operations,
    diffs: [],
  };
}

test("applyEditOperations applies update/delete/add in one undo step", () => {
  const result = applyEditOperations(
    buildPending([
      { op: "update", component_id: heroId, props: { title: "新标题" } },
      { op: "delete", component_id: buttonId },
      { op: "add", component_type: "banner", props: { text: "公告" } },
    ])
  );
  assert.deepEqual(result, { applied: 3, skipped: 0, added: 1 });

  const page = stateStore.getState().pages.find((p) => p.id === pageIdOf())!;
  const banner = page.components[page.components.length - 1];
  assert.equal(banner.type, "banner", "新组件追加到根部");
  assert.equal(banner.props.text, "公告");
  // add 落在锚点（hero，仍存在）下方，同宽
  assert.equal(banner.layout!.x, 0);
  assert.equal(banner.layout!.y, 136);
  assert.equal(banner.layout!.w, 1200);

  // 单 undo 步: 一次撤销回滚全部三处修改
  assert.equal(stateStore.undo(), true);
  const restored = stateStore.getState().pages.find((p) => p.id === pageIdOf())!;
  assert.equal(restored.components.find((c) => c.id === heroId)!.props.title, "旧标题");
  assert.ok(restored.components.find((c) => c.id === buttonId), "删除已回滚");
  assert.equal(restored.components.filter((c) => c.type === "banner").length, 0, "新增已回滚");
});

function pageIdOf(): string {
  return page.id;
}

test("applyEditOperations skips ops whose component vanished; add without anchor has no layout", () => {
  const pending = buildPending([
    { op: "update", component_id: "comp_ghost", props: { title: "x" } },
    { op: "add", component_type: "button", props: { text: "无锚点" } },
  ]);
  pending.target_ids = ["comp_ghost", "comp_ghost2"]; // 全部不存在 → 无锚点
  const result = applyEditOperations(pending);
  assert.deepEqual(result, { applied: 1, skipped: 1, added: 1 });
  const page = stateStore.getState().pages.find((p) => p.id === pageIdOf())!;
  const added = page.components[page.components.length - 1];
  assert.equal(added.type, "button");
  assert.equal(added.layout, undefined, "锚点不存在 → 流式（无布局）");
});

test("applyEditOperations skips update of already-deleted anchor target", () => {
  const result = applyEditOperations(
    buildPending([{ op: "delete", component_id: buttonId }, { op: "update", component_id: buttonId, props: { text: "x" } }])
  );
  assert.deepEqual(result, { applied: 1, skipped: 1, added: 0 });
});
