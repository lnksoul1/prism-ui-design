import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import type { Server } from "node:http";
import { stateStore, type ComponentNode } from "../src/state.js";
import { registerComponentsRoutes } from "../src/routes/components.js";
import { errorHandler } from "../src/routes/shared.js";

// Route-level validation tests for the V2.0 responsive endpoints
// (base-style / breakpoint-style / animation / element move). No need for
// the full server stack: mount the components router on a bare express app
// bound to an ephemeral port and drive it with fetch.

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

function addTextComponent(): string {
  return stateStore.addComponent("text", undefined, { text: "hi" }, null, "user").id;
}

function findNode(id: string): ComponentNode | undefined {
  const search = (nodes: ComponentNode[]): ComponentNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = search(node.children || []);
      if (found) return found;
    }
    return undefined;
  };
  return search(stateStore.getState().components);
}

describe("POST /api/component/:id/base-style", () => {
  test("persists a valid style object", async () => {
    const id = addTextComponent();
    const { status, body } = await post(`/api/component/${id}/base-style`, {
      style: { width: "100px", color: "#333" },
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(findNode(id)?.baseStyle, { width: "100px", color: "#333" });
  });

  test("400 when style is missing", async () => {
    const id = addTextComponent();
    const { status } = await post(`/api/component/${id}/base-style`, {});
    assert.equal(status, 400);
  });

  test("400 when a style value is not a string", async () => {
    const id = addTextComponent();
    const { status } = await post(`/api/component/${id}/base-style`, { style: { width: 100 } });
    assert.equal(status, 400);
  });

  test("400 when a style value exceeds 200 characters (200 is allowed)", async () => {
    const id = addTextComponent();
    const tooLong = await post(`/api/component/${id}/base-style`, { style: { width: "x".repeat(201) } });
    assert.equal(tooLong.status, 400);
    const boundary = await post(`/api/component/${id}/base-style`, { style: { width: "x".repeat(200) } });
    assert.equal(boundary.status, 200);
  });

  test("404 for an unknown component", async () => {
    const { status } = await post("/api/component/nope/base-style", { style: { width: "1px" } });
    assert.equal(status, 404);
  });
});

describe("POST /api/component/:id/breakpoint-style", () => {
  test("persists a valid tablet override", async () => {
    const id = addTextComponent();
    const { status } = await post(`/api/component/${id}/breakpoint-style`, {
      breakpoint: "tablet",
      style: { width: "90px" },
    });
    assert.equal(status, 200);
    assert.deepEqual(findNode(id)?.breakpointOverrides?.tablet, { width: "90px" });
  });

  test("400 for the desktop breakpoint", async () => {
    const id = addTextComponent();
    const { status } = await post(`/api/component/${id}/breakpoint-style`, {
      breakpoint: "desktop",
      style: { width: "90px" },
    });
    assert.equal(status, 400);
  });

  test("400 when a style value is not a string", async () => {
    const id = addTextComponent();
    const { status } = await post(`/api/component/${id}/breakpoint-style`, {
      breakpoint: "mobile",
      style: { width: null },
    });
    assert.equal(status, 400);
  });

  test("400 when a style value exceeds 200 characters", async () => {
    const id = addTextComponent();
    const { status } = await post(`/api/component/${id}/breakpoint-style`, {
      breakpoint: "mobile",
      style: { width: "x".repeat(201) },
    });
    assert.equal(status, 400);
  });

  test("404 for an unknown component", async () => {
    const { status } = await post("/api/component/nope/breakpoint-style", {
      breakpoint: "mobile",
      style: { width: "80px" },
    });
    assert.equal(status, 404);
  });
});

describe("POST /api/component/:id/animation", () => {
  test("applies the 0/600 defaults and persists the block", async () => {
    const id = addTextComponent();
    const { status, body } = await post(`/api/component/${id}/animation`, {
      trackId: "main",
      preset: "fadeIn",
    });
    assert.equal(status, 200);
    const anim = body.animation as Record<string, unknown>;
    assert.equal(anim.startTime, 0);
    assert.equal(anim.duration, 600);
    assert.equal(anim.trackId, "main");
    assert.equal(anim.preset, "fadeIn");
    assert.equal(findNode(id)?.animations?.length, 1);
  });

  test("keeps whitelisted fields and drops everything else", async () => {
    const id = addTextComponent();
    const { status, body } = await post(`/api/component/${id}/animation`, {
      trackId: "main",
      preset: "slideUp",
      startTime: 120,
      duration: 900,
      engine: "css",
      params: { delay: 0.2 },
      id: "anim_custom",
      evil: "should be dropped",
    });
    assert.equal(status, 200);
    const anim = body.animation as Record<string, unknown>;
    assert.equal(anim.id, "anim_custom");
    assert.equal(anim.startTime, 120);
    assert.equal(anim.duration, 900);
    assert.equal(anim.engine, "css");
    assert.deepEqual(anim.params, { delay: 0.2 });
    assert.equal("evil" in anim, false);
  });

  test("400 when trackId is missing or empty", async () => {
    const id = addTextComponent();
    const missing = await post(`/api/component/${id}/animation`, { preset: "fadeIn" });
    assert.equal(missing.status, 400);
    const empty = await post(`/api/component/${id}/animation`, { trackId: "", preset: "fadeIn" });
    assert.equal(empty.status, 400);
  });

  test("400 when preset is missing or empty", async () => {
    const id = addTextComponent();
    const missing = await post(`/api/component/${id}/animation`, { trackId: "main" });
    assert.equal(missing.status, 400);
    const empty = await post(`/api/component/${id}/animation`, { trackId: "main", preset: "" });
    assert.equal(empty.status, 400);
  });

  test("400 when startTime is negative or not a number", async () => {
    const id = addTextComponent();
    const negative = await post(`/api/component/${id}/animation`, { trackId: "main", preset: "fadeIn", startTime: -1 });
    assert.equal(negative.status, 400);
    const stringVal = await post(`/api/component/${id}/animation`, {
      trackId: "main",
      preset: "fadeIn",
      startTime: "100",
    });
    assert.equal(stringVal.status, 400);
  });

  test("400 when duration is negative or not a number", async () => {
    const id = addTextComponent();
    const negative = await post(`/api/component/${id}/animation`, { trackId: "main", preset: "fadeIn", duration: -5 });
    assert.equal(negative.status, 400);
    const stringVal = await post(`/api/component/${id}/animation`, {
      trackId: "main",
      preset: "fadeIn",
      duration: "600",
    });
    assert.equal(stringVal.status, 400);
  });

  test("400 when params is not an object", async () => {
    const id = addTextComponent();
    const { status } = await post(`/api/component/${id}/animation`, {
      trackId: "main",
      preset: "fadeIn",
      params: "fast",
    });
    assert.equal(status, 400);
  });

  test("400 when engine is neither css nor gsap", async () => {
    const id = addTextComponent();
    const { status } = await post(`/api/component/${id}/animation`, {
      trackId: "main",
      preset: "fadeIn",
      engine: "webgl",
    });
    assert.equal(status, 400);
  });

  test("404 for an unknown component", async () => {
    const { status } = await post("/api/component/nope/animation", { trackId: "main", preset: "fadeIn" });
    assert.equal(status, 404);
  });
});

describe("POST /api/component/:id/element/:path/move", () => {
  test("reorders items within the same props array", async () => {
    const node = stateStore.addComponent(
      "feature_list",
      undefined,
      { items: [{ title: "a" }, { title: "b" }, { title: "c" }] },
      null,
      "user"
    );
    const { status, body } = await post(`/api/component/${node.id}/element/items.0.title/move`, {
      position: "after",
      target_path: "items.2.title",
    });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    const items = (findNode(node.id)?.props as { items: Array<{ title: string }> }).items;
    assert.deepEqual(items.map((item) => item.title), ["b", "c", "a"]);
  });

  test("400 when the paths belong to different props arrays", async () => {
    const node = stateStore.addComponent(
      "feature_list",
      undefined,
      { items: [{ title: "a" }], others: [{ title: "b" }] },
      null,
      "user"
    );
    const { status } = await post(`/api/component/${node.id}/element/items.0.title/move`, {
      position: "after",
      target_path: "others.0.title",
    });
    assert.equal(status, 400);
  });
});
