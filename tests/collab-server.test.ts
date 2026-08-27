// tests/collab-server.test.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import { createCollabRoom, attachCollabConnection } from "../src/collab/server.js";

const MESSAGE_SYNC = 0;

/** 测试用最小同步客户端（等价 y-websocket 客户端的 sync 部分）。 */
class MiniSyncClient {
  readonly doc = new Y.Doc();

  private constructor(private readonly ws: WebSocket) {
    this.ws.binaryType = "arraybuffer";
    this.ws.on("message", (data) => this.onMessage(data as ArrayBuffer));
    // 本地更新转发给服务端（y-websocket 客户端的 update handler；origin === this 表示来自网络的更新，不回发）
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.ws.send(encoding.toUint8Array(encoder));
    });
  }

  static async connect(port: number): Promise<MiniSyncClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.binaryType = "arraybuffer";
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    return new MiniSyncClient(ws);
  }

  /** 发起 sync step 1，请求服务端全量状态。 */
  start(): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this.ws.send(encoding.toUint8Array(encoder));
  }

  /** 断开连接（释放事件循环句柄，避免 node --test 挂起）。 */
  close(): void {
    this.ws.terminate();
  }

  private onMessage(data: ArrayBuffer): void {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const type = decoding.readVarUint(decoder);
    if (type !== MESSAGE_SYNC) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
    if (encoding.length(encoder) > 1) this.ws.send(encoding.toUint8Array(encoder));
  }
}

async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("collab server", () => {
  test("two clients sync map updates through the room", async () => {
    const room = createCollabRoom(new Y.Doc());
    const httpServer = http.createServer();
    const wss = new WebSocketServer({ server: httpServer });
    wss.on("connection", (ws: WebSocket) => attachCollabConnection(room, ws));
    const port = await new Promise<number>((resolve) =>
      httpServer.listen(0, "127.0.0.1", () => resolve((httpServer.address() as { port: number }).port))
    );
    const clients: MiniSyncClient[] = [];
    try {
      const a = await MiniSyncClient.connect(port);
      clients.push(a);
      a.start();
      const b = await MiniSyncClient.connect(port);
      clients.push(b);
      b.start();

      a.doc.transact(() => {
        a.doc.getMap("components").set("c1", { text: "hello" });
      });
      await waitFor(() => b.doc.getMap("components").get("c1") !== undefined);
      assert.deepEqual(b.doc.getMap("components").get("c1"), { text: "hello" });

      // 反向：B 的写也能到 A
      b.doc.transact(() => {
        b.doc.getMap("components").set("c2", { text: "world" });
      });
      await waitFor(() => a.doc.getMap("components").get("c2") !== undefined);
      assert.deepEqual(a.doc.getMap("components").get("c2"), { text: "world" });
    } finally {
      // 清理：销毁 awareness（其内部 setInterval 会阻止进程退出）并断开客户端
      room.awareness.destroy();
      for (const c of clients) c.close();
      wss.close();
      httpServer.close();
    }
  });

  test("late joiner receives existing room state via sync step 1", async () => {
    const room = createCollabRoom(new Y.Doc());
    room.doc.getMap("components").set("seed", { v: 1 });
    const httpServer = http.createServer();
    const wss = new WebSocketServer({ server: httpServer });
    wss.on("connection", (ws: WebSocket) => attachCollabConnection(room, ws));
    const port = await new Promise<number>((resolve) =>
      httpServer.listen(0, "127.0.0.1", () => resolve((httpServer.address() as { port: number }).port))
    );
    const clients: MiniSyncClient[] = [];
    try {
      const late = await MiniSyncClient.connect(port);
      clients.push(late);
      late.start();
      await waitFor(() => late.doc.getMap("components").get("seed") !== undefined);
      assert.deepEqual(late.doc.getMap("components").get("seed"), { v: 1 });
    } finally {
      room.awareness.destroy();
      for (const c of clients) c.close();
      wss.close();
      httpServer.close();
    }
  });
});
