import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { ActionFlowView, CommentView, PageLinkView } from "../types";

export const LOCAL_ORIGIN = "prism-local";
export const ROOM_NAME = "prism-main";

export interface CollabInstance {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  undoManager: Y.UndoManager;
}

let instance: CollabInstance | null = null;

function createInstance(withProvider: boolean): CollabInstance {
  const ydoc = new Y.Doc();
  let provider: WebsocketProvider | null = null;
  if (withProvider) {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    provider = new WebsocketProvider(`${scheme}://${location.host}/collab`, ROOM_NAME, ydoc);
  }
  const undoManager = new Y.UndoManager(
    [
      ydoc.getMap("components"),
      ydoc.getMap("index"),
      ydoc.getMap("tokens"),
      ydoc.getMap("comments"),
      ydoc.getMap("pageLinks"),
      ydoc.getMap("actionFlows"),
    ],
    { trackedOrigins: new Set([LOCAL_ORIGIN]) }
  );
  return { ydoc, provider, undoManager };
}

export function getCollab(): CollabInstance {
  if (!instance) instance = createInstance(true);
  return instance;
}

/** 单测用: 本地 Y.Doc（无 provider），编辑/撤销语义与线上完全一致。 */
export function initLocalCollabForTests(): CollabInstance {
  instance = createInstance(false);
  return instance;
}

export function collabMaps(): { components: Y.Map<unknown>; index: Y.Map<unknown> } | null {
  if (!instance) return null;
  return { components: instance.ydoc.getMap("components"), index: instance.ydoc.getMap("index") };
}

// ===== P3a 评论协作区（id → CommentView）=====

function commentsMap(): Y.Map<CommentView> | null {
  if (!instance) return null;
  return instance.ydoc.getMap("comments") as Y.Map<CommentView>;
}

/** 评论稳定序: createdAt + id，与服务端 bridge.sortComments 一致。 */
function sortComments(list: CommentView[]): CommentView[] {
  return [...list].sort(
    (a, b) => (a.createdAt || "").localeCompare(b.createdAt || "") || a.id.localeCompare(b.id)
  );
}

/** 读取评论快照（渲染用；无协作实例时返回空列表）。 */
export function readCollabComments(): CommentView[] {
  const map = commentsMap();
  if (!map) return [];
  return sortComments(Array.from(map.values()).map((c) => ({ ...c })));
}

/** 新增/更新评论（LOCAL_ORIGIN 事务，进客户端撤销栈）。 */
export function upsertCollabComment(comment: CommentView): void {
  const map = commentsMap();
  if (!map) return;
  map.doc?.transact(() => {
    map.set(comment.id, { ...comment });
  }, LOCAL_ORIGIN);
}

/** 删除评论。 */
export function removeCollabComment(id: string): void {
  const map = commentsMap();
  if (!map) return;
  map.doc?.transact(() => {
    map.delete(id);
  }, LOCAL_ORIGIN);
}

/** 订阅评论变化（返回解绑函数；无协作实例时返回 noop）。 */
export function observeCollabComments(handler: () => void): () => void {
  const map = commentsMap();
  if (!map) return () => {};
  map.observe(handler);
  return () => map.unobserve(handler);
}

// ===== P3b 连线协作区（id → PageLinkView）=====

function pageLinksMap(): Y.Map<PageLinkView> | null {
  if (!instance) return null;
  return instance.ydoc.getMap("pageLinks") as Y.Map<PageLinkView>;
}

/** 读取连线快照（渲染用；无协作实例时返回空列表）。 */
export function readCollabPageLinks(): PageLinkView[] {
  const map = pageLinksMap();
  if (!map) return [];
  return Array.from(map.values())
    .map((l) => ({ ...l }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 新增连线（LOCAL_ORIGIN 事务，进客户端撤销栈）。
 * 复刻服务端 addPageLink 的「每源组件一条」约束: 同事务内先摘除旧出边。
 */
export function addCollabPageLink(link: PageLinkView): void {
  const map = pageLinksMap();
  if (!map) return;
  map.doc?.transact(() => {
    if (link.source_component_id) {
      for (const [id, l] of map.entries()) {
        if (l.source_component_id === link.source_component_id) map.delete(id);
      }
    }
    map.set(link.id, { ...link });
  }, LOCAL_ORIGIN);
}

/** 更新连线（partial patch，整体覆写）。 */
export function updateCollabPageLink(id: string, patch: Partial<PageLinkView>): void {
  const map = pageLinksMap();
  const cur = map?.get(id);
  if (!map || !cur) return;
  map.doc?.transact(() => {
    map.set(id, { ...cur, ...patch });
  }, LOCAL_ORIGIN);
}

/** 删除连线。 */
export function removeCollabPageLink(id: string): void {
  const map = pageLinksMap();
  if (!map) return;
  map.doc?.transact(() => {
    map.delete(id);
  }, LOCAL_ORIGIN);
}

/** 订阅连线变化（返回解绑函数；无协作实例时返回 noop）。 */
export function observeCollabPageLinks(handler: () => void): () => void {
  const map = pageLinksMap();
  if (!map) return () => {};
  map.observe(handler);
  return () => map.unobserve(handler);
}

// ===== P3c ActionFlow 协作区（id → ActionFlowView）=====

function actionFlowsMap(): Y.Map<ActionFlowView> | null {
  if (!instance) return null;
  return instance.ydoc.getMap("actionFlows") as Y.Map<ActionFlowView>;
}

/** 读取 ActionFlow 快照（数组，id 稳定序；无协作实例时返回空列表）。 */
export function readCollabActionFlows(): ActionFlowView[] {
  const map = actionFlowsMap();
  if (!map) return [];
  return Array.from(map.values())
    .map((f) => JSON.parse(JSON.stringify(f)) as ActionFlowView)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** 新增/更新 ActionFlow（LOCAL_ORIGIN 事务，进客户端撤销栈）。 */
export function upsertCollabActionFlow(flow: ActionFlowView): void {
  const map = actionFlowsMap();
  if (!map) return;
  map.doc?.transact(() => {
    map.set(flow.id, JSON.parse(JSON.stringify(flow)));
  }, LOCAL_ORIGIN);
}

/** 删除 ActionFlow。 */
export function removeCollabActionFlow(id: string): void {
  const map = actionFlowsMap();
  if (!map) return;
  map.doc?.transact(() => {
    map.delete(id);
  }, LOCAL_ORIGIN);
}

/** 订阅 ActionFlow 变化（返回解绑函数；无协作实例时返回 noop）。 */
export function observeCollabActionFlows(handler: () => void): () => void {
  const map = actionFlowsMap();
  if (!map) return () => {};
  map.observe(handler);
  return () => map.unobserve(handler);
}
