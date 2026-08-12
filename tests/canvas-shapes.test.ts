import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { applyStyleTokenSet } from "../src/tokens.js";
import {
  canvasShapeCount,
  canvasToHtml,
  extractPlainText,
  shapesToComponents,
} from "../src/canvas-shapes.js";

function richText(text: string): unknown {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function docWithShapes(shapes: unknown[]): unknown {
  const store: Record<string, unknown> = {};
  shapes.forEach((shape, i) => {
    const s = shape as { id?: string };
    store[s.id || `shape:${i}`] = shape;
  });
  return { document: { schemaVersion: 1, store } };
}

beforeEach(() => {
  stateStore.resetForTests();
  applyStyleTokenSet(stateStore, "minimal", "#7C3AED", "ai");
});

test("extractPlainText handles strings, rich-text docs, and arrays", () => {
  assert.equal(extractPlainText("plain"), "plain");
  assert.equal(
    extractPlainText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] }),
    "Hi"
  );
  assert.equal(extractPlainText([{ text: "A" }, { type: "paragraph", content: [{ text: "B" }] }]), "AB");
  assert.equal(extractPlainText(null), "");
  assert.equal(extractPlainText(42), "");
});

test("shapesToComponents maps drawn shapes and skips decorative ones", () => {
  const doc = docWithShapes([
    {
      id: "shape:geo",
      typeName: "shape",
      type: "geo",
      x: 10,
      y: 20,
      rotation: 0,
      props: { w: 300, h: 200, fill: "solid", richText: richText("Hero title") },
      meta: {},
    },
    {
      id: "shape:text",
      typeName: "shape",
      type: "text",
      x: 40,
      y: 240,
      props: { w: 200, h: 40, richText: richText("Welcome") },
      meta: {},
    },
    {
      id: "shape:arrow",
      typeName: "shape",
      type: "arrow",
      x: 0,
      y: 0,
      props: {},
      meta: {},
    },
  ]);

  const components = shapesToComponents(doc);
  assert.equal(components.length, 2, "decorative arrow should be skipped");
  assert.equal(components[0].type, "container");
  assert.equal(components[0].props.text, "Hero title");
  assert.deepEqual(components[0].layout, { x: 10, y: 20, w: 300, h: 200 });
  assert.equal(components[1].type, "text");
  assert.equal(components[1].props.text, "Welcome");
  // Top-to-bottom ordering
  assert.equal(components[0].layout?.y, 20);
  assert.equal(components[1].layout?.y, 240);
});

test("shapesToComponents restores original component identity from meta", () => {
  const doc = docWithShapes([
    {
      id: "shape:btn",
      typeName: "shape",
      type: "geo",
      x: 0,
      y: 500,
      rotation: 0,
      props: { w: 120, h: 40, richText: richText("Buy") },
      meta: {
        prism: true,
        componentId: "comp_orig_1",
        componentType: "button",
        componentVariant: "primary",
        componentProps: { text: "Buy now", action: "checkout" },
      },
    },
  ]);

  const components = shapesToComponents(doc);
  assert.equal(components.length, 1);
  assert.equal(components[0].id, "comp_orig_1");
  assert.equal(components[0].type, "button");
  assert.equal(components[0].variant, "primary");
  assert.deepEqual(components[0].props, { text: "Buy now", action: "checkout" });
  assert.deepEqual(components[0].layout, { x: 0, y: 500, w: 120, h: 40 });
});

test("shapesToComponents maps image shapes to image components with asset src", () => {
  const doc = docWithShapes([
    {
      id: "asset:1",
      typeName: "asset",
      src: "data:image/png;base64,AAAA",
      name: "photo.png",
    },
    {
      id: "shape:img",
      typeName: "shape",
      type: "image",
      x: 5,
      y: 6,
      props: { w: 400, h: 300, assetId: "asset:1" },
      meta: {},
    },
  ]);

  const components = shapesToComponents(doc);
  assert.equal(components.length, 1);
  assert.equal(components[0].type, "image");
  assert.equal(components[0].props.src, "data:image/png;base64,AAAA");
  assert.equal(components[0].props.alt, "photo.png");
});

