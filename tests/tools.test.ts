import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { readFileSync } from "fs";
import { z } from "zod";
import { stateStore } from "../src/state.js";
import { SERVER_VERSION } from "../src/constants.js";
import { registerColorPaletteTool } from "../src/tools/color-palette.js";
import { registerTypographyTool } from "../src/tools/typography.js";
import { registerSpacingTool } from "../src/tools/spacing.js";
import { registerShadowTool } from "../src/tools/shadows.js";
import { registerBorderRadiusTool } from "../src/tools/border-radius.js";
import { registerContrastTool } from "../src/tools/contrast.js";
import { registerGradientTool } from "../src/tools/gradient.js";
import { registerBreakpointsTool } from "../src/tools/breakpoints.js";
import { registerDesignTokensTool } from "../src/tools/design-tokens.js";
import { registerAllDesignTools } from "../src/tools/design-tools.js";
import { registerProjectTools } from "../src/tools/project-tools.js";
import { registerTokenInteropTools } from "../src/tools/token-interop.js";
import { registerAuditTool } from "../src/tools/design-audit.js";
import { registerRenderTool } from "../src/tools/design-render.js";
import { registerTemplateTools } from "../src/tools/template-tools.js";
import { registerVersionTools } from "../src/tools/version-tools.js";
import { registerDesignMdTool } from "../src/tools/design-md.js";
import { registerStyleGuideTools } from "../src/tools/style-guide-tools.js";
import { registerSemanticStyleTool } from "../src/tools/semantic-tools.js";
import { registerCapabilitiesTool } from "../src/tools/capabilities.js";
import { registerWebpageImportTool } from "../src/tools/webpage-import.js";
import { registerSpecTools } from "../src/tools/spec-tools.js";
import {
  registerSuggestTool,
  registerBrandStyleTool,
  registerReflowTool,
  registerAutoImproveTool,
  registerReviewAndImproveTool,
} from "../src/tools/design-review.js";
import { registerPlatformTools } from "../src/tools/platform-tools.js";
import { registerCollabTools } from "../src/tools/collab-tools.js";
import { registerGeneratePageTool } from "../src/tools/generate-tools.js";
import { registerExplainTool } from "../src/tools/explain-tools.js";

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

registerColorPaletteTool(fakeServer as never);
registerTypographyTool(fakeServer as never);
registerSpacingTool(fakeServer as never);
registerShadowTool(fakeServer as never);
registerBorderRadiusTool(fakeServer as never);
registerContrastTool(fakeServer as never);
registerGradientTool(fakeServer as never);
registerBreakpointsTool(fakeServer as never);
registerDesignTokensTool(fakeServer as never);
registerAllDesignTools(fakeServer as never);
registerProjectTools(fakeServer as never);
registerTokenInteropTools(fakeServer as never);
registerAuditTool(fakeServer as never);
registerRenderTool(fakeServer as never);
registerTemplateTools(fakeServer as never);
registerVersionTools(fakeServer as never);
registerDesignMdTool(fakeServer as never);
registerStyleGuideTools(fakeServer as never);
registerSemanticStyleTool(fakeServer as never);
registerCapabilitiesTool(fakeServer as never);
registerWebpageImportTool(fakeServer as never);
registerSpecTools(fakeServer as never);
registerSuggestTool(fakeServer as never);
registerBrandStyleTool(fakeServer as never);
registerReflowTool(fakeServer as never);
registerAutoImproveTool(fakeServer as never);
registerReviewAndImproveTool(fakeServer as never);
registerPlatformTools(fakeServer as never);
registerCollabTools(fakeServer as never);
registerGeneratePageTool(fakeServer as never);
registerExplainTool(fakeServer as never);

stateStore.resetForTests();

