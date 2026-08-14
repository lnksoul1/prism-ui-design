import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { stateStore } from "../src/state.js";
import { registerRenderTool } from "../src/tools/design-render.js";
import { applyStyleTokenSet } from "../src/tokens.js";

let handler: (params: unknown) => Promise<{
  content?: unknown[];
  structuredContent?: { html?: string; screenshot?: boolean; note?: string; viewport?: string };
}>;

beforeEach(() => {
  stateStore.resetForTests();
  stateStore.setProjectName("Render Test", "ai");
  applyStyleTokenSet(stateStore, "#2563EB", "ai");
  stateStore.addComponent("hero", "centered", { title: "Render Check", subtitle: "hi", button_text: "Go" }, null, "ai");

  handler = (() => {}) as never;
  const fakeServer = {
    registerTool(
      _name: string,
      def: { inputSchema: z.ZodRawShape },
      toolHandler: (params: unknown) => Promise<unknown>
    ): void {
      handler = toolHandler as never;
    },
  };
  registerRenderTool(fakeServer as never);
});

test("design_render_preview returns the full standalone HTML", async () => {
  const result = await handler({ viewport: "mobile" });
  const html = result?.structuredContent?.html || "";
  assert.ok(html.length > 100, "html should be substantial");
  assert.match(html, /Render Check/, "html should contain component content");
  assert.match(html, /<style/, "html should include embedded styles");
  const playwrightAvailable = await isPlaywrightUsable();
  assert.equal(result?.structuredContent?.screenshot, playwrightAvailable);
  if (!playwrightAvailable) {
    assert.ok(result?.structuredContent?.note, "should explain Playwright availability");
  }
});

test("design_render_preview accepts desktop default", async () => {
  const result = await handler({});
  assert.ok(result?.content && Array.isArray(result.content) && result.content.length > 0);
  assert.equal(result?.structuredContent?.viewport, "desktop");
});

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