test("shapesToComponents maps prism-block shapes to containers with style hints", () => {
  const doc = docWithShapes([
    {
      id: "shape:block",
      typeName: "shape",
      type: "prism-block",
      x: 12,
      y: 34,
      props: {
        w: 500,
        h: 120,
        label: "Buy now",
        kind: "button",
        bg: "#7C3AED",
        fg: "#ffffff",
        border: "#5b21b6",
        radius: "8px",
      },
      meta: {},
    },
  ]);

  const components = shapesToComponents(doc);
  assert.equal(components.length, 1);
  assert.equal(components[0].type, "container");
  assert.equal(components[0].props.text, "Buy now");
  assert.equal(components[0].props.kind, "button");
  assert.equal(components[0].props.bg, "#7C3AED");
  assert.deepEqual(components[0].layout, { x: 12, y: 34, w: 500, h: 120 });
});

test("canvas draw queue: add, read, clear per page", () => {
  const pageId = stateStore.getState().currentPageId as string;
  const queued = stateStore.addCanvasDraws(
    [
      { type: "rect", x: 0, y: 0, w: 200, h: 100, label: "Hero box" },
      { type: "text", x: 10, y: 120, label: "Welcome" },
      { type: "arrow", x: 20, y: 20 },
    ],
    pageId,
    "ai"
  );
  assert.equal(queued.length, 3);
  assert.ok(queued.every((d) => d.id && d.createdAt));

  const read = stateStore.getCanvasDraws(pageId);
  assert.equal(read.length, 3);
  assert.equal(read[0].label, "Hero box");

  // Unknown types are normalized to rect; invalid entries are dropped.
  const mixed = stateStore.addCanvasDraws(
    [{ type: "prism", x: 5, y: 5, kind: "button", label: "CTA" }, { bad: true } as never],
    pageId,
    "ai"
  );
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].type, "prism");

  const cleared = stateStore.clearCanvasDraws(pageId);
  assert.equal(cleared, true);
  assert.equal(stateStore.getCanvasDraws(pageId).length, 0);
});

test("consumePendingPrompt returns the prompt and emits acceptance", () => {
  let accepted: unknown = null;
  stateStore.once("prompt_accepted", (prompt) => {
    accepted = prompt;
  });
  stateStore.setPendingPrompt("make it blue");

  assert.equal(stateStore.getPendingPrompt(), "make it blue");
  const consumed = stateStore.consumePendingPrompt();
  assert.equal(consumed, "make it blue");
  assert.equal(accepted, "make it blue");
  assert.equal(stateStore.getPendingPrompt(), null);
  // A second consume finds nothing and emits nothing.
  assert.equal(stateStore.consumePendingPrompt(), null);
});

test("canvasShapeCount counts shape records only", () => {
  const doc = docWithShapes([
    { id: "shape:a", typeName: "shape", type: "geo", x: 0, y: 0, props: { w: 1, h: 1 } },
    { id: "shape:b", typeName: "shape", type: "text", x: 0, y: 0, props: { w: 1, h: 1 } },
    { id: "asset:1", typeName: "asset", src: "x" },
  ]);
  assert.equal(canvasShapeCount(doc), 2);
});

test("canvasToHtml generates an absolutely-positioned page from the drawing", () => {
  const doc = docWithShapes([
    {
      id: "shape:hero",
      typeName: "shape",
      type: "geo",
      x: 0,
      y: 0,
      props: { w: 900, h: 300, richText: richText("Landing & <hero>") },
      meta: {},
    },
    {
      id: "shape:txt",
      typeName: "shape",
      type: "text",
      x: 40,
      y: 320,
      props: { w: 400, h: 48, richText: richText("Subtitle") },
      meta: {},
    },
  ]);

  const html = canvasToHtml(doc, stateStore.getState().tokens);
  assert.match(html, /prism-canvas-page/);
  assert.match(html, /left:0px/);
  assert.match(html, /top:0px/);
  assert.match(html, /width:900px/);
  assert.match(html, /Landing &amp; &lt;hero&gt;/);
  assert.match(html, /Subtitle/);
});
