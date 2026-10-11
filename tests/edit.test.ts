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
  requestAiRedo,
  requestAiUndo,
  requestPageEdit,
  resetAiHistoryForTests,
  takePendingEdit,
  type PendingEdit,
} from "../src/llm/edit.js";
import {
  appendTurn,
  clearEditSessionsForTests,
  createEditSession,
  getEditSession,
  MAX_SESSION_MESSAGES,
} from "../src/llm/session.js";

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
  clearEditSessionsForTests();
  resetAiHistoryForTests();
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

// ===== R3 会话式编辑 =====

test("appendTurn trims history to MAX_SESSION_MESSAGES", () => {
  const s = createEditSession("page_x");
  for (let i = 0; i < 6; i++) appendTurn(s, `u${i}`, `a${i}`);
  assert.equal(s.messages.length, MAX_SESSION_MESSAGES);
  assert.equal(s.messages[0].content, "u0", "恰好 12 条不裁剪");
  appendTurn(s, "u6", "a6");
  assert.equal(s.messages.length, MAX_SESSION_MESSAGES);
  assert.equal(s.messages[0].content, "u1", "最旧的被裁掉");
  assert.equal(s.messages[MAX_SESSION_MESSAGES - 1].content, "a6");
});

test("R3 会话: consecutive turns reuse session and inject history; page switch starts fresh", async () => {
  const bodies: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    bodies.push(String((init as RequestInit)?.body || ""));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"operations":[]}' } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;
  try {
    const first = await requestPageEdit("把标题改短", [heroId], CFG);
    const second = await requestPageEdit("再大一点", [heroId], CFG, first.session_id);
    assert.equal(second.session_id, first.session_id, "同页复用会话");

    const secondPayload = JSON.parse(bodies[1]) as {
      messages: Array<{ role: string; content: string }>;
    };
    assert.equal(secondPayload.messages.length, 4, "system + user1 + assistant1 + user2");
    assert.equal(secondPayload.messages[0]!.role, "system");
    assert.match(secondPayload.messages[1]!.content, /把标题改短/);
    assert.equal(secondPayload.messages[2]!.role, "assistant");
    assert.match(secondPayload.messages[3]!.content, /再大一点/);

    // 页面切换: 旧 session_id 指向别的页面 → 开新会话
    stateStore.addPage("第二页");
    const bannerId = stateStore.addComponent("banner", undefined, { text: "B" }, null, "user").id;
    const third = await requestPageEdit("改公告", [bannerId], CFG, first.session_id);
    assert.notEqual(third.session_id, first.session_id, "跨页自动开新会话");
    const thirdPayload = JSON.parse(bodies[2]) as { messages: Array<{ role: string }> };
    assert.equal(thirdPayload.messages.length, 2, "新会话无历史");

    // 未知 session_id → 视为无历史的新会话
    const fourth = await requestPageEdit("改公告", [bannerId], CFG, "sess_ghost");
    assert.notEqual(fourth.session_id, "sess_ghost");
  } finally {
    globalThis.fetch = original;
  }
});

test("R3 会话: unknown session id is ignored (fresh session)", async () => {
  const s = getEditSession("sess_ghost");
  assert.equal(s, null);
  const created = createEditSession("page_y");
  assert.ok(getEditSession(created.id));
});

// ===== R4 语义布局操作 =====

test("parseEditOperations validates arrange/align/gap and clamps delta", () => {
  const raw = JSON.stringify({
    operations: [
      { op: "arrange", component_id: heroId, layout_intent: "row", reason: "并排" },
      { op: "arrange", component_id: heroId, layout_intent: "diagonal" },
      { op: "arrange", component_id: "comp_alien", layout_intent: "row" },
      { op: "align", component_id: buttonId, align: "center" },
      { op: "align", component_id: buttonId, align: "middle" },
      { op: "gap", delta: 9999 },
      { op: "gap", delta: -9999 },
      { op: "gap" },
    ],
  });
  const { operations, dropped } = parseEditOperations(raw, new Set([heroId, buttonId]));
  assert.equal(dropped, 4);
  assert.equal(operations.length, 4);
  assert.equal(operations.find((o) => o.op === "arrange")!.layout_intent, "row");
  assert.equal(operations.find((o) => o.op === "align")!.align, "center");
  const deltas = operations.filter((o) => o.op === "gap").map((o) => o.delta).sort((a, b) => a! - b!);
  assert.deepEqual(deltas, [-120, 120], "delta 钳制到 ±120");
});