// Isolate project persistence writes from the real home directory.
const originalProjectDir = process.env.PRISM_PROJECT_DIR;
const tempProjectDir = mkdtempSync(path.join(os.tmpdir(), "prism-tools-"));
process.env.PRISM_PROJECT_DIR = tempProjectDir;
test.after(() => {
  rmSync(tempProjectDir, { recursive: true, force: true });
  if (originalProjectDir === undefined) {
    delete process.env.PRISM_PROJECT_DIR;
  } else {
    process.env.PRISM_PROJECT_DIR = originalProjectDir;
  }
});

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
  design_init: { project_name: "Smoke Test", style: "minimal", base_color: "#2563EB" },
  design_add_component: { type: "hero", variant: "center", props: { title: "Hello" } },
  design_update_component: { id: "missing", props: { title: "x" }, layout: { x: 0, y: 0, w: 320, h: 160 } },
  design_set_animation: { component_id: "missing", entry: "fadeUp", duration: 0.5 },
  design_get_state: {},
  design_set_token: { category: "colors", key: "color-primary", value: "#FF5733" },
  design_remove_component: { id: "missing" },
  design_undo: {},
  design_redo: {},
  design_add_page: { name: "About" },
  design_switch_page: { page_id: "missing" },
  design_remove_page: { page_id: "missing" },
  design_apply_template: { template: "saas_landing" },
  design_export: { format: "html" },
  design_reorder_component: { from_id: "a", to_id: "b", position: "before" },
  design_set_theme: { mode: "dark" },
  design_get_conflicts: {},
  design_check_prompts: {},
  design_save_project: { name: "Tool Test" },
  design_load_project: { file: path.join(tempProjectDir, "missing.prism.json") },
  design_list_projects: {},
  design_export_tokens: { format: "dtcg" },
  design_import_tokens: {
    tokens_json: JSON.stringify({
      colors: { "color-primary": { $type: "color", $value: "#123456" } },
    }),
  },
  design_audit_accessibility: {},
  design_render_preview: {},
  design_save_template: { name: "Tool Template" },
  design_load_template: { file: path.join(tempProjectDir, "missing.prism-template.json") },
  design_list_templates: {},
  design_create_version: { name: "v1" },
  design_list_versions: {},
  design_restore_version: { version_id: "missing" },
  design_diff_versions: { from_id: "a", to_id: "b" },
  design_import_design_md: {
    markdown: `---\ncolors:\n  color-primary: "#123456"\n---\n\nProse here`,
  },
  design_get_style_guide: {},
  design_apply_style_guide: { tag: "brutalist" },
  design_semantic_style: { description: "温暖落地页", adjectives: ["温暖", "简约"] },
  design_list_capabilities: {},
  design_import_webpage: {
    html: "<nav><a>Logo</a></nav><footer>© 2026</footer>",
  },
  design_list_style_presets: {},
  design_list_components: {},
  design_list_pages: {},
  design_set_project_name: { name: "Renamed" },
  design_get_tokens: {},
  design_set_token_batch: { category: "colors", tokens: { "color-primary": "#123456" } },
  design_delete_token: { category: "colors", key: "color-primary" },
  design_suggest_improvements: {},
  design_create_brand_style: { name: "Acme", colors: ["#3366FF", "#FF5733"] },
  design_reflow: {},
  design_auto_improve: {},
  design_set_platform: { platform: "mobile-ios" },
  design_save_platform: { platform: "web-mobile" },
  design_load_platform: { platform: "mobile-ios" },
  design_list_platforms: {},
  design_add_comment: { component_id: "missing", text: "hi" },
  design_list_comments: {},
  design_remove_comment: { comment_id: "missing" },
  design_generate_page: { brief: "电商促销首页", adjectives: ["温暖", "简约"] },
  design_review_and_improve: {},
  design_explain_design: {},
  design_set_behavior: {
    component_id: "comp_1",
    behavior: { type: "navigate", page_id: "page_2" },
  },
  design_align_components: { ids: ["comp_1", "comp_2"], mode: "center_x" },
  design_z_order_component: { component_id: "comp_1", mode: "front" },
};

