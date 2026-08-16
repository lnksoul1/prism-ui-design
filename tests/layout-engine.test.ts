import { test } from "node:test";
import assert from "node:assert/strict";
import type { ComponentNode } from "../src/state.js";
import {
  autoLayoutTopLevel,
  ensureTopLevelLayouts,
  FLOW_GAP,
  FLOW_X,
} from "../src/layout-engine.js";

function node(type: string, id = type, layout?: { x: number; y: number; w: number; h: number }): ComponentNode {
  return { id, type, props: {}, children: [], layout };
}

test("autoLayoutTopLevel lays components out vertically with 16px gap", () => {
  const components = [node("navbar", "a"), node("hero", "b"), node("footer", "c")];
  autoLayoutTopLevel(components, 1200);
  assert.equal(components[0].layout?.x, FLOW_X);
  assert.equal(components[0].layout?.y, FLOW_X);
  assert.equal(components[0].layout?.w, 1200 - FLOW_X * 2);
  const secondY = components[0].layout!.y + components[0].layout!.h + FLOW_GAP;
  assert.equal(components[1].layout?.y, secondY);
});

test("ensureTopLevelLayouts only fills missing layouts and continues below existing ones", () => {
  const components = [
    node("navbar", "a", { x: 16, y: 100, w: 1000, h: 64 }),
    node("hero", "b"),
  ];
  ensureTopLevelLayouts(components, 1200);
  assert.equal(components[0].layout?.y, 100);
  assert.equal(components[1].layout?.y, 100 + 64 + FLOW_GAP);
});
