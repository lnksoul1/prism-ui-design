import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import type { Server } from "node:http";
import { stateStore } from "../src/state.js";
import { registerComponentsRoutes } from "../src/routes/components.js";
import { errorHandler } from "../src/routes/shared.js";

// M4 page link transitions: model + REST route tests. No need for the full
// server stack — mount the components router on a bare express app bound to
// an ephemeral port and drive it with fetch (same pattern as
// responsive-routes.test.ts).

let app: Express;
let server: Server;
let base = "";

before(async () => {
  app = express();
  app.use(express.json());
  app.use(registerComponentsRoutes());
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") base = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  stateStore.resetForTests();
});

function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> }));
}

function twoPages(): { from: string; to: string } {
  const from = stateStore.getState().currentPageId as string;
  const to = stateStore.addPage("Detail", "user").id;
  return { from, to };
}

describe("page link transition (model)", () => {
  test("addPageLink stores the transition and defaults to fade", () => {
    const { from, to } = twoPages();
    const link = stateStore.addPageLink(from, to, "Go", undefined, "user", "slide-left");
    assert.equal(link.transition, "slide-left");
    const plain = stateStore.addPageLink(from, to, "Plain", undefined, "user");
    assert.equal(plain.transition, "fade");
  });

  test("addPageLink rejects an invalid transition", () => {
    const { from, to } = twoPages();
    assert.throws(
      () => stateStore.addPageLink(from, to, undefined, undefined, "user", "zoom"),
      /Invalid transition/
    );
  });

  test("updatePageLink patches transition and label, rejects invalid, null on unknown, undoable", () => {
    const { from, to } = twoPages();
    const link = stateStore.addPageLink(from, to, "Go", undefined, "user");
    const updated = stateStore.updatePageLink(link.id, { transition: "expand", label: "Renamed" }, "user");
    assert.equal(updated?.transition, "expand");
    assert.equal(updated?.label, "Renamed");
    assert.equal(stateStore.getState().pageLinks[0].transition, "expand");

    assert.throws(
      () => stateStore.updatePageLink(link.id, { transition: "zoom" }, "user"),
      /Invalid transition/
    );
    assert.equal(stateStore.updatePageLink("link_nope", { transition: "fade" }, "user"), null);

    stateStore.undo();
    const restored = stateStore.getState().pageLinks.find((l) => l.id === link.id);
    assert.equal(restored?.transition, "fade");
    assert.equal(restored?.label, "Go");
  });
});

describe("POST /api/page-links (transition)", () => {
  test("creates a link with an explicit transition", async () => {
    const { from, to } = twoPages();
    const { status, body } = await post("/api/page-links", {
      from_page_id: from,
      to_page_id: to,
      transition: "slide-up",
    });
    assert.equal(status, 200);
    assert.equal((body.link as { transition?: string }).transition, "slide-up");
  });

  test("defaults the transition to fade when omitted", async () => {
    const { from, to } = twoPages();
    const { body } = await post("/api/page-links", { from_page_id: from, to_page_id: to });
    assert.equal((body.link as { transition?: string }).transition, "fade");
  });

  test("400 on an invalid transition", async () => {
    const { from, to } = twoPages();
    const { status } = await post("/api/page-links", {
      from_page_id: from,
      to_page_id: to,
      transition: "spin",
    });
    assert.equal(status, 400);
  });
});

describe("POST /api/page-links/:id (update transition)", () => {
  test("updates the transition and persists it", async () => {
    const { from, to } = twoPages();
    const created = await post("/api/page-links", { from_page_id: from, to_page_id: to });
    const id = (created.body.link as { id: string }).id;

    const { status, body } = await post(`/api/page-links/${id}`, { transition: "slide-right" });
    assert.equal(status, 200);
    assert.equal((body.link as { transition?: string }).transition, "slide-right");
    assert.equal(stateStore.getState().pageLinks[0].transition, "slide-right");
  });

  test("updates the label alongside the transition", async () => {
    const { from, to } = twoPages();
    const created = await post("/api/page-links", { from_page_id: from, to_page_id: to });
    const id = (created.body.link as { id: string }).id;

    const { body } = await post(`/api/page-links/${id}`, { label: "去详情" });
    assert.equal((body.link as { label?: string }).label, "去详情");
  });

  test("400 on invalid transition, 404 on unknown id", async () => {
    const { from, to } = twoPages();
    const created = await post("/api/page-links", { from_page_id: from, to_page_id: to });
    const id = (created.body.link as { id: string }).id;

    assert.equal((await post(`/api/page-links/${id}`, { transition: "nope" })).status, 400);
    assert.equal((await post("/api/page-links/link_missing", { transition: "fade" })).status, 404);
  });
});
