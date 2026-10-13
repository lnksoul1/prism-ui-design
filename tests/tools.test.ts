/**
 * Tool-surface contract test.
 *
 * Two invariants:
 *  1. Every tool that `src/index.ts` registers is constructible and smoke-callable
 *     (schema parses, handler returns MCP content).
 *  2. The names in the `design_list_capabilities` manifest are **exactly** the
 *     registered names — this is the drift that let the old manifest advertise
 *     three tools that did not exist.
 *
 * The registry is recreated here by calling the same registration functions the
 * entry point calls, so the test fails if either side changes without the other.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

import { stateStore } from "../src/state.js";

// Generation
import { registerColorPaletteTool } from "../src/tools/color-palette.js";
import { registerTypographyTool } from "../src/tools/typography.js";
import { registerSpacingTool } from "../src/tools/spacing.js";
import { registerShadowTool } from "../src/tools/shadows.js";
import { registerBorderRadiusTool } from "../src/tools/border-radius.js";
import { registerContrastTool } from "../src/tools/contrast.js";
import { registerGradientTool } from "../src/tools/gradient.js";
import { registerBreakpointsTool } from "../src/tools/breakpoints.js";
import { registerDesignTokensTool } from "../src/tools/design-tokens.js";
// Session
import {
  registerDesignAddComponentTool,
  registerDesignAddPageTool,
  registerDesignAlignTool,
  registerDesignApplyTemplateTool,
  registerDesignExportTool,
  registerDesignGetConflictsTool,
  registerDesignGetStateTool,
  registerDesignInitTool,
  registerDesignRedoTool,
  registerDesignRemoveComponentTool,
  registerDesignRemovePageTool,
  registerDesignRenameTool,
  registerDesignReorderComponentTool,
  registerDesignSetThemeTool,
  registerDesignSetTokenTool,
  registerDesignSwitchPageTool,
  registerDesignUndoTool,
  registerDesignUpdateComponentTool,
  registerDesignZOrderTool,
} from "../src/tools/design-tools.js";
import { registerProjectTools } from "../src/tools/project-tools.js";
// Review & delivery
import { registerAuditTool } from "../src/tools/design-audit.js";
import { registerSuggestTool } from "../src/tools/design-review-suggest.js";
import { registerRenderTool } from "../src/tools/design-render.js";
import { registerPreviewSyncTool } from "../src/tools/design-preview.js";
import { registerTokenInteropTools } from "../src/tools/token-interop.js";
import { registerWebpageImportTool } from "../src/tools/webpage-import.js";
import { registerDesignMdTool } from "../src/tools/design-md.js";
// Meta
import { registerCapabilitiesTool } from "../src/tools/capabilities.js";
import { registerSemanticStyleTool } from "../src/tools/semantic-tools.js";

interface CapturedTool {
  name: string;
  schema: z.ZodRawShape;
  handler: (params: unknown) => Promise<unknown>;
}

const captured: CapturedTool[] = [];

const fakeServer = {
  registerTool(
    name: string,
    def: { inputSchema: z.ZodRawShape },
    handler: (params: unknown) => Promise<unknown>
  ): void {
    captured.push({ name, schema: def.inputSchema, handler });
  },
};

const registrations: Array<(s: never) => void> = [
  registerColorPaletteTool,
  registerTypographyTool,
  registerSpacingTool,
  registerShadowTool,
  registerBorderRadiusTool,
  registerContrastTool,
  registerGradientTool,
  registerBreakpointsTool,
  registerDesignTokensTool,
  registerDesignInitTool,
  registerDesignAddComponentTool,
  registerDesignUpdateComponentTool,
  registerDesignRenameTool,
  registerDesignRemoveComponentTool,
  registerDesignReorderComponentTool,
  registerDesignAlignTool,
  registerDesignZOrderTool,
  registerDesignSetTokenTool,
  registerDesignSetThemeTool,
  registerDesignApplyTemplateTool,
  registerDesignAddPageTool,
  registerDesignSwitchPageTool,
  registerDesignRemovePageTool,
  registerDesignGetStateTool,
  registerDesignGetConflictsTool,
  registerDesignExportTool,
  registerDesignUndoTool,
  registerDesignRedoTool,
  registerProjectTools,
  registerAuditTool,
  registerSuggestTool,
  registerRenderTool,
  registerPreviewSyncTool,
  registerTokenInteropTools,
  registerWebpageImportTool,
  registerDesignMdTool,
  registerCapabilitiesTool,
  registerSemanticStyleTool,
];

for (const register of registrations) register(fakeServer as never);

stateStore.resetForTests();

// Isolate persistence from the real home directory.
const originalProjectDir = process.env.PRISM_PROJECT_DIR;
const tempProjectDir = mkdtempSync(path.join(os.tmpdir(), "prism-tools-"));
process.env.PRISM_PROJECT_DIR = tempProjectDir;
test.after(() => {
  rmSync(tempProjectDir, { recursive: true, force: true });
  if (originalProjectDir === undefined) delete process.env.PRISM_PROJECT_DIR;
  else process.env.PRISM_PROJECT_DIR = originalProjectDir;
});

test("the tool surface is exactly the documented size and has unique names", () => {
  assert.equal(captured.length, 42);
  assert.equal(new Set(captured.map((t) => t.name)).size, captured.length);
});

test("every registered tool name is namespaced ui_* or design_*", () => {
  for (const tool of captured) {
    assert.match(tool.name, /^(ui|design)_[a-z0-9_]+$/);
  }
});

test("design_list_capabilities manifest matches the registry exactly", async () => {
  const cap = captured.find((t) => t.name === "design_list_capabilities");
  assert.ok(cap, "design_list_capabilities must be registered");

  const parsed = z.object(cap.schema).parse({});
  const result = (await cap.handler(parsed)) as {
    structuredContent?: { json?: { tools?: Array<{ name: string }> } };
  };
  const manifestNames = (result.structuredContent?.json?.tools ?? []).map((t) => t.name).sort();
  const registeredNames = captured.map((t) => t.name).sort();

  assert.deepEqual(
    manifestNames,
    registeredNames,
    "the manifest in src/tools/capabilities.ts must list exactly the registered tools"
  );
});

/** Minimal valid arguments per tool, used by the smoke test below. */
const VALID_PARAMS: Record<string, Record<string, unknown>> = {
  ui_generate_color_palette: { base_color: "#2563EB", scheme: "complementary", style: "minimal" },
  ui_suggest_typography: { style: "minimal", category: "any", response_format: "json" },
  ui_generate_type_scale: { base_size: 16, ratio: "perfect_fourth" },
  ui_generate_spacing_scale: { base_unit: 8, strategy: "geometric", response_format: "json" },
  ui_generate_shadow_system: { style: "medium", response_format: "json" },
  ui_generate_border_radius_scale: { style: "subtle", response_format: "json" },
  ui_check_color_contrast: { foreground: "#333333", background: "#FFFFFF", response_format: "json" },
  ui_generate_gradient: { base_color: "#6366F1", type: "linear", angle: 135, stops: 3 },
  ui_suggest_breakpoints: { framework: "tailwind", strategy: "mobile_first", response_format: "json" },
  ui_generate_design_tokens: { style: "minimal", base_color: "#6366F1", dark_mode: true, response_format: "json" },
  design_init: { project_name: "Smoke", style: "minimal" },
  design_add_component: { type: "hero", variant: "centered", props: { title: "Hi" } },
  design_update_component: { id: "comp_missing", props: { title: "x" } },
  design_rename_component: { component_id: "comp_missing", name: "Layer" },
  design_remove_component: { id: "comp_missing" },
  design_reorder_component: { from_id: "a", to_id: "b", position: "before" },
  design_align_components: { ids: ["a", "b"], mode: "center_x" },
  design_z_order_component: { component_id: "comp_missing", mode: "front" },
  design_set_token: { category: "colors", key: "color-primary", value: "#FF5733" },
  design_set_theme: { mode: "dark" },
  design_apply_template: { template: "saas_landing" },
  design_add_page: { name: "About" },
  design_switch_page: { page_id: "page_missing" },
  design_remove_page: { page_id: "page_missing" },
  design_get_state: {},
  design_get_conflicts: {},
  design_export: { format: "html" },
  design_undo: {},
  design_redo: {},
  design_save_project: { name: "Smoke" },
  design_load_project: { file: "missing.prism.json" },
  design_list_projects: {},
  design_audit_accessibility: { level: "AA" },
  design_suggest_improvements: {},
  design_render_preview: { viewport: "desktop" },
  design_preview_sync: {},
  design_export_tokens: { format: "dtcg" },
  design_import_tokens: { tokens_json: '{"colors":{"color-primary":{"$value":"#111111"}}}' },
  design_import_webpage: { html: "<nav><a href='/'>x</a></nav>" },
  design_import_design_md: { markdown: "---\ntitle: x\n---\nbody" },
  design_list_capabilities: {},
  design_semantic_style: { description: "warm landing page", adjectives: ["warm"] },
};

test("every registered tool accepts its documented parameters and responds", async () => {
  for (const tool of captured) {
    const params = VALID_PARAMS[tool.name];
    assert.ok(params !== undefined, `no smoke params defined for ${tool.name}`);
    const parsed = z.object(tool.schema).parse(params);
    const result = (await tool.handler(parsed)) as { content?: unknown };
    assert.ok(Array.isArray(result.content), `${tool.name} must return MCP content`);
  }
});
