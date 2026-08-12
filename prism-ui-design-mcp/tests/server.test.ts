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