function pageOfNow(): PageDef {
  return stateStore.getState().pages.find((p) => p.id === pageIdOf())!;
}

test("R4 gap: diff and apply shift selected stack by delta per index", () => {
  const ops: PendingEdit["operations"] = [{ op: "gap", delta: -16, reason: "间距小一点" }];
  const page = pageOfNow();
  const byId = new Map(page.components.map((n) => [n.id, n]));
  const diffs = computeEditDiffs(ops, byId, page, 1200, new Set([heroId, buttonId]));
  assert.equal(diffs.length, 1, "只有 y 序第二的组件移动");
  assert.deepEqual(diffs[0]!.changes, [{ field: "位置", before: "(0, 136)", after: "(0, 120)" }]);

  const result = applyEditOperations(buildPending(ops));
  assert.deepEqual(result, { applied: 1, skipped: 0, added: 0 });
  assert.equal(pageOfNow().components.find((c) => c.id === buttonId)!.layout!.y, 120);
  assert.equal(pageOfNow().components.find((c) => c.id === heroId)!.layout!.y, 0, "y 序第一不动");
});

test("R4 align: centers on page width; flow component is skipped", () => {
  const flowId = stateStore.addComponent("banner", undefined, { text: "流式" }, null, "user").id;
  const ops: PendingEdit["operations"] = [
    { op: "align", component_id: buttonId, align: "center", reason: "居中" },
    { op: "align", component_id: flowId, align: "center" },
  ];
  // diff 预览必须先于应用计算（应用后状态已变）
  const page = pageOfNow();
  const byId = new Map(page.components.map((n) => [n.id, n]));
  const diffs = computeEditDiffs([ops[0]!], byId, page, 1200, new Set([heroId, buttonId]));
  assert.deepEqual(diffs[0]!.changes[0], { field: "位置", before: "(0, 136)", after: "(500, 136)" });

  const result = applyEditOperations(buildPending(ops));
  assert.deepEqual(result, { applied: 1, skipped: 1, added: 0 });
  assert.equal(pageOfNow().components.find((c) => c.id === buttonId)!.layout!.x, 500);
});

test("R4 arrange: row intent bands selected components; bystander previewed; undo restores", () => {
  const cardId = stateStore.addComponent("card", undefined, { title: "卡片" }, null, "user").id;
  stateStore.updateComponent(cardId, {}, "user", { x: 0, y: 196, w: 1200, h: 300 });
  // hero 左缘挪离边距 → 重排时被宽单元吸附联动，用于验证旁邻预览
  stateStore.updateComponent(heroId, {}, "user", { x: 40, y: 0, w: 1200, h: 120 });
  const ops: PendingEdit["operations"] = [
    { op: "arrange", component_id: buttonId, layout_intent: "row", reason: "并排" },
    { op: "arrange", component_id: cardId, layout_intent: "row", reason: "并排" },
  ];
  const page = pageOfNow();
  const byId = new Map(page.components.map((n) => [n.id, n]));
  const diffs = computeEditDiffs(ops, byId, page, 1200, new Set([buttonId, cardId]));
  const targetDiffs = diffs.filter((d) => d.component_id === buttonId || d.component_id === cardId);
  assert.ok(targetDiffs.length >= 2, "两个目标组件都有布局 diff");
  assert.ok(diffs.some((d) => d.component_id === heroId), "旁邻组件联动移动被如实预览");

  const result = applyEditOperations(buildPending(ops));
  assert.ok(result.applied >= 2);
  const b = pageOfNow().components.find((c) => c.id === buttonId)!.layout!;
  const c = pageOfNow().components.find((cc) => cc.id === cardId)!.layout!;
  assert.equal(b.y, c.y, "band 内同一行");
  assert.ok(c.x > b.x, "横向并排");
  assert.equal(b.w, c.w, "等宽");
  assert.ok(b.x >= 16, "吸左边距");

  assert.equal(stateStore.undo(), true, "整页重排是单 undo 步");
  assert.equal(pageOfNow().components.find((cc) => cc.id === cardId)!.layout!.y, 196);
});

test("R4 arrange respects locked constraints", () => {
  stateStore.addPageConstraint(heroId, "user");
  const cardId = stateStore.addComponent("card", undefined, { title: "卡片" }, null, "user").id;
  stateStore.updateComponent(cardId, {}, "user", { x: 0, y: 196, w: 1200, h: 300 });
  const ops: PendingEdit["operations"] = [
    { op: "arrange", component_id: buttonId, layout_intent: "row" },
    { op: "arrange", component_id: cardId, layout_intent: "row" },
  ];
  applyEditOperations(buildPending(ops));
  const hero = pageOfNow().components.find((c) => c.id === heroId)!.layout!;
  assert.deepEqual(hero, { x: 0, y: 0, w: 1200, h: 120 }, "约束锁定的组件不参与重排");
});

