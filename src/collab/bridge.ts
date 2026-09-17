/**
 * M3 协同双向桥:
 *   服务端写路径（REST/AI/MCP/undo/版本恢复）--reconcile--> Y.Doc（origin=SERVER_ORIGIN）
 *   Y.Doc（远端客户端写路径）--observe--> stateStore.applyCollabEntries（无历史投影）
 * 防回环: applyingFromYDoc 标志 + SERVER_ORIGIN 事务来源检查双重保险。
 */
import type * as Y from "yjs";
import { stateStore } from "../state.js";
import { flattenPages, type FlatEntry } from "./flatten.js";

export const SERVER_ORIGIN = "prism-server";
const COMPONENTS_KEY = "components";
const INDEX_KEY = "index";

interface IndexValue {
  parentId: string | null;
  pageId: string;
  index: number;
}

let applyingFromYDoc = false;
let currentDoc: Y.Doc | null = null;
let stateChangeHandler: (() => void) | null = null;

export function reconcileStateIntoYDoc(doc: Y.Doc): void {
  const components = doc.getMap<Record<string, unknown>>(COMPONENTS_KEY);
  const index = doc.getMap<IndexValue>(INDEX_KEY);
  const entries = flattenPages(stateStore.getState().pages);
  doc.transact(() => {
    for (const [id, e] of entries) {
      const nextNode = JSON.stringify(e.node);
      const prevNode = components.get(id);
      if (prevNode === undefined || JSON.stringify(prevNode) !== nextNode) {
        components.set(id, JSON.parse(nextNode));
      }
      const nextIdx = JSON.stringify({ parentId: e.parentId, pageId: e.pageId, index: e.index });
      const prevIdx = index.get(id);
      if (prevIdx === undefined || JSON.stringify(prevIdx) !== nextIdx) {
        index.set(id, JSON.parse(nextIdx));
      }
    }
    for (const id of Array.from(components.keys())) {
      if (!entries.has(id)) {
        components.delete(id);
        index.delete(id);
      }
    }
  }, SERVER_ORIGIN);
}

export function readCollabEntries(doc: Y.Doc): Map<string, FlatEntry> {
  const components = doc.getMap<Record<string, unknown>>(COMPONENTS_KEY);
  const index = doc.getMap<IndexValue>(INDEX_KEY);
  const out = new Map<string, FlatEntry>();
  for (const [id, raw] of components.entries()) {
    const idx = index.get(id);
    if (!idx) continue;
    out.set(id, {
      node: raw as unknown as FlatEntry["node"],
      parentId: idx.parentId,
      pageId: idx.pageId,
      index: idx.index,
    });
  }
  return out;
}

export function attachCollabBridge(doc: Y.Doc): void {
  if (currentDoc === doc) return;
  if (stateChangeHandler) stateStore.off("change", stateChangeHandler);
  currentDoc = doc;

  const components = doc.getMap(COMPONENTS_KEY);
  const index = doc.getMap(INDEX_KEY);

  // 服务端状态 → Y.Doc
  stateChangeHandler = () => {
    if (!applyingFromYDoc) reconcileStateIntoYDoc(doc);
  };
  stateStore.on("change", stateChangeHandler);

  // Y.Doc → 服务端状态（server-origin 事务来自 reconcile 本身，跳过）
  const onYDocChange = (): void => {
    if (applyingFromYDoc) return;
    applyingFromYDoc = true;
    try {
      const entries = readCollabEntries(doc);
      const existing = flattenPages(stateStore.getState().pages);
      // index 参与比较: 客户端图层面板的 z 序拖拽只改写 index 条目，
      // 变化须进入 changed 才能触发 applyCollabEntries 的兄弟序列重排
      const sameEntry = (a: FlatEntry | undefined, b: FlatEntry): boolean =>
        !!a &&
        a.parentId === b.parentId &&
        a.pageId === b.pageId &&
        a.index === b.index &&
        JSON.stringify({ ...a.node, children: [] }) === JSON.stringify({ ...b.node, children: [] });
      const changed: Array<{ id: string } & FlatEntry> = [];
      for (const [id, e] of entries) {
        if (!sameEntry(existing.get(id), e)) changed.push({ id, ...e });
      }
      const removed = Array.from(existing.keys()).filter((id) => !entries.has(id));
      if (changed.length > 0 || removed.length > 0) {
        stateStore.applyCollabEntries(
          changed,
          removed,
          new Map(index.entries() as Iterable<[string, IndexValue]>)
        );
      }
    } finally {
      applyingFromYDoc = false;
    }
  };
  components.observeDeep((_events, tr) => {
    if (tr.origin !== SERVER_ORIGIN) onYDocChange();
  });
  index.observeDeep((_events, tr) => {
    if (tr.origin !== SERVER_ORIGIN) onYDocChange();
  });

  // 初始全量对齐（供后加入的客户端 sync step 1 拉取）
  reconcileStateIntoYDoc(doc);
}
