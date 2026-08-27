import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { stateStore } from "../src/state.js";
import { attachCollabBridge, reconcileStateIntoYDoc } from "../src/collab/bridge.js";

beforeEach(() => {
  stateStore.resetForTests();
});

describe("collab bridge", () => {
  test("server-side mutation flows into ydoc on attach and on change", () => {
    const existing = stateStore.addComponent("text", undefined, { text: "old" }, null, "user");
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    // attach 时做初始全量对齐
    assert.ok(doc.getMap("components").get(existing.id));
    assert.deepEqual(doc.getMap("index").get(existing.id), { parentId: null, pageId: stateStore.getState().currentPageId, index: 0 });

    const added = stateStore.addComponent("text", undefined, { text: "new" }, null, "user");
    assert.ok(doc.getMap("components").get(added.id));
  });

  test("ydoc write applies into stateStore without touching undo history", () => {
    const node = stateStore.addComponent("text", undefined, { text: "old" }, null, "user");
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    const canUndoBefore = stateStore.canUndo();

    doc.transact(() => {
      doc.getMap("components").set(node.id, { id: node.id, type: "text", props: { text: "new" }, children: [] });
    }, "remote-client");

    const found = stateStore.getState().components.find((c) => c.id === node.id);
    assert.equal(found?.props.text, "new");
    // 双轨: 协同变更不进服务端快照 undo 历史
    assert.equal(stateStore.canUndo(), canUndoBefore);
  });

  test("ydoc add/remove restructures the tree", () => {
    const a = stateStore.addComponent("text", undefined, { text: "a" }, null, "user");
    const pageId = stateStore.getState().currentPageId!;
    const doc = new Y.Doc();
    attachCollabBridge(doc);

    doc.transact(() => {
      doc.getMap("components").set("fresh", { id: "fresh", type: "button", props: {}, children: [] });
      doc.getMap("index").set("fresh", { parentId: null, pageId, index: 5 });
    }, "remote-client");
    assert.ok(stateStore.getState().components.find((c) => c.id === "fresh"));

    doc.transact(() => {
      doc.getMap("components").delete(a.id);
      doc.getMap("index").delete(a.id);
    }, "remote-client");
    assert.equal(stateStore.getState().components.find((c) => c.id === a.id), undefined);
  });

  test("reconcile after server undo aligns ydoc to the restored snapshot", () => {
    const node = stateStore.addComponent("text", undefined, { text: "v1" }, null, "user");
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    stateStore.updateComponent(node.id, { text: "v2" }, "user");
    stateStore.undo(); // 回到 v1
    reconcileStateIntoYDoc(doc);
    const inDoc = doc.getMap("components").get(node.id) as { props: { text: string } };
    assert.equal(inDoc.props.text, "v1");
  });
});
