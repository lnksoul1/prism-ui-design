import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { stateStore } from "../src/state.js";
import { attachCollabBridge, reconcileStateIntoYDoc, SERVER_ORIGIN } from "../src/collab/bridge.js";

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

  test("ydoc index-only rewrite reorders server page components (client z-order drag)", () => {
    const a = stateStore.addComponent("text", undefined, { text: "a" }, null, "user");
    const b = stateStore.addComponent("text", undefined, { text: "b" }, null, "user");
    const c = stateStore.addComponent("text", undefined, { text: "c" }, null, "user");
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    const pageId = stateStore.getState().currentPageId!;
    // 客户端图层面板拖拽: 单事务只重写受影响的根层级 index 条目（b 顺序不变）
    doc.transact(() => {
      doc.getMap("index").set(a.id, { parentId: null, pageId, index: 2 });
      doc.getMap("index").set(c.id, { parentId: null, pageId, index: 0 });
    }, "remote-client");
    assert.deepEqual(
      stateStore.getState().components.map((x: { id: string }) => x.id),
      [c.id, b.id, a.id]
    );
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

describe("collab bridge comments (P3a)", () => {
  beforeEach(() => {
    stateStore.resetForTests();
  });

  test("server comment writes reconcile into the ydoc comments map", () => {
    const node = stateStore.addComponent("text", undefined, { text: "hi" }, null, "user");
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    assert.equal(doc.getMap("comments").size, 0);
    const c = stateStore.addComment(node.id, "字太小", "alice", "user", { x: 8, y: 8 });
    assert.ok(doc.getMap("comments").get(c.id));
  });

  test("ydoc comment writes project into stateStore without undo history", () => {
    const node = stateStore.addComponent("text", undefined, { text: "hi" }, null, "user");
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    const canUndoBefore = stateStore.canUndo();
    const comment = {
      id: "comment_test_1",
      component_id: node.id,
      author: "alice",
      text: "来自客户端",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    doc.transact(() => {
      (doc.getMap("comments") as Y.Map<unknown>).set(comment.id, comment);
    }, "remote-client");
    const stored = stateStore.getState().comments.find((x) => x.id === comment.id);
    assert.equal(stored?.text, "来自客户端");
    // 双轨: 评论协作变更不进服务端快照 undo 历史
    assert.equal(stateStore.canUndo(), canUndoBefore);
  });

  test("ydoc comment update and delete project into stateStore", () => {
    const node = stateStore.addComponent("text", undefined, {}, null, "user");
    const c = stateStore.addComment(node.id, "改一下", "alice", "user");
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    const map = doc.getMap("comments");
    doc.transact(() => {
      map.set(c.id, { ...(map.get(c.id) as object), resolved: true, updatedAt: "2026-01-01T00:00:00.000Z" });
    }, "remote-client");
    assert.equal(stateStore.getState().comments.find((x) => x.id === c.id)?.resolved, true);
    doc.transact(() => {
      map.delete(c.id);
    }, "remote-client");
    assert.equal(stateStore.getState().comments.find((x) => x.id === c.id), undefined);
  });

  test("comment projection never bounces back as a server-origin ydoc write", () => {
    const node = stateStore.addComponent("text", undefined, {}, null, "user");
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    let serverOriginWrites = 0;
    doc.on("afterTransaction", (tr) => {
      if (tr.origin === SERVER_ORIGIN) serverOriginWrites++;
    });
    doc.transact(() => {
      (doc.getMap("comments") as Y.Map<unknown>).set("comment_c1", {
        id: "comment_c1",
        component_id: node.id,
        author: "alice",
        text: "t",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    }, "remote-client");
    assert.ok(stateStore.getState().comments.find((x) => x.id === "comment_c1"));
    // 投影只落在 stateStore，不产生 SERVER_ORIGIN 回写（幂等 reconcile 兜底）
    assert.equal(serverOriginWrites, 0);
  });

  test("server undo restores comments and reconcile re-aligns ydoc", () => {
    const node = stateStore.addComponent("text", undefined, {}, null, "user");
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    const c = stateStore.addComment(node.id, "x", "alice", "user");
    stateStore.removeComment(c.id, "user");
    assert.equal(stateStore.getState().comments.length, 0);
    assert.equal(doc.getMap("comments").get(c.id), undefined);
    stateStore.undo(); // 评论随快照恢复
    assert.equal(stateStore.getState().comments.length, 1);
    assert.ok(doc.getMap("comments").get(c.id));
  });
});

describe("collab bridge page links (P3b)", () => {
  beforeEach(() => {
    stateStore.resetForTests();
  });

  test("server link writes reconcile into the ydoc pageLinks map", () => {
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    const pageId = stateStore.getState().currentPageId!;
    const link = stateStore.addPageLink(pageId, pageId, undefined, undefined, "user");
    assert.ok(doc.getMap("pageLinks").get(link.id));
  });

  test("ydoc link writes project into stateStore without undo history", () => {
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    const pageId = stateStore.getState().currentPageId!;
    const canUndoBefore = stateStore.canUndo();
    const link = {
      id: "link_test_1",
      from_page_id: pageId,
      to_page_id: pageId,
      source_component_id: "comp_x",
      transition: "fade",
    };
    doc.transact(() => {
      (doc.getMap("pageLinks") as Y.Map<unknown>).set(link.id, link);
    }, "remote-client");
    const stored = stateStore.getState().pageLinks.find((l) => l.id === link.id);
    assert.equal(stored?.source_component_id, "comp_x");
    // 双轨: 连线协作变更不进服务端快照 undo 历史
    assert.equal(stateStore.canUndo(), canUndoBefore);
  });

  test("ydoc link update and delete project into stateStore", () => {
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    const pageId = stateStore.getState().currentPageId!;
    const link = stateStore.addPageLink(pageId, pageId, undefined, undefined, "user", "fade");
    const map = doc.getMap("pageLinks");
    doc.transact(() => {
      map.set(link.id, { ...(map.get(link.id) as object), transition: "slide-left" });
    }, "remote-client");
    assert.equal(stateStore.getState().pageLinks.find((l) => l.id === link.id)?.transition, "slide-left");
    doc.transact(() => {
      map.delete(link.id);
    }, "remote-client");
    assert.equal(stateStore.getState().pageLinks.length, 0);
  });

  test("link projection never bounces back as a server-origin ydoc write", () => {
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    const pageId = stateStore.getState().currentPageId!;
    let serverOriginWrites = 0;
    doc.on("afterTransaction", (tr) => {
      if (tr.origin === SERVER_ORIGIN) serverOriginWrites++;
    });
    doc.transact(() => {
      (doc.getMap("pageLinks") as Y.Map<unknown>).set("link_c1", {
        id: "link_c1",
        from_page_id: pageId,
        to_page_id: pageId,
        transition: "fade",
      });
    }, "remote-client");
    assert.ok(stateStore.getState().pageLinks.find((l) => l.id === "link_c1"));
    assert.equal(serverOriginWrites, 0);
  });
});

describe("collab bridge action flows (P3c)", () => {
  beforeEach(() => {
    stateStore.resetForTests();
  });

  test("server flow writes reconcile into the ydoc actionFlows map", () => {
    const node = stateStore.addComponent("button", undefined, {}, null, "user");
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    const created = stateStore.addActionFlow(
      { id: "flow_s1", name: "服务端流程", trigger: "click", componentId: node.id, steps: [], enabled: true },
      "user"
    );
    assert.ok(doc.getMap("actionFlows").get(created.id));
  });

  test("ydoc flow writes project into stateStore without undo history", () => {
    const node = stateStore.addComponent("button", undefined, {}, null, "user");
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    const canUndoBefore = stateStore.canUndo();
    const flow = {
      id: "flow_c1",
      name: "客户端流程",
      trigger: "click",
      componentId: node.id,
      steps: [{ id: "s1", action: "toast", params: { message: "hi" } }],
      enabled: true,
    };
    doc.transact(() => {
      (doc.getMap("actionFlows") as Y.Map<unknown>).set(flow.id, flow);
    }, "remote-client");
    const stored = stateStore.getState().actionFlows[flow.id];
    assert.equal(stored?.name, "客户端流程");
    assert.equal(stored?.steps[0]?.params.message, "hi");
    // 双轨: ActionFlow 协作变更不进服务端快照 undo 历史
    assert.equal(stateStore.canUndo(), canUndoBefore);
  });

  test("ydoc flow update and delete project into stateStore", () => {
    const node = stateStore.addComponent("button", undefined, {}, null, "user");
    const created = stateStore.addActionFlow(
      { id: "flow_s2", name: "待改", trigger: "click", componentId: node.id, steps: [], enabled: true },
      "user"
    );
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    const map = doc.getMap("actionFlows");
    doc.transact(() => {
      map.set(created.id, { ...(map.get(created.id) as object), name: "已改" });
    }, "remote-client");
    assert.equal(stateStore.getState().actionFlows[created.id]?.name, "已改");
    doc.transact(() => {
      map.delete(created.id);
    }, "remote-client");
    assert.equal(stateStore.getState().actionFlows[created.id], undefined);
  });

  test("flow projection never bounces back as a server-origin ydoc write", () => {
    const node = stateStore.addComponent("button", undefined, {}, null, "user");
    const doc = new Y.Doc();
    attachCollabBridge(doc);
    let serverOriginWrites = 0;
    doc.on("afterTransaction", (tr) => {
      if (tr.origin === SERVER_ORIGIN) serverOriginWrites++;
    });
    doc.transact(() => {
      (doc.getMap("actionFlows") as Y.Map<unknown>).set("flow_c2", {
        id: "flow_c2",
        name: "t",
        trigger: "click",
        componentId: node.id,
        steps: [],
        enabled: true,
      });
    }, "remote-client");
    assert.ok(stateStore.getState().actionFlows.flow_c2);
    assert.equal(serverOriginWrites, 0);
  });
});
