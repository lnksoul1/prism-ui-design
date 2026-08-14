import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync, rmSync } from "node:fs";
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
    const tempClientDir = path.join(os.tmpdir(), "prism-client-writeback-test");
    rmSync(tempClientDir, { recursive: true, force: true });
    cpSync(path.resolve(__dirname, "..", "..", "client"), tempClientDir, { recursive: true });
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), "prism-server-test"),
        PRISM_CLIENT_DIR: tempClientDir,
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

      // P1.4: token changes broadcast a lightweight patch alongside the state
      ws.send(
        JSON.stringify({ type: "set_token", category: "colors", key: "color-primary", value: "#123456" })
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
      const tokenChange = wsMessages.find(
        (m) =>
          m.type === "change" &&
          (m.patch as { key?: string } | undefined)?.key === "color-primary"
      );
      assert.ok(tokenChange, "token change should carry a patch field");
      assert.equal((tokenChange.patch as { value?: string }).value, "#123456");

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

      const tplRes = await fetch(`${base}/api/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: "saas_landing" }),
      });
      const tpl = (await tplRes.json()) as { success: boolean; count: number; component_ids: string[] };
      assert.equal(tpl.success, true);
      assert.ok(tpl.count >= 5, "saas template should add multiple components");
      assert.ok(Array.isArray(tpl.component_ids));

      // Template management endpoints
      const saveTplRes = await fetch(`${base}/api/template/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "E2E Template" }),
      });
      const saveTpl = (await saveTplRes.json()) as { success: boolean; file: string };
      assert.equal(saveTpl.success, true);
      const listTplRes = await fetch(`${base}/api/templates`);
      const listTpl = (await listTplRes.json()) as { success: boolean; count: number; templates: Array<{ file: string }> };
      assert.equal(listTpl.success, true);
      assert.ok(listTpl.count >= 1);
      const loadTplRes = await fetch(`${base}/api/template/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: saveTpl.file }),
      });
      const loadTpl = (await loadTplRes.json()) as { success: boolean };
      assert.equal(loadTpl.success, true);

      // Version management endpoints
      const verRes = await fetch(`${base}/api/version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "v1" }),
      });
      const ver = (await verRes.json()) as { success: boolean; id: string };
      assert.equal(ver.success, true);
      const listVer = (await (await fetch(`${base}/api/versions`)).json()) as { success: boolean; count: number };
      assert.ok(listVer.count >= 1);
      const restoreRes = await fetch(`${base}/api/version/${ver.id}/restore`, { method: "POST" });
      const restoreVer = (await restoreRes.json()) as { success: boolean };
      assert.equal(restoreVer.success, true);

      // Comment endpoints
      const commentRes = await fetch(`${base}/api/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ component_id: comp.id, text: "review note", author: "tester" }),
      });
      const comment = (await commentRes.json()) as { success: boolean; comment: { id: string } };
      assert.equal(comment.success, true);
      const comments = (await (await fetch(`${base}/api/comments`)).json()) as { success: boolean; count: number };
      assert.equal(comments.count, 1);
      const delRes = await fetch(`${base}/api/comment/${comment.comment.id}`, { method: "DELETE" });
      const delComment = (await delRes.json()) as { success: boolean };
      assert.equal(delComment.success, true);

      // Prompt queue records an activity entry
      const promptRes = await fetch(`${base}/api/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "make it blue" }),
      });
      const promptPosted = (await promptRes.json()) as { success: boolean };
      assert.equal(promptPosted.success, true);
      const afterPrompt = (await (await fetch(`${base}/api/state`)).json()) as {
        activityLog: Array<{ action: string }>;
      };
      assert.ok(afterPrompt.activityLog.some((a) => a.action === "user_prompt"), "prompt should be logged");

      // Client UI import: opens the dashboard shell as a design page
      const clientRes = await fetch(`${base}/api/import-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const clientImport = (await clientRes.json()) as {
        success: boolean;
        imported: number;
        pageName: string;
        components: Array<{ type: string }>;
      };
      assert.equal(clientImport.success, true);
      assert.ok(clientImport.imported >= 5);
      assert.equal(clientImport.pageName, "Prism 客户端 UI");
      const clientState = (await (await fetch(`${base}/api/state`)).json()) as {
        projectName: string;
        tokens: { colors: Record<string, unknown> };
      };
      assert.equal(clientState.projectName, "Prism 客户端");
      assert.ok(Object.keys(clientState.tokens.colors).length > 0, "client import applies tokens");

      // PNG render: returns image/png when Playwright is available, else 501
      const playwrightAvailable = await isPlaywrightUsable();
      const pngRes = await fetch(`${base}/api/render?format=png`);
      if (playwrightAvailable) {
        assert.equal(pngRes.status, 200);
        assert.match(pngRes.headers.get("content-type") || "", /image\/png/);
        const buf = Buffer.from(await pngRes.arrayBuffer());
        assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "PNG magic bytes");
      } else {
        assert.equal(pngRes.status, 501);
      }

      // Capture the live dashboard itself as a reference image in the canvas
      const captureRes = await fetch(`${base}/api/capture-client`, { method: "POST" });
      if (playwrightAvailable) {
        const capture = (await captureRes.json()) as { success: boolean; file: string; component_id: string };
        assert.equal(capture.success, true);
        assert.ok(capture.file.endsWith(".png"));
        const preview = await fetch(`${base}/previews/${capture.file}`);
        assert.equal(preview.status, 200);
        const capturedState = (await (await fetch(`${base}/api/state`)).json()) as {
          components: Array<{ type: string }>;
        };
        assert.ok(capturedState.components.some((c) => c.type === "image"), "capture adds an image component");
      } else {
        assert.equal(captureRes.status, 501);
      }

      // One-click write-back: tokens -> temp style.css + design preview file
      const wbRes = await fetch(`${base}/api/writeback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });
      const wb = (await wbRes.json()) as {
        success: boolean;
        files: string[];
        backup?: string;
        token_map: Record<string, string>;
      };
      assert.equal(wb.success, true);
      assert.ok(wb.files.length >= 2, "tokens + preview files written");
      assert.ok(wb.backup, "backup created");
      assert.ok(Object.keys(wb.token_map).length > 0, "tokens mapped");
      const wbCss = readFileSync(path.join(tempClientDir, "style.css"), "utf-8");
      assert.match(wbCss, /--accent:/);
      assert.ok(readFileSync(path.join(tempClientDir, "design-writeback.html"), "utf-8").length > 500);

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
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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

