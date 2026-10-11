import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { CommentView } from "../types";

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
    [ydoc.getMap("components"), ydoc.getMap("index"), ydoc.getMap("tokens"), ydoc.getMap("comments")],
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
