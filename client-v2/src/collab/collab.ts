import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

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
  const undoManager = new Y.UndoManager([ydoc.getMap("components"), ydoc.getMap("index"), ydoc.getMap("tokens")], {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
  });
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
