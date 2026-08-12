/**
 * Self-describing capability manifest (functional plan F3 #3).
 *
 * `design_list_capabilities` returns a JSON manifest of every tool, resource,
 * prompt, component type, template, style guide, and semantic adjective so an
 * agent can drive the server without scraping help texts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION } from "../constants.js";
import { COMPONENT_TYPES } from "../service/design-service.js";
import { STYLE_GUIDES } from "../style-guides.js";
import { adjectiveCatalog } from "./semantic-tools.js";

const TOOL_MANIFEST: Array<{ name: string; group: string; summary: string; example: string }> = [
  // Generation
  { name: "ui_generate_color_palette", group: "generation", summary: "Color theory palette generation (6 harmony schemes)", example: 'ui_generate_color_palette(base_color="#2563EB", scheme="complementary")' },
  { name: "ui_suggest_typography", group: "generation", summary: "Curated font pairings with Google Fonts links", example: 'ui_suggest_typography(style="minimal")' },
  { name: "ui_generate_type_scale", group: "generation", summary: "Modular type scale", example: 'ui_generate_type_scale(base_size=16, ratio="perfect_fourth")' },
  { name: "ui_generate_spacing_scale", group: "generation", summary: "Spacing system (linear/geometric/fibonacci)", example: "ui_generate_spacing_scale(base_unit=8, strategy='geometric')" },
  { name: "ui_generate_shadow_system", group: "generation", summary: "Elevation shadow system", example: 'ui_generate_shadow_system(style="medium")' },
  { name: "ui_generate_border_radius_scale", group: "generation", summary: "Border radius scale", example: 'ui_generate_border_radius_scale(style="subtle")' },
  { name: "ui_check_color_contrast", group: "generation", summary: "WCAG contrast check", example: 'ui_check_color_contrast(foreground="#333", background="#FFF")' },
  { name: "ui_generate_gradient", group: "generation", summary: "CSS gradient generator", example: 'ui_generate_gradient(base_color="#6366F1", type="linear")' },
  { name: "ui_suggest_breakpoints", group: "generation", summary: "Responsive breakpoint systems", example: 'ui_suggest_breakpoints(framework="tailwind")' },
  { name: "ui_generate_design_tokens", group: "generation", summary: "Complete design token system", example: 'ui_generate_design_tokens(style="minimal")' },
  // Design operations
  { name: "design_init", group: "design", summary: "Initialize project + style preset + tokens", example: 'design_init(project_name="Summer Sale", style="bold")' },
  { name: "design_add_component", group: "design", summary: "Add a component to the canvas", example: 'design_add_component(type="hero", variant="centered", props={title:"Hi"})' },
  { name: "design_update_component", group: "design", summary: "Update component props", example: 'design_update_component(id="comp_x", props={title:"New"})' },
  { name: "design_remove_component", group: "design", summary: "Remove a component", example: 'design_remove_component(id="comp_x")' },
  { name: "design_set_animation", group: "design", summary: "Set entry/hover animation", example: 'design_set_animation(component_id="comp_x", entry="fadeUp")' },
  { name: "design_set_token", group: "design", summary: "Set a single design token", example: 'design_set_token(category="colors", key="color-primary", value="#FF5733")' },
  { name: "design_get_state", group: "design", summary: "Full design state", example: "design_get_state()" },
  { name: "design_undo", group: "design", summary: "Undo last operation", example: "design_undo()" },
  { name: "design_redo", group: "design", summary: "Redo an undone operation", example: "design_redo()" },
  { name: "design_add_page", group: "design", summary: "Add a page", example: 'design_add_page(name="About")' },
  { name: "design_switch_page", group: "design", summary: "Switch current page", example: 'design_switch_page(page_id="page_x")' },
  { name: "design_remove_page", group: "design", summary: "Remove a page", example: 'design_remove_page(page_id="page_x")' },
  { name: "design_apply_template", group: "design", summary: "Apply a built-in page template", example: 'design_apply_template(template="saas_landing")' },
  { name: "design_export", group: "design", summary: "Export design as code", example: 'design_export(format="html")' },
  { name: "design_reorder_component", group: "design", summary: "Reorder components", example: 'design_reorder_component(from_id="a", to_id="b", position="before")' },
  { name: "design_set_theme", group: "design", summary: "Light/dark theme", example: 'design_set_theme(mode="dark")' },
  { name: "design_get_conflicts", group: "design", summary: "Token contrast conflicts", example: "design_get_conflicts()" },
  { name: "design_check_prompts", group: "design", summary: "Read pending user prompts", example: "design_check_prompts()" },
  // Persistence & templates
  { name: "design_save_project", group: "persistence", summary: "Save project to disk", example: 'design_save_project(name="Landing")' },
  { name: "design_load_project", group: "persistence", summary: "Load a project file", example: 'design_load_project(file="path.prism.json")' },
  { name: "design_list_projects", group: "persistence", summary: "List saved projects", example: "design_list_projects()" },
  { name: "design_save_template", group: "persistence", summary: "Save current design as template", example: 'design_save_template(name="Pricing Page")' },
  { name: "design_load_template", group: "persistence", summary: "Load a saved template", example: 'design_load_template(file="t.prism-template.json")' },
  { name: "design_list_templates", group: "persistence", summary: "List saved templates", example: "design_list_templates()" },
  // Versions
  { name: "design_create_version", group: "versioning", summary: "Snapshot current design", example: 'design_create_version(name="v1")' },
  { name: "design_list_versions", group: "versioning", summary: "List version snapshots", example: "design_list_versions()" },
  { name: "design_restore_version", group: "versioning", summary: "Restore a version", example: 'design_restore_version(version_id="ver_x")' },
  { name: "design_diff_versions", group: "versioning", summary: "Diff two versions", example: 'design_diff_versions(from_id="a", to_id="b")' },
  // Interop & quality
  { name: "design_export_tokens", group: "interop", summary: "Export tokens (DTCG/CSS/Style Dictionary/Figma Tokens/DESIGN.md)", example: 'design_export_tokens(format="dtcg")' },
  { name: "design_import_tokens", group: "interop", summary: "Import DTCG tokens", example: 'design_import_tokens(tokens_json="{...}")' },
  { name: "design_import_design_md", group: "interop", summary: "Import Google DESIGN.md tokens", example: 'design_import_design_md(markdown="---...")' },
  { name: "design_audit_accessibility", group: "quality", summary: "WCAG-oriented accessibility audit", example: 'design_audit_accessibility(level="AA")' },
  { name: "design_render_preview", group: "quality", summary: "Render design as HTML/PNG", example: 'design_render_preview(viewport="desktop")' },
  { name: "design_import_webpage", group: "interop", summary: "Import a webpage URL/HTML as components", example: 'design_import_webpage(url="https://example.com")' },
  // Semantic & style guides
  { name: "design_semantic_style", group: "semantics", summary: "Adjective → token semantic mapping", example: 'design_semantic_style(description="温暖落地页", adjectives=["温暖","简约"])' },
  { name: "design_get_style_guide", group: "semantics", summary: "Look up a style guide", example: 'design_get_style_guide(tag="glassmorphism")' },
  { name: "design_apply_style_guide", group: "semantics", summary: "Apply a style guide", example: 'design_apply_style_guide(tag="brutalist")' },
  { name: "design_list_capabilities", group: "meta", summary: "Self-describing capability manifest", example: "design_list_capabilities()" },
  // Spec §8.2 alignment
  { name: "design_list_style_presets", group: "design", summary: "List the 14 style presets", example: "design_list_style_presets()" },
  { name: "design_list_components", group: "design", summary: "List components on the current page", example: "design_list_components()" },
  { name: "design_list_pages", group: "design", summary: "List all pages", example: "design_list_pages()" },
  { name: "design_set_project_name", group: "design", summary: "Rename the project", example: 'design_set_project_name(name="Landing")' },
  { name: "design_get_tokens", group: "interop", summary: "Get current tokens (DTCG JSON)", example: 'design_get_tokens(category="colors")' },
  { name: "design_set_token_batch", group: "interop", summary: "Batch-set tokens in a category", example: 'design_set_token_batch(category="colors", tokens={"color-primary":"#FF0000"})' },
  { name: "design_delete_token", group: "interop", summary: "Delete a single token", example: 'design_delete_token(category="colors", key="color-primary")' },
  // Design review
  { name: "design_suggest_improvements", group: "review", summary: "Heuristic design review with actionable suggestions", example: "design_suggest_improvements()" },
  { name: "design_create_brand_style", group: "review", summary: "Learn a brand style from its colors", example: 'design_create_brand_style(name="Acme", colors=["#3366FF","#FF5733"])' },
  { name: "design_reflow", group: "review", summary: "Reorder page into canonical section order", example: "design_reflow()" },
  { name: "design_auto_improve", group: "review", summary: "Apply common structural fixes (tokens/navbar/hero/footer)", example: "design_auto_improve()" },
  { name: "design_set_platform", group: "design", summary: "Set the preview platform", example: 'design_set_platform(platform="mobile-ios")' },
];

export function registerCapabilitiesTool(server: McpServer): void {
  server.registerTool(
    "design_list_capabilities",
    {
      title: "List Capabilities",
      description: "Return a self-describing JSON manifest of all tools, resources, prompts, component types, templates, style guides, and semantic adjectives.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const manifest = {
          server: SERVER_NAME,
          version: SERVER_VERSION,
          tool_count: TOOL_MANIFEST.length,
          tools: TOOL_MANIFEST,
          resources: [
            "prism://tokens/active",
            "prism://components/registry",
            "prism://patterns",
            "prism://audit/checklist",
          ],
          prompts: ["build_page", "design_review", "import_project"],
          component_types: [...COMPONENT_TYPES].sort(),
          templates: ["ecommerce_home", "saas_landing", "blog_post", "portfolio", "dashboard"],
          style_guides: STYLE_GUIDES.map((g) => ({ id: g.id, name: g.name, keywords: g.keywords })),
          semantic_adjectives: adjectiveCatalog(),
        };
        return {
          content: [
            {
              type: "text" as const,
              text: `# Prism Capabilities\n\n${manifest.tool_count} tools · ${manifest.component_types.length} component types · ${manifest.style_guides.length} style guides · ${manifest.semantic_adjectives.length} semantic adjectives\n\nFull manifest in structuredContent.json.`,
            },
          ],
          structuredContent: { success: true, json: manifest },
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );
}
