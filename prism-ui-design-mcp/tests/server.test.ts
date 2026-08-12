import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, "..", "..", "dist", "index.js");

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("could not allocate a free port")));
      }
    });
  });
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not become healthy at ${url}`);
}

test(
  "HTTP init -> component -> export chain works and WS broadcasts undo state + shadow tokens",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), "prism-server-test"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stdout?.on("data", (d) => (logs += d.toString()));
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;

    try {
      await waitForHealth(`${base}/health`, 20000);

      const wsMessages: Array<Record<string, unknown>> = [];
      let resolveInit: (msg: Record<string, unknown>) => void = () => {};
      let resolveChange: (msg: Record<string, unknown>) => void = () => {};
      const initPromise = new Promise<Record<string, unknown>>((resolve) => {
        resolveInit = resolve;
      });
      const changePromise = new Promise<Record<string, unknown>>((resolve) => {
        resolveChange = resolve;
      });

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        wsMessages.push(msg);
        if (msg.type === "init") resolveInit(msg);
        if (msg.type === "change") {
          const state = msg.state as Record<string, unknown>;
          const shadows = (state.tokens as Record<string, unknown>)?.shadows as
            | Record<string, unknown>
            | undefined;
          if (
            typeof state?.canUndo === "boolean" &&
            shadows &&
            Object.keys(shadows).length > 0
          ) {
            resolveChange(msg);
          }
        }
      });
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });

      const initMsg = await Promise.race([
        initPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("no init WS message received")), 10000)
        ),
      ]);
      const initState = initMsg.state as Record<string, unknown>;
      assert.ok((initState.tokens as Record<string, unknown>).colors);

      const initRes = await fetch(`${base}/api/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_name: "Integration", style: "bold", base_color: "#2563EB" }),
      });
      const init = (await initRes.json()) as { success: boolean; token_count: number };
      assert.equal(init.success, true);
      assert.ok(init.token_count >= 52, `expected >=52 tokens, got ${init.token_count}`);

      const stateRes = await fetch(`${base}/api/state`);
      const state = (await stateRes.json()) as Record<string, unknown>;
      assert.equal(typeof state.canUndo, "boolean");
      assert.equal(typeof state.canRedo, "boolean");
      const shadows = (state.tokens as Record<string, Record<string, { value: string }>>).shadows;
      assert.ok(shadows["shadow-md"], "shadow tokens missing from /api/state");

      const compRes = await fetch(`${base}/api/component`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "hero", variant: "center", props: { title: "Hello Prism" } }),
      });
      const comp = (await compRes.json()) as { success: boolean; id: string };
      assert.equal(comp.success, true);
      assert.ok(comp.id.startsWith("comp_"));

      const exportRes = await fetch(`${base}/api/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "html" }),
      });
      const exported = (await exportRes.json()) as { success: boolean; code: string };
      assert.equal(exported.success, true);
      assert.ok(exported.code.includes("Hello Prism"), "exported HTML missing component content");

      // New endpoints: render, projects, and validated token updates
      const renderRes = await fetch(`${base}/api/render`);
      const rendered = (await renderRes.json()) as { success: boolean; code_length: number; html: string };
      assert.equal(rendered.success, true);
      assert.ok(rendered.code_length > 500, "render should produce substantial HTML");
      assert.ok(rendered.html.includes("Hello Prism"), "render HTML missing component content");

      const projectsRes = await fetch(`${base}/api/projects`);
      const projects = (await projectsRes.json()) as { success: boolean; count: number };
      assert.equal(projects.success, true);
      assert.equal(typeof projects.count, "number");

      const badTokenRes = await fetch(`${base}/api/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "bogus", key: "k", value: "v" }),
      });
      assert.equal(badTokenRes.status, 400, "invalid token category should be rejected");

      const change = await Promise.race([
        changePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("no change WS message with undo state + shadows")), 10000)
        ),
      ]);
      assert.equal(change.type, "change");
      const changeState = change.state as Record<string, unknown>;
      assert.equal(typeof changeState.canUndo, "boolean");
      assert.ok(
        (changeState.tokens as Record<string, Record<string, unknown>>).shadows["shadow-lg"],
        "broadcast state missing shadow tokens"
      );

      ws.close();
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`);
    } finally {
      child.kill();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 3000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
);

test(
  "presence broadcasts online client count over WebSocket",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), "prism-server-test-presence"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;

    try {
      await waitForHealth(`${base}/health`, 20000);

      const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise<void>((resolve, reject) => {
        ws1.once("open", resolve);
        ws1.once("error", reject);
      });

      let resolvePresence: (msg: Record<string, unknown>) => void = () => {};
      const presencePromise = new Promise<Record<string, unknown>>((resolve) => {
        resolvePresence = resolve;
      });

      const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws2.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (msg.type === "presence" && msg.count === 2) resolvePresence(msg);
      });
      await new Promise<void>((resolve, reject) => {
        ws2.once("open", resolve);
        ws2.once("error", reject);
      });

      const presence = await Promise.race([
        presencePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("no presence broadcast with count 2 received")), 10000)
        ),
      ]);
      assert.equal(presence.count, 2);
      assert.ok(Array.isArray(presence.clients));
      assert.equal((presence.clients as unknown[]).length, 2);

      ws1.close();
      ws2.close();
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`);
    } finally {
      child.kill();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 3000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
);