const EXPECT_STRUCTURED = new Set([
  "ui_generate_color_palette",
  "ui_suggest_typography",
  "ui_generate_type_scale",
  "ui_generate_spacing_scale",
  "ui_generate_shadow_system",
  "ui_generate_border_radius_scale",
  "ui_check_color_contrast",
  "ui_generate_gradient",
  "ui_suggest_breakpoints",
  "ui_generate_design_tokens",
  "design_init",
  "design_add_component",
  "design_get_state",
  "design_set_token",
  "design_undo",
  "design_redo",
  "design_add_page",
  "design_apply_template",
  "design_export",
  "design_set_theme",
  "design_get_conflicts",
  "design_check_prompts",
  "design_save_project",
  "design_list_projects",
  "design_export_tokens",
  "design_import_tokens",
  "design_audit_accessibility",
  "design_render_preview",
  "design_save_template",
  "design_list_templates",
  "design_create_version",
  "design_list_versions",
  "design_import_design_md",
  "design_get_style_guide",
  "design_apply_style_guide",
  "design_semantic_style",
  "design_list_capabilities",
  "design_import_webpage",
  "design_list_style_presets",
  "design_list_components",
  "design_list_pages",
  "design_set_project_name",
  "design_get_tokens",
  "design_set_token_batch",
  "design_delete_token",
  "design_suggest_improvements",
  "design_create_brand_style",
  "design_reflow",
  "design_auto_improve",
  "design_set_platform",
  "design_save_platform",
  "design_list_platforms",
  "design_list_comments",
  "design_remove_comment",
  "design_generate_page",
  "design_review_and_improve",
  "design_explain_design",
  "design_set_behavior",
  "design_align_components",
  "design_z_order_component",
]);

const INVALID_PARAMS: Record<string, Record<string, unknown>> = {
  ui_generate_shadow_system: { style: "banana" },
  ui_check_color_contrast: { foreground: "#333333" },
  ui_generate_type_scale: { base_size: 100 },
  ui_generate_spacing_scale: { base_unit: 6 },
  ui_generate_gradient: { base_color: "#6366F1", stops: 9 },
  design_init: { project_name: "x" },
  design_add_component: {},
  design_set_token: { category: "bogus", key: "k", value: "v" },
  design_apply_template: { template: "nope" },
  design_set_theme: { mode: "blue" },
  design_export: { format: "pdf" },
  design_reorder_component: { from_id: "a", to_id: "b", position: "sideways" },
  design_export_tokens: { format: "yaml" },
  design_import_tokens: { tokens_json: "" },
  design_audit_accessibility: { level: "A" },
  design_render_preview: { viewport: "ultrawide" },
  design_import_design_md: { markdown: "" },
  design_restore_version: {},
  design_diff_versions: { from_id: "x" },
  design_import_webpage: { url: 123 },
  design_semantic_style: { description: "x", adjectives: [] },
  design_apply_style_guide: { tag: "" },
  design_set_project_name: {},
  design_set_token_batch: { category: "bogus", tokens: {} },
  design_delete_token: {},
  design_create_brand_style: { name: "x", colors: [] },
  design_set_platform: { platform: "tablet" },
  design_save_platform: { platform: "tablet" },
  design_load_platform: {},
  design_add_comment: { text: "x" },
  design_remove_comment: {},
  design_generate_page: { brief: "" },
  design_explain_design: { lang: "fr" },
  design_set_behavior: { component_id: "comp_1" },
  design_align_components: { ids: ["a"], mode: "center_x" },
  design_z_order_component: { component_id: "comp_1", mode: "diagonal" },
};

test("registers all 72 tools with unique names", () => {
  assert.equal(captured.length, 72);
  assert.equal(new Set(captured.map((t) => t.name)).size, 72);
  for (const tool of captured) {
    assert.equal(typeof tool.handler, "function");
  }
});

test("server version matches package.json", () => {
  const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")) as {
    version: string;
  };
  assert.equal(SERVER_VERSION, pkg.version);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});

for (const tool of captured) {
  test(`smoke: ${tool.name} resolves with an MCP content response`, async () => {
    // Parse through the tool schema first so zod defaults are applied,
    // mirroring how the MCP SDK invokes handlers.
    const parsed = z.object(tool.schema).parse(VALID_PARAMS[tool.name] ?? {});
    const result = (await tool.handler(parsed)) as {
      content?: unknown[];
      structuredContent?: unknown;
    };
    assert.ok(result && typeof result === "object");
    assert.ok(Array.isArray(result.content), `${tool.name} missing content array`);
    assert.ok(result.content.length > 0, `${tool.name} empty content`);
    if (EXPECT_STRUCTURED.has(tool.name)) {
      assert.ok("structuredContent" in result, `${tool.name} missing structuredContent`);
    }
  });
}

for (const [name, bad] of Object.entries(INVALID_PARAMS)) {
  test(`rejects invalid params: ${name}`, () => {
    const tool = captured.find((t) => t.name === name)!;
    const schema = z.object(tool.schema);
    const parsed = schema.safeParse(bad);
    assert.equal(parsed.success, false, `${name} should reject ${JSON.stringify(bad)}`);
  });
}