// ===== R5 对话化撤销/恢复 =====

test("R5 parse: undo/redo 无参数放行；空选区只允许 undo/redo", () => {
  const raw = JSON.stringify({
    operations: [
      { op: "undo", reason: "撤销上一步" },
      { op: "redo" },
      { op: "update", component_id: heroId, props: { title: "x" } },
      { op: "add", component_type: "button", props: { text: "y" } },
    ],
  });
  const withSel = parseEditOperations(raw, new Set([heroId]));
  assert.equal(withSel.dropped, 0);
  assert.equal(withSel.operations.length, 4);

  const noSel = parseEditOperations(raw, new Set());
  assert.equal(noSel.dropped, 2, "空选区丢弃 update/add");
  assert.deepEqual(noSel.operations.map((o) => o.op), ["undo", "redo"]);
});

test("R5 diff: undo/redo 渲染为无变更条目", () => {
  const diffs = computeEditDiffs([{ op: "undo", reason: "撤销" }], new Map());
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0]!.op, "undo");
  assert.equal(diffs[0]!.component_type, "");
  assert.equal(diffs[0]!.changes.length, 0);
});

test("R5 applyEditOperations 拒绝混入 undo/redo", () => {
  assert.throws(
    () => applyEditOperations(buildPending([{ op: "undo", reason: "x" }])),
    /单独/
  );
});

test("R5 undo/redo: 对话撤销回滚最近一次 AI 应用，对话恢复还原", async () => {
  stubContent(
    JSON.stringify({
      operations: [{ op: "update", component_id: heroId, props: { title: "AI 标题" }, reason: "改标题" }],
    })
  );
  try {
    const preview = await requestPageEdit("把标题换成 AI 标题", [heroId], CFG);
    applyEditOperations(takePendingEdit(preview.edit_id)!);
    assert.equal(pageOfNow().components.find((c) => c.id === heroId)!.props.title, "AI 标题");

    assert.equal(requestAiUndo(), "已撤销上一步 AI 修改");
    assert.equal(pageOfNow().components.find((c) => c.id === heroId)!.props.title, "旧标题");

    assert.equal(requestAiRedo(), "已恢复上一步 AI 修改");
    assert.equal(pageOfNow().components.find((c) => c.id === heroId)!.props.title, "AI 标题");
  } finally {
    restoreFetch();
  }
});

test("R5 护栏: 无 AI 落地 / 手动改动后 / 连续撤销 均被拒", async () => {
  assert.throws(() => requestAiUndo(), /没有可撤销的 AI 修改/);
  assert.throws(() => requestAiRedo(), /没有可恢复的 AI 修改/);

  stubContent(
    JSON.stringify({
      operations: [{ op: "update", component_id: heroId, props: { title: "AI 标题" } }],
    })
  );
  try {
    const preview = await requestPageEdit("改标题", [heroId], CFG);
    applyEditOperations(takePendingEdit(preview.edit_id)!);
  } finally {
    restoreFetch();
  }

  // 用户手动改了一笔 → 指纹失配 → 拒绝对话撤销
  stateStore.updateComponent(buttonId, { text: "手改" }, "user");
  assert.throws(() => requestAiUndo(), /已有其他改动/);

  // 手动改了又手动撤回 → 指纹复原（最后存活的一步又是 AI 修改）→ 允许
  assert.equal(stateStore.undo(), true);
  assert.equal(requestAiUndo(), "已撤销上一步 AI 修改");

  // 连续第二次对话撤销被拒（只针对最近一次 AI 修改）
  assert.throws(() => requestAiUndo(), /没有可撤销的 AI 修改/);
});

test("R5 护栏: AI 撤销后画布被改动则无法对话恢复", async () => {
  stubContent(
    JSON.stringify({
      operations: [{ op: "update", component_id: heroId, props: { title: "AI 标题" } }],
    })
  );
  try {
    const preview = await requestPageEdit("改标题", [heroId], CFG);
    applyEditOperations(takePendingEdit(preview.edit_id)!);
  } finally {
    restoreFetch();
  }
  assert.equal(requestAiUndo(), "已撤销上一步 AI 修改");

  stateStore.addComponent("banner", undefined, { text: "新组件" }, null, "user");
  assert.throws(() => requestAiRedo(), /无法恢复/);
});