test(
  "live cursors and optimistic-concurrency conflict detection",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), "prism-server-test-collab"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;

    try {
      await waitForHealth(`${base}/health`, 20000);

      const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const ws1Messages: Array<Record<string, unknown>> = [];
      ws1.on("message", (data) => ws1Messages.push(JSON.parse(data.toString())));
      await new Promise<void>((resolve, reject) => {
        ws1.once("open", resolve);
        ws1.once("error", reject);
      });

      // Wait for ws1 init to learn the initial revision
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          const init = ws1Messages.find((m) => m.type === "init");
          if (init) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, 5000);
      });
      const initMsg = ws1Messages.find((m) => m.type === "init") as Record<string, unknown>;
      const initState = initMsg.state as Record<string, unknown>;
      const initialRevision = initState.revision as number;
      const initialComponents = (initState.components as unknown[]).length;

      const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      let cursorSeen: Record<string, unknown> = {};
      ws2.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (msg.type === "cursor") cursorSeen = msg;
      });
      await new Promise<void>((resolve, reject) => {
        ws2.once("open", resolve);
        ws2.once("error", reject);
      });

      // 1) Cursor broadcast reaches the other client
      ws1.send(JSON.stringify({ type: "cursor", x: 120, y: 240 }));
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (cursorSeen) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, 5000);
      });
      assert.equal(cursorSeen.type, "cursor");
      assert.equal(cursorSeen.x, 120);
      assert.equal(cursorSeen.y, 240);
      assert.equal(typeof cursorSeen.client_id, "string");

      // 2) A mutation with the current revision is accepted
      ws2.send(JSON.stringify({ type: "add_component", component_type: "card", props: { title: "x" }, base_revision: initialRevision }));
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          const state = ws1Messages.find((m) => m.type === "change")?.state as Record<string, unknown> | undefined;
          if (state && ((state.components as unknown[])?.length ?? 0) > 0) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, 5000);
      });
      const afterState = await fetch(`${base}/api/state`).then((r) => r.json()) as Record<string, unknown>;
      assert.equal((afterState.components as unknown[]).length, initialComponents + 1);
      assert.ok((afterState.revision as number) > initialRevision);

      // 3) A mutation with a stale revision is rejected with a conflict
      ws1.send(JSON.stringify({ type: "add_component", component_type: "hero", props: {}, base_revision: initialRevision }));
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (ws1Messages.some((m) => m.type === "conflict")) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, 5000);
      });
      const conflictSeen = ws1Messages.find((m) => m.type === "conflict") as Record<string, unknown>;
      assert.equal(conflictSeen.type, "conflict");
      assert.equal(conflictSeen.current_revision, afterState.revision);
      const unchanged = await fetch(`${base}/api/state`).then((r) => r.json()) as Record<string, unknown>;
      assert.equal((unchanged.components as unknown[]).length, initialComponents + 1, "stale mutation must not apply");
      assert.equal(unchanged.revision, afterState.revision, "revision must not change on conflict");

      ws1.close();
      ws2.close();
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`);
    } finally {
      child.kill();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 3000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
);
