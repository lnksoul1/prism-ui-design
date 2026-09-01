// tests/code-sync.test.ts（本任务先写导出部分，Task 14 再追加导入用例）
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { exportPageToJsx, mergePageExport } from "../src/code-sync/jsx-export.js";
import { parseEditRegions, extractNodeUpdate, computeCodeSyncChanges } from "../src/code-sync/jsx-import.js";
import { applyCodeSyncChanges } from "../src/code-sync/apply.js";

beforeEach(() => {
  stateStore.resetForTests();
});

function pageOf(): { id: string; name: string; components: ReturnType<typeof stateStore.getState>["components"] } {
  return stateStore.getState().pages.find((p) => p.id === stateStore.getState().currentPageId)!;
}

describe("jsx export", () => {
  test("fresh export wraps each component in @prism-edit region", () => {
    const node = stateStore.addComponent("button", undefined, { text: "确定" }, null, "user");
    stateStore.setBaseStyle(node.id, { color: "#111" }, "user");
    const code = exportPageToJsx(pageOf());
    assert.match(code, /@prism-edit id=/);
    assert.match(code, new RegExp(`@prism-edit id=${node.id} type=button`));
    assert.match(code, /data-prism-id=/);
    assert.match(code, /color: "#111"/);
    assert.match(code, /"确定"/);
    assert.match(code, /@prism-edit-end/);
  });

  test("merge replaces edited regions but keeps @prism-ignore regions untouched", () => {
    const a = stateStore.addComponent("button", undefined, { text: "新版文案" }, null, "user");
    const existing = `import React from "react";

export default function PageDemo() {
  return (
    <div className="prism-page" data-prism-page="${pageOf().id}">
      {/* @prism-edit id=${a.id} type=button */}
      <button data-prism-id="${a.id}">旧版文案</button>
      {/* @prism-edit-end */}
      {/* @prism-edit id=handwritten @prism-ignore */}
      <div>手写代码不许动</div>
      {/* @prism-edit-end */}
    </div>
  );
}
`;
    const merged = mergePageExport(pageOf(), existing);
    assert.match(merged, /新版文案/);
    assert.doesNotMatch(merged, /旧版文案/);
    assert.match(merged, /手写代码不许动/); // ignore 区域原样保留
  });

  test("merge appends newly added components and drops removed ones", () => {
    const a = stateStore.addComponent("button", undefined, { text: "A" }, null, "user");
    const first = exportPageToJsx(pageOf());
    stateStore.removeComponent(a.id, "user");
    const b = stateStore.addComponent("text", undefined, { text: "B" }, null, "user");
    const merged = mergePageExport(pageOf(), first);
    // 组件 id 实际生成规则为 comp_<ts>_<rand>，用被删组件的真实 id 断言「区域消失」
    assert.doesNotMatch(merged, new RegExp(`data-prism-id="${a.id}"`));
    assert.match(merged, new RegExp(`@prism-edit id=${b.id}`));
  });
});

describe("jsx import", () => {
  test("parseEditRegions splits regions and flags ignored ones", () => {
    const src = [
      "      {/* @prism-edit id=c1 type=button */}",
      "      <button data-prism-id=\"c1\">A</button>",
      "      {/* @prism-edit-end */}",
      "      {/* @prism-edit id=c2 @prism-ignore */}",
      "      <div>B</div>",
      "      {/* @prism-edit-end */}",
    ].join("\n");
    const regions = parseEditRegions(src);
    assert.equal(regions.length, 2);
    assert.equal(regions[0].id, "c1");
    assert.equal(regions[0].ignored, false);
    assert.equal(regions[1].ignored, true);
  });

  test("extractNodeUpdate pulls text and style from jsx", () => {
    const update = extractNodeUpdate('      <button data-prism-id="c1" style={{ color: "#f00", width: 200 }}>\n        {"新文案"}\n      </button>');
    assert.equal(update.text, "新文案");
    assert.deepEqual(update.style, { color: "#f00", width: "200" });
  });

  test("round-trip: code edits flow back into stateStore (apply)", () => {
    const node = stateStore.addComponent("button", undefined, { text: "旧" }, null, "user");
    const page = pageOf();
    const exported = exportPageToJsx(page);
    const edited = exported.replace(
      /(\{"旧"\})/,
      '{"代码改的文案"}'
    ).replace(
      new RegExp(`(data-prism-id="${node.id}")`),
      '$1 style={{ color: "#0f0" }}'
    );
    const changes = computeCodeSyncChanges(page, edited);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].text, "代码改的文案");

    assert.equal(applyCodeSyncChanges(changes).applied, 1);
    const updated = stateStore.getState().components.find((c) => c.id === node.id);
    assert.equal(updated?.props.text, "代码改的文案");
    assert.equal(updated?.baseStyle?.color, "#0f0");
  });

  test("ignored and unknown regions are reported but not applied", () => {
    const page = pageOf();
    const src = [
      "      {/* @prism-edit id=ghost */}",
      "      <div>x</div>",
      "      {/* @prism-edit-end */}",
      "      {/* @prism-edit id=other @prism-ignore */}",
      "      <div>y</div>",
      "      {/* @prism-edit-end */}",
    ].join("\n");
    const changes = computeCodeSyncChanges(page, src);
    assert.deepEqual(
      changes.map((c) => c.skipped),
      ["unknown", "ignored"]
    );
    assert.equal(applyCodeSyncChanges(changes).applied, 0);
  });
});
