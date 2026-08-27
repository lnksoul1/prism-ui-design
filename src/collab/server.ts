/**
 * M3 协同: /collab 房间服务。等价 y-websocket 服务端的最小实现——
 * y-protocols sync（消息类型 0）+ awareness（消息类型 1）中继。
 * 过期 awareness 状态由 Awareness 内置 30s 超时自动清理（M3 不做连接级精细回收）。
 */
import type { WebSocket } from "ws";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export interface CollabRoom {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Set<WebSocket>;
}

export function createCollabRoom(doc: Y.Doc): CollabRoom {
  const awareness = new awarenessProtocol.Awareness(doc);
  const connections = new Set<WebSocket>();

  // 文档更新：转发给除来源外的所有连接（origin === 发起该事务的 conn）
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    for (const conn of connections) {
      if (conn !== origin && conn.readyState === conn.OPEN) conn.send(message);
    }
  });

  // awareness 状态变更（光标/在线名单）：广播给所有连接
  awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
    const changedClients = added.concat(updated, removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
    const message = encoding.toUint8Array(encoder);
    for (const conn of connections) {
      if (conn.readyState === conn.OPEN) conn.send(message);
    }
  });

  return { doc, awareness, connections };
}

export function attachCollabConnection(room: CollabRoom, conn: WebSocket): void {
  conn.binaryType = "arraybuffer";
  room.connections.add(conn);

  // 初次连接：下发 sync step 1（请求客户端状态）+ 全量 awareness
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, room.doc);
  conn.send(encoding.toUint8Array(syncEncoder));

  const awarenessEncoder = encoding.createEncoder();
  encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    awarenessEncoder,
    awarenessProtocol.encodeAwarenessUpdate(room.awareness, [room.awareness.clientID])
  );
  conn.send(encoding.toUint8Array(awarenessEncoder));

  conn.on("message", (data: ArrayBuffer) => {
    try {
      const message = new Uint8Array(data);
      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case MESSAGE_SYNC: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn);
          if (encoding.length(encoder) > 1) conn.send(encoding.toUint8Array(encoder));
          break;
        }
        case MESSAGE_AWARENESS: {
          awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn);
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error("[collab] message error:", err);
    }
  });

  const cleanup = (): void => {
    room.connections.delete(conn);
  };
  conn.on("close", cleanup);
  conn.on("error", cleanup);
}
