import { test, expect } from "vitest";
import * as Y from "yjs";
import { initLocalCollabForTests, collabMaps } from "./collab";
import { mergeCollabIntoState } from "./project";
import { useDesignStore } from "../stores/design";
import type { DesignStateView } from "../types";

const base = {
  projectName: "P", style: "s", tokens: {}, components: [],
  pages: [{ id: "p1", name: "首页", components: [] }],
  currentPageId: "p1", comments: [], revision: 1,
} as unknown as DesignStateView;

test("server ydoc update is projected into page components", () => {
  const { ydoc } = initLocalCollabForTests();
  const serverDoc = new Y.Doc();
  // 双向手动交换（模拟 provider 的网络同步；Yjs 更新幂等，无回环风险）
  serverDoc.on("update", (u) => Y.applyUpdate(ydoc, u));
  ydoc.on("update", (u) => Y.applyUpdate(serverDoc, u));

  serverDoc.transact(() => {
    serverDoc.getMap("components").set("c1", { id: "c1", type: "text", props: { text: "hi" }, children: [] });
    serverDoc.getMap("index").set("c1", { parentId: null, pageId: "p1", index: 0 });
    serverDoc.getMap("components").set("c2", { id: "c2", type: "text", props: { text: "child" }, children: [] });
    serverDoc.getMap("index").set("c2", { parentId: "c1", pageId: "p1", index: 0 });
  }, "remote");

  const merged = mergeCollabIntoState(base, collabMaps());
  expect(merged!.pages[0].components).toHaveLength(1);
  expect(merged!.pages[0].components[0].props.text).toBe("hi");
  expect(merged!.pages[0].components[0].children[0].props.text).toBe("child");
});

test("applyServerState merges collab projection into store state", () => {
  initLocalCollabForTests();
  // ydoc 为空时投影 = 原样（无协同组件）
  useDesignStore.getState().applyServerState(base);
  expect(useDesignStore.getState().state?.pages[0].components).toHaveLength(0);
  expect(useDesignStore.getState().baseState).toEqual(base);
});

test("client ydoc write reaches the server doc", () => {
  const { ydoc } = initLocalCollabForTests();
  const serverDoc = new Y.Doc();
  serverDoc.on("update", (u) => Y.applyUpdate(ydoc, u));
  ydoc.on("update", (u) => Y.applyUpdate(serverDoc, u));

  ydoc.transact(() => {
    ydoc.getMap("components").set("c9", { id: "c9", type: "text", props: {}, children: [] });
  }, "prism-local");

  expect(serverDoc.getMap("components").get("c9")).toBeTruthy();
});
