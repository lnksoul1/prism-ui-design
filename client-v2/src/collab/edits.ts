// client-v2/src/collab/edits.ts
import { getCollab, LOCAL_ORIGIN } from "./collab";

type Draft = Record<string, unknown>;

/**
 * M3 协同客户端写路径: 读-改-写单个组件的 ydoc 条目。
 * 整个替换在事务（origin=LOCAL_ORIGIN）中执行，被 Y.UndoManager 跟踪，
 * 离线时本地生效、重连后自动同步（Yjs 离线优先）。
 */
export function editComponent(id: string, mutator: (draft: Draft) => void): void {
  const { ydoc } = getCollab();
  const components = ydoc.getMap<Draft>("components");
  const current = components.get(id);
  if (!current) throw new Error(`组件不在协同文档中: ${id}`);
  const draft = structuredClone(current) as Draft;
  mutator(draft);
  ydoc.transact(() => components.set(id, draft), LOCAL_ORIGIN);
}

/** 轨道1: 撤销自己的协同编辑（不影响协作者的操作）。 */
export function undo(): boolean {
  const um = getCollab().undoManager;
  if (um.undoStack.length === 0) return false;
  um.undo();
  return true;
}

export function redo(): boolean {
  const um = getCollab().undoManager;
  if (um.redoStack.length === 0) return false;
  um.redo();
  return true;
}