async function isPlaywrightUsable(): Promise<boolean> {
  try {
    const { chromium } = (await import("playwright" as string)) as {
      chromium: { launch(): Promise<{ close(): Promise<void> }> };
    };
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

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
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
      let promptQueuedSeen: Record<string, unknown> = {};
      ws2.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (msg.type === "cursor") cursorSeen = msg;
        if (msg.type === "prompt_queued") promptQueuedSeen = msg;
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

      // 4) A queued prompt is broadcast to other clients
      ws1.send(JSON.stringify({ type: "prompt", prompt: "hello agent" }));
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (promptQueuedSeen.type) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, 5000);
      });
      assert.equal(promptQueuedSeen.type, "prompt_queued");
      assert.equal(promptQueuedSeen.prompt, "hello agent");

      ws1.close();
      ws2.close();
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
  "PRISM_AUTOIMPORT=off starts with a fresh single-page state",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_AUTOIMPORT: "off",
        PRISM_AUTOLOAD: "off",
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), "prism-server-test-fresh"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr?.on("data", (d) => (logs += d.toString()));
    try {
      await waitForHealth(`http://127.0.0.1:${port}/health`, 20000);
      const state = (await (await fetch(`http://127.0.0.1:${port}/api/state`)).json()) as {
        pages: unknown[];
        components: unknown[];
      };
      assert.equal(state.pages.length, 1, "auto-import should be skipped");
      assert.equal(state.components.length, 0);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
  "canvas endpoints: save, load, apply, and export a tldraw snapshot",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const tempClientDir = path.join(os.tmpdir(), "prism-canvas-server-test");
    rmSync(tempClientDir, { recursive: true, force: true });
    cpSync(path.resolve(__dirname, "..", "..", "client"), tempClientDir, { recursive: true });
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), "prism-canvas-server-state"),
        PRISM_CLIENT_DIR: tempClientDir,
        PRISM_AUTOIMPORT: "off",
        PRISM_AUTOLOAD: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;

    try {
      await waitForHealth(`${base}/health`, 20000);

      const state0 = (await (await fetch(`${base}/api/state`)).json()) as {
        currentPageId: string;
        revision: number;
      };
      const pageId = state0.currentPageId;

      // 1) No canvas doc yet
      const empty = (await (await fetch(`${base}/api/canvas?pageId=${pageId}`)).json()) as {
        success: boolean;
        doc: unknown;
      };
      assert.equal(empty.success, true);
      assert.equal(empty.doc, null);

      // 2) Save a hand-crafted tldraw snapshot
      const doc = {
        document: {
          schemaVersion: 1,
          store: {
            "shape:geo": {
              id: "shape:geo",
              typeName: "shape",
              type: "geo",
              x: 10,
              y: 20,
              props: {
                w: 300,
                h: 200,
                richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] },
              },
              meta: {},
            },
            "shape:txt": {
              id: "shape:txt",
              typeName: "shape",
              type: "text",
              x: 40,
              y: 240,
              props: {
                w: 200,
                h: 40,
                richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Welcome" }] }] },
              },
              meta: {},
            },
            "shape:arrow": {
              id: "shape:arrow",
              typeName: "shape",
              type: "arrow",
              x: 0,
              y: 0,
              props: {},
              meta: {},
            },
            "shape:btn": {
              id: "shape:btn",
              typeName: "shape",
              type: "geo",
              x: 0,
              y: 500,
              props: { w: 120, h: 40, richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Buy" }] }] } },
              meta: {
                prism: true,
                componentId: "comp_orig_1",
                componentType: "button",
                componentVariant: "primary",
                componentProps: { text: "Buy now" },
              },
            },
          },
        },
      };

      const saveRes = await fetch(`${base}/api/canvas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, doc }),
      });
      const saved = (await saveRes.json()) as { success: boolean; revision: number };
      assert.equal(saved.success, true);
      assert.ok(saved.revision > state0.revision, "canvas save should bump the revision");

      const loaded = (await (await fetch(`${base}/api/canvas?pageId=${pageId}`)).json()) as {
        success: boolean;
        doc: { document: { store: Record<string, unknown> } };
      };
      assert.equal(loaded.success, true);
      assert.ok(loaded.doc.document.store["shape:btn"], "saved doc should round-trip");

      // 3) Apply the drawing to the component model
      const applyRes = await fetch(`${base}/api/canvas/apply`, { method: "POST" });
      const applied = (await applyRes.json()) as { success: boolean; component_count: number; components: Array<{ type: string; id: string; props: Record<string, unknown> }> };
      assert.equal(applied.success, true);
      assert.equal(applied.component_count, 3, "arrow should be skipped");
      const button = applied.components.find((c) => c.type === "button");
      assert.ok(button, "meta component should be restored as a button");
      assert.equal(button?.id, "comp_orig_1");
      assert.deepEqual(button?.props, { text: "Buy now" });

      const afterState = (await (await fetch(`${base}/api/state`)).json()) as {
        components: Array<{ type: string }>;
        canvasDocs: Record<string, unknown>;
      };
      assert.equal(afterState.components.length, 3);
      assert.ok(afterState.canvasDocs[pageId], "state should expose canvasDocs");

      // 4) Write the drawing back to a real HTML file
      const exportRes = await fetch(`${base}/api/canvas/export`, { method: "POST" });
      const exported = (await exportRes.json()) as { success: boolean; file: string };
      assert.equal(exported.success, true);
      const html = readFileSync(path.join(tempClientDir, "canvas-page.html"), "utf-8");
      assert.match(html, /Hello/);
      assert.match(html, /Welcome/);
      assert.match(html, /Buy now/);

      // 5) Applying with no drawing returns 400
      const pageRes = await fetch(`${base}/api/page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Empty" }),
      });
      const newPage = (await pageRes.json()) as { page_id: string };
      await fetch(`${base}/api/page/${newPage.page_id}/switch`, { method: "POST" });
      const noDocRes = await fetch(`${base}/api/canvas/apply`, { method: "POST" });
      assert.equal(noDocRes.status, 400);

      const badSave = await fetch(`${base}/api/canvas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, doc: "not-an-object" }),
      });
      assert.equal(badSave.status, 400);

      // 6) AI draw queue endpoints
      const drawRes = await fetch(`${base}/api/canvas/draw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shapes: [
            { type: "rect", x: 0, y: 0, w: 240, h: 120, label: "Drawn box" },
            { type: "text", x: 20, y: 140, label: "AI note" },
          ],
        }),
      });
      const draw = (await drawRes.json()) as { success: boolean; queued: number };
      assert.equal(draw.success, true);
      assert.equal(draw.queued, 2);

      const withDraws = (await (await fetch(`${base}/api/state`)).json()) as {
        canvasDraws: Record<string, Array<{ id: string; label?: string }>>;
      };
      assert.equal(withDraws.canvasDraws[newPage.page_id].length, 2);

      const clearRes = await fetch(`${base}/api/canvas/draws/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: newPage.page_id }),
      });
      const cleared = (await clearRes.json()) as { success: boolean; cleared: boolean };
      assert.equal(cleared.success, true);
      assert.equal(cleared.cleared, true);
      const afterClear = (await (await fetch(`${base}/api/state`)).json()) as {
        canvasDraws: Record<string, unknown[]>;
      };
      assert.equal((afterClear.canvasDraws[newPage.page_id] || []).length, 0);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
      rmSync(tempClientDir, { recursive: true, force: true });
    }
  }
);

test(
  "Inspect endpoint exports single-component code (html/react/css) and 404s for unknown ids",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), "prism-server-inspect-test"),
        PRISM_AUTOIMPORT: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stdout?.on("data", (d) => (logs += d.toString()));
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;

    try {
      await waitForHealth(`${base}/health`, 20000);

      const compRes = await fetch(`${base}/api/component`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "hero", variant: "center", props: { title: "Inspect Me" } }),
      });
      const comp = (await compRes.json()) as { success: boolean; id: string };
      assert.equal(comp.success, true);

      const htmlRes = await fetch(`${base}/api/component/${comp.id}/code?format=html`);
      const html = (await htmlRes.json()) as { success: boolean; code: string; type: string };
      assert.equal(html.success, true);
      assert.equal(html.type, "hero");
      assert.ok(html.code.includes("Inspect Me"));
      assert.ok(html.code.includes("<section"));

      const reactRes = await fetch(`${base}/api/component/${comp.id}/code?format=react`);
      const react = (await reactRes.json()) as { success: boolean; code: string };
      assert.equal(react.success, true);
      assert.ok(react.code.includes("className="));
      assert.ok(!react.code.includes('class="'));

      const cssRes = await fetch(`${base}/api/component/${comp.id}/code?format=css`);
      const css = (await cssRes.json()) as { success: boolean; code: string };
      assert.equal(css.success, true);
      assert.ok(css.code.includes(":root"));

      const badFmt = await fetch(`${base}/api/component/${comp.id}/code?format=swift`);
      assert.equal(badFmt.status, 400);

      const missing = await fetch(`${base}/api/component/comp_nope_123/code?format=html`);
      assert.equal(missing.status, 404);

      // Library component code export (used by the design-library copy button)
      const libRes = await fetch(`${base}/api/library-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "hero", variant: "centered", props: { title: "Lib Hero" } }),
      });
      const lib = (await libRes.json()) as { success: boolean; code: string };
      assert.equal(lib.success, true);
      assert.ok(lib.code.includes("Lib Hero"));

      const badLib = await fetch(`${base}/api/library-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "not-a-component" }),
      });
      assert.equal(badLib.status, 400);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
  "design-system endpoints list 6 brand systems and apply token overrides",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), "prism-server-ds-test"),
        PRISM_AUTOIMPORT: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stdout?.on("data", (d) => (logs += d.toString()));
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;

    try {
      await waitForHealth(`${base}/health`, 20000);

      const listRes = await fetch(`${base}/api/design-systems`);
      const list = (await listRes.json()) as {
        success: boolean;
        systems: Array<{ id: string; swatch: string | null; preview: { primary: string | null } }>;
      };
      assert.equal(list.success, true);
      assert.equal(list.systems.length, 6);
      const linear = list.systems.find((s) => s.id === "linear");
      assert.ok(linear);
      assert.ok(linear.swatch);
      assert.ok(linear.preview.primary);

      const applyRes = await fetch(`${base}/api/design-system/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "linear" }),
      });
      const applied = (await applyRes.json()) as { success: boolean; guide_id: string; overrides: number };
      assert.equal(applied.success, true);
      assert.equal(applied.guide_id, "linear");
      assert.ok(applied.overrides > 0);

      const state = (await (await fetch(`${base}/api/state`)).json()) as {
        tokens: { colors: Record<string, { value: string }> };
        activityLog: Array<{ action: string }>;
      };
      assert.equal(state.tokens.colors["color-primary"].value, "#5E6AD2");
      assert.ok(state.activityLog.some((a) => a.action === "set_token"));

      const badRes = await fetch(`${base}/api/design-system/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "unknown-brand" }),
      });
      assert.equal(badRes.status, 400);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
  "page-link REST endpoints create, list, and remove play-mode links",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), "prism-server-links-test"),
        PRISM_AUTOIMPORT: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stdout?.on("data", (d) => (logs += d.toString()));
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;
    const headers = { "Content-Type": "application/json" };

    try {
      await waitForHealth(`${base}/health`, 20000);

      const fromState = (await (await fetch(`${base}/api/state`)).json()) as {
        currentPageId: string;
      };
      const fromPage = fromState.currentPageId;
      const pageRes = await fetch(`${base}/api/page`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Detail" }),
      });
      const page = (await pageRes.json()) as { page_id: string };

      const createRes = await fetch(`${base}/api/page-links`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from_page_id: fromPage,
          to_page_id: page.page_id,
          label: "Go Detail",
          source_component_id: "comp_btn_1",
        }),
      });
      const created = (await createRes.json()) as { success: boolean; link: { id: string; to_page_id: string } };
      assert.equal(created.success, true);
      assert.equal(created.link.to_page_id, page.page_id);

      const list = (await (await fetch(`${base}/api/page-links`)).json()) as {
        links: Array<{ id: string; source_component_id: string }>;
      };
      assert.equal(list.links.length, 1);
      assert.equal(list.links[0].source_component_id, "comp_btn_1");

      const delRes = await fetch(`${base}/api/page-links/${created.link.id}`, { method: "DELETE" });
      assert.equal(delRes.status, 200);
      const empty = (await (await fetch(`${base}/api/page-links`)).json()) as {
        links: unknown[];
      };
      assert.equal(empty.links.length, 0);

      const badRes = await fetch(`${base}/api/page-links`, {
        method: "POST",
        headers,
        body: JSON.stringify({ from_page_id: "page_nope", to_page_id: page.page_id }),
      });
      assert.equal(badRes.status, 400);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
  "duplicate-component REST endpoint clones a component",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), "prism-duplicate-server"),
        PRISM_AUTOIMPORT: "off",
        PRISM_AUTOLOAD: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;
    const headers = { "Content-Type": "application/json" };

    try {
      await waitForHealth(`${base}/health`, 20000);

      const addRes = await fetch(`${base}/api/component`, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "button", props: { text: "Go" } }),
      });
      const added = (await addRes.json()) as { id: string };

      const dupRes = await fetch(`${base}/api/component/${added.id}/duplicate`, { method: "POST" });
      assert.equal(dupRes.status, 200);
      const dup = (await dupRes.json()) as { success: boolean; id: string; type: string };
      assert.equal(dup.success, true);
      assert.equal(dup.type, "button");
      assert.notEqual(dup.id, added.id);

      const state = (await (await fetch(`${base}/api/state`)).json()) as {
        components: Array<{ id: string; props: { text: string } }>;
      };
      assert.equal(state.components.length, 2);
      assert.deepEqual(state.components.map((c) => c.props.text), ["Go", "Go"]);

      const missing = await fetch(`${base}/api/component/comp_nope/duplicate`, { method: "POST" });
      assert.equal(missing.status, 404);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
  "behavior REST endpoint binds and clears component interactions",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), `prism-behavior-server-${Date.now()}`),
        PRISM_AUTOIMPORT: "off",
        PRISM_AUTOLOAD: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;
    const headers = { "Content-Type": "application/json" };

    try {
      await waitForHealth(`${base}/health`, 20000);

      const addRes = await fetch(`${base}/api/component`, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "button", props: { text: "Buy" } }),
      });
      const added = (await addRes.json()) as { id: string };

      const setRes = await fetch(`${base}/api/component/${added.id}/behavior`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ behavior: { type: "toast", message: "已加入购物车" } }),
      });
      assert.equal(setRes.status, 200);
      const state = (await (await fetch(`${base}/api/state`)).json()) as {
        components: Array<{ id: string; behavior?: { type: string } }>;
      };
      assert.deepEqual(state.components[0].behavior, { type: "toast", message: "已加入购物车" });

      // null clears the behavior
      const clearRes = await fetch(`${base}/api/component/${added.id}/behavior`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ behavior: null }),
      });
      assert.equal(clearRes.status, 200);
      const after = (await (await fetch(`${base}/api/state`)).json()) as {
        components: Array<{ behavior?: unknown }>;
      };
      assert.equal(after.components[0].behavior, undefined);

      // malformed body and unknown component are rejected
      const badRes = await fetch(`${base}/api/component/${added.id}/behavior`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ behavior: "nope" }),
      });
      assert.equal(badRes.status, 400);

      const missingRes = await fetch(`${base}/api/component/comp_nope/behavior`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ behavior: { type: "toast", message: "x" } }),
      });
      assert.equal(missingRes.status, 404);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
  "template REST endpoints: catalog, component blocks add/replace, behavior templates",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), `prism-templates-server-${Date.now()}`),
        PRISM_AUTOIMPORT: "off",
        PRISM_AUTOLOAD: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;
    const headers = { "Content-Type": "application/json" };

    try {
      await waitForHealth(`${base}/health`, 20000);

      // Catalog listing
      const catRes = await fetch(`${base}/api/template-catalog`);
      assert.equal(catRes.status, 200);
      const cat = (await catRes.json()) as {
        component_templates: Array<{ id: string; type: string }>;
        behavior_templates: Array<{ id: string }>;
      };
      assert.ok(cat.component_templates.length >= 8);
      assert.ok(cat.behavior_templates.length >= 6);
      assert.ok(cat.component_templates.some((t) => t.id === "hero_split_cta"));
      assert.ok(cat.behavior_templates.some((t) => t.id === "toast_feedback"));

      // Add a component template (no target) -> new block
      const addRes = await fetch(`${base}/api/templates/component`, {
        method: "POST",
        headers,
        body: JSON.stringify({ template_id: "hero_split_cta" }),
      });
      assert.equal(addRes.status, 200);
      const added = (await addRes.json()) as { mode: string; component_id: string };
      assert.equal(added.mode, "added");
      assert.ok(added.component_id);
      let state = (await (await fetch(`${base}/api/state`)).json()) as {
        components: Array<{ id: string; type: string; variant?: string; layout?: { x: number }; behavior?: { type: string } }>;
      };
      assert.equal(state.components[0].type, "hero");

      // Replace an existing component in place (keeps layout position)
      const layoutRes = await fetch(`${base}/api/component/${added.component_id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ props: {}, layout: { x: 5, y: 6, w: 300, h: 200 } }),
      });
      assert.equal(layoutRes.status, 200);
      const repRes = await fetch(`${base}/api/templates/component`, {
        method: "POST",
        headers,
        body: JSON.stringify({ template_id: "signup_form", target_id: added.component_id }),
      });
      assert.equal(repRes.status, 200);
      const replaced = (await repRes.json()) as { mode: string };
      assert.equal(replaced.mode, "replaced");
      state = (await (await fetch(`${base}/api/state`)).json()) as {
        components: Array<{ id: string; type: string; layout?: { x: number }; behavior?: { type: string } }>;
      };
      const comp = state.components[0];
      assert.equal(comp.id, added.component_id);
      assert.equal(comp.type, "form");
      assert.deepEqual(comp.layout, { x: 5, y: 6, w: 300, h: 200 }, "layout preserved across replace");
      assert.equal(comp.behavior?.type, "submit", "preset behavior bound");

      // Raw palette replace endpoint
      const rawRes = await fetch(`${base}/api/component/${added.component_id}/replace`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ type: "stats", variant: "3col", props: { items: [{ value: "1", label: "a" }] } }),
      });
      assert.equal(rawRes.status, 200);
      state = (await (await fetch(`${base}/api/state`)).json()) as {
        components: Array<{ id: string; type: string; variant?: string; layout?: { x: number }; behavior?: { type: string } }>;
      };
      assert.equal(state.components[0].type, "stats");

      // Behavior template binds a preset interaction
      const behRes = await fetch(`${base}/api/templates/behavior`, {
        method: "POST",
        headers,
        body: JSON.stringify({ component_id: added.component_id, template_id: "toast_feedback" }),
      });
      assert.equal(behRes.status, 200);
      const beh = (await behRes.json()) as { behavior: { type: string; message: string } };
      assert.deepEqual(beh.behavior, { type: "toast", message: "操作成功！" });
      state = (await (await fetch(`${base}/api/state`)).json()) as {
        components: Array<{ id: string; type: string; variant?: string; layout?: { x: number }; behavior?: { type: string } }>;
      };
      assert.equal(state.components[0].behavior?.type, "toast");

      // Unknown template ids are rejected
      const badTpl = await fetch(`${base}/api/templates/component`, {
        method: "POST",
        headers,
        body: JSON.stringify({ template_id: "nope" }),
      });
      assert.equal(badTpl.status, 400);
      const badBeh = await fetch(`${base}/api/templates/behavior`, {
        method: "POST",
        headers,
        body: JSON.stringify({ component_id: added.component_id, template_id: "nope" }),
      });
      assert.equal(badBeh.status, 400);
      const missingComp = await fetch(`${base}/api/templates/behavior`, {
        method: "POST",
        headers,
        body: JSON.stringify({ component_id: "comp_nope", template_id: "toast_feedback" }),
      });
      assert.equal(missingComp.status, 400);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
  "align and z-order REST endpoints adjust freeform layouts",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), `prism-align-server-${Date.now()}`),
        PRISM_AUTOIMPORT: "off",
        PRISM_AUTOLOAD: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;
    const headers = { "Content-Type": "application/json" };

    try {
      await waitForHealth(`${base}/health`, 20000);

      const ids: string[] = [];
      for (const type of ["button", "card", "image"]) {
        const res = await fetch(`${base}/api/component`, {
          method: "POST",
          headers,
          body: JSON.stringify({ type, props: {} }),
        });
        const data = (await res.json()) as { id: string };
        ids.push(data.id);
      }
      // Give each component a layout via update_component
      const layouts = [
        { x: 10, y: 10, w: 100, h: 40 },
        { x: 200, y: 60, w: 120, h: 60 },
        { x: 400, y: 20, w: 80, h: 30 },
      ];
      for (let i = 0; i < ids.length; i++) {
        await fetch(`${base}/api/component/${ids[i]}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ props: {}, layout: layouts[i] }),
        });
      }

      const alignRes = await fetch(`${base}/api/align`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ids, mode: "left" }),
      });
      assert.equal(alignRes.status, 200);
      const state = (await (await fetch(`${base}/api/state`)).json()) as {
        components: Array<{ id: string; layout: { x: number } }>;
      };
      for (const comp of state.components) {
        assert.equal(comp.layout.x, 10, "all components align left");
      }

      const zRes = await fetch(`${base}/api/component/${ids[0]}/z-order`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mode: "front" }),
      });
      assert.equal(zRes.status, 200);
      const after = (await (await fetch(`${base}/api/state`)).json()) as {
        components: Array<{ id: string }>;
      };
      assert.equal(after.components[after.components.length - 1].id, ids[0], "first component sent to front");

      const badAlign = await fetch(`${base}/api/align`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ids: [ids[0]], mode: "left" }),
      });
      assert.equal(badAlign.status, 400);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
  "import → adjust → one-click apply pipeline writes products with rollback",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const productTmp = path.join(os.tmpdir(), `prism-products-${Date.now()}`);
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), `prism-pipeline-${Date.now()}`),
        PRISM_PRODUCT_DIR: productTmp,
        PRISM_AUTOIMPORT: "off",
        PRISM_AUTOLOAD: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;
    const headers = { "Content-Type": "application/json" };

    try {
      await waitForHealth(`${base}/health`, 20000);

      // 1) Import a pasted HTML page of the user's product
      const importRes = await fetch(`${base}/api/import/product`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          html: `<html><body><nav><a>我的品牌</a></nav><main><h1>欢迎</h1><button>开始</button></main><footer>© 2026</footer></body></html>`,
        }),
      });
      assert.equal(importRes.status, 200);
      const imported = (await importRes.json()) as {
        success: boolean;
        page_id: string;
        source: string;
        imported: number;
      };
      assert.equal(imported.success, true);
      assert.ok(imported.imported >= 2, "extracted components from the pasted page");
      assert.equal(imported.source, "Pasted HTML");

      // Import provenance is recorded
      const importsRes = (await (await fetch(`${base}/api/imports`)).json()) as {
        imports: Record<string, { source: string; component_count: number }>;
      };
      assert.ok(importsRes.imports[imported.page_id]);
      assert.equal(importsRes.imports[imported.page_id].source, "Pasted HTML");

      // 2) Adjust something (a token), then one-click apply
      const adjustRes = await fetch(`${base}/api/token`, {
        method: "POST",
        headers,
        body: JSON.stringify({ category: "colors", key: "color-primary", value: "#FF5500" }),
      });
      assert.equal(adjustRes.status, 200);

      const applyRes = await fetch(`${base}/api/apply`, { method: "POST" });
      assert.equal(applyRes.status, 200);
      const applied = (await applyRes.json()) as {
        success: boolean;
        files: Array<{ file: string; size: number }>;
        backup: string | null;
      };
      assert.equal(applied.success, true);
      assert.equal(applied.files.length, 2);
      for (const f of applied.files) {
        assert.ok(f.size > 0);
      }
      const { existsSync } = await import("fs");
      assert.ok(existsSync(applied.files[0].file), "adjusted page written to product dir");

      // 3) Apply again → a backup is created; rollback restores it
      await fetch(`${base}/api/apply`, { method: "POST" });
      const rollRes = await fetch(`${base}/api/apply/rollback`, { method: "POST" });
      const rolled = (await rollRes.json()) as { success: boolean; restored: string | null };
      assert.equal(rolled.success, true);
      assert.ok(rolled.restored && existsSync(rolled.restored));
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
  "LLM channel config endpoints save, mask, and keep the key secret",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), `prism-llm-server-${Date.now()}`),
        PRISM_AUTOIMPORT: "off",
        PRISM_AUTOLOAD: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;
    const headers = { "Content-Type": "application/json" };

    try {
      await waitForHealth(`${base}/health`, 20000);

      // Not configured initially; generation is refused with a readable error
      const initial = (await (await fetch(`${base}/api/llm/config`)).json()) as {
        configured: boolean;
      };
      assert.equal(initial.configured, false);

      const noCfg = await fetch(`${base}/api/llm/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: "做一个首页" }),
      });
      assert.equal(noCfg.status, 400);

      // Save a config with an unreachable base URL → generation fails loudly
      const put = await fetch(`${base}/api/llm/config`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          provider: "openai",
          apiKey: "sk-test-1234567890",
          baseUrl: "http://127.0.0.1:1/v1",
          model: "gpt-4o-mini",
        }),
      });
      assert.equal(put.status, 200);
      const saved = (await put.json()) as { configured: boolean; masked_key: string };
      assert.equal(saved.configured, true);
      assert.equal(saved.masked_key, "sk-t…7890");

      // The raw key must never come back over the API
      const after = await (await fetch(`${base}/api/llm/config`)).json();
      const raw = JSON.stringify(after);
      assert.ok(!raw.includes("sk-test-1234567890"), "raw key must stay secret");
      assert.ok(raw.includes("sk-t…7890"), "masked key should be exposed");

      // Generation against the unreachable endpoint → 502 with a readable error
      const gen = await fetch(`${base}/api/llm/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: "做一个宠物店首页" }),
      });
      assert.equal(gen.status, 502);
      const genErr = (await gen.json()) as { error: string };
      assert.ok(genErr.error.length > 0);

      // An empty apiKey on PUT keeps the previously stored key
      const keep = await fetch(`${base}/api/llm/config`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ provider: "anthropic", model: "claude-sonnet-4-5" }),
      });
      assert.equal(keep.status, 200);
      const kept = (await (await fetch(`${base}/api/llm/config`)).json()) as {
        provider: string;
        masked_key: string;
      };
      assert.equal(kept.provider, "anthropic");
      assert.equal(kept.masked_key, "sk-t…7890", "key survives provider/model changes");
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
  "built-in prompt executor reacts to instructions over REST and WS",
  { timeout: 60000 },
  async () => {
    const port = await getFreePort();
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        DASHBOARD_PORT: String(port),
        PRISM_PROJECT_DIR: path.join(os.tmpdir(), "prism-prompt-exec-server"),
        PRISM_AUTOIMPORT: "off",
        PRISM_AUTOLOAD: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr?.on("data", (d) => (logs += d.toString()));
    const base = `http://127.0.0.1:${port}`;

    try {
      await waitForHealth(`${base}/health`, 20000);

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const wsMessages: Array<Record<string, unknown>> = [];
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        wsMessages.push(msg);
      });
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });

      // A matchable instruction executes locally and broadcasts a receipt
      const promptRes = await fetch(`${base}/api/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "把主色改成蓝色" }),
      });
      assert.equal(promptRes.status, 200);
      const promptResult = (await promptRes.json()) as {
        success: boolean;
        executed: boolean;
        action: string;
        summary: string;
        suggestions: string[];
      };
      assert.equal(promptResult.success, true);
      assert.equal(promptResult.executed, true);
      assert.equal(promptResult.action, "set_primary_color");
      assert.match(promptResult.summary, /主色/);

      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (wsMessages.some((m) => m.type === "prompt_executed")) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, 6000);
      });
      const executedMsg = wsMessages.find((m) => m.type === "prompt_executed") as Record<string, unknown>;
      assert.ok(executedMsg, "prompt_executed broadcast missing");
      assert.match(String(executedMsg.summary), /主色/);

      const state = (await (await fetch(`${base}/api/state`)).json()) as {
        tokens: { colors: Record<string, { value: string }> };
        activityLog: Array<{ action: string; detail: string }>;
      };
      assert.equal(state.tokens.colors["color-primary"].value, "#3B82F6");
      assert.ok(
        state.activityLog.some((a) => a.action === "prompt_executed"),
        "prompt_executed should be logged"
      );

      // An unmatched instruction stays queued for the agent (no receipt)
      // but the REST response carries example suggestions for the user.
      const unmatchedRes = await fetch(`${base}/api/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "hello agent please refine" }),
      });
      assert.equal(unmatchedRes.status, 200);
      const unmatched = (await unmatchedRes.json()) as {
        executed: boolean;
        suggestions: string[];
      };
      assert.equal(unmatched.executed, false);
      assert.ok(Array.isArray(unmatched.suggestions) && unmatched.suggestions.length > 0);
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      const executedCount = wsMessages.filter((m) => m.type === "prompt_executed").length;
      assert.equal(executedCount, 1, "unmatched prompt must not be executed");

      // WS prompts get an immediate prompt_result acknowledgment
      ws.send(JSON.stringify({ type: "prompt", prompt: "字太小了，大一点" }));
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (wsMessages.some((m) => m.type === "prompt_result")) {
            clearInterval(timer);
            resolve();
          }
        }, 20);
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, 6000);
      });
      const wsResult = wsMessages.find((m) => m.type === "prompt_result") as
        | Record<string, unknown>
        | undefined;
      assert.ok(wsResult, "prompt_result broadcast missing for WS prompt");
      assert.equal(wsResult.executed, true);

      // The plain-language explanation endpoint is read-only and descriptive
      const explainRes = await fetch(`${base}/api/explain`);
      assert.equal(explainRes.status, 200);
      const explain = (await explainRes.json()) as {
        success: boolean;
        summary: string;
        facts: string[];
        suggestions: Array<{ phrase: string }>;
      };
      assert.equal(explain.success, true);
      assert.ok(explain.summary.length > 0);
      assert.ok(explain.facts.length >= 3);
      assert.ok(explain.suggestions.length > 0);

      ws.close();
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n--- server logs ---\n${logs}`,
        { cause: error }
      );
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
