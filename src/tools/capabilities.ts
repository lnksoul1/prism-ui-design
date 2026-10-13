/**
 * Self-describing capability manifest.
 *
 * `design_list_capabilities` returns a JSON manifest of every tool, resource,
 * prompt, component type and semantic adjective so an agent can drive the server
 * without scraping help texts.
 *
 * INVARIANT (route B refactor): this manifest must list **exactly** the tools
 * that `src/index.ts` registers 鈥?no more, no fewer. `tests/tools.test.ts`
 * asserts the two sets are equal, so the manifest can never silently drift from
 * the registry again (it previously advertised three unregistered tools).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION } from "../constants.js";
import { COMPONENT_TYPES } from "../service/design-service.js";
import { adjectiveCatalog } from "./semantic-tools.js";

const TOOL_MANIFEST: Array<{ name: string; group: string; summary: string; example: string }> = [
  // ===== Generation: stateless token/asset generators =====
  { name: "ui_generate_color_palette", group: "generation", summary: "Color theory palette generation (6 harmony schemes)", example: 'ui_generate_color_palette(base_color="#2563EB", scheme="complementary")' },
  { name: "ui_suggest_typography", group: "generation", summary: "Curated font pairings with Google Fonts links", example: 'ui_suggest_typography(style="minimal")' },
  { name: "ui_generate_type_scale", group: "generation", summary: "Modular type scale", example: 'ui_generate_type_scale(base_size=16, ratio="perfect_fourth")' },
  { name: "ui_generate_spacing_scale", group: "generation", summary: "Spacing system (linear/geometric/fibonacci)", example: "ui_generate_spacing_scale(base_unit=8, strategy='geometric')" },
  { name: "ui_generate_shadow_system", group: "generation", summary: "Elevation shadow system", example: 'ui_generate_shadow_system(style="medium")' },
  { name: "ui_generate_border_radius_scale", group: "generation", summary: "Border radius scale", example: 'ui_generate_border_radius_scale(style="subtle")' },
  { name: "ui_check_color_contrast", group: "generation", summary: "WCAG contrast check", example: 'ui_check_color_contrast(foreground="#333", background="#FFF")' },
  { name: "ui_generate_gradient", group: "generation", summary: "CSS gradient generator", example: 'ui_generate_gradient(base_color="#6366F1", type="linear")' },
  { name: "ui_suggest_breakpoints", group: "generation", summary: "Responsive breakpoint systems", example: 'ui_suggest_breakpoints(framework="tailwind")' },
  { name: "ui_generate_design_tokens", group: "generation", summary: "Complete design token system in one call", example: 'ui_generate_design_tokens(style="minimal")' },

  // ===== Session: build a design in the server's state =====
  { name: "design_init", group: "session", summary: "Initialize a design session with neutral default tokens", example: 'design_init(project_name="Summer Sale", style="bold")' },
  { name: "design_add_component", group: "session", summary: "Add a component (55 supported types, validated props)", example: 'design_add_component(type="hero", variant="centered", props={title:"Hi"})' },
  { name: "design_update_component", group: "session", summary: "Update a component's props, layout, visibility or lock", example: 'design_update_component(id="comp_x", props={title:"New"})' },
  { name: "design_rename_component", group: "session", summary: "Rename a component's layer name", example: 'design_rename_component(component_id="comp_x", name="Hero title")' },
  { name: "design_remove_component", group: "session", summary: "Remove a component from the current page", example: 'design_remove_component(id="comp_x")' },
  { name: "design_reorder_component", group: "session", summary: "Reorder components (before/after a sibling)", example: 'design_reorder_component(from_id="a", to_id="b", position="before")' },
  { name: "design_align_components", group: "session", summary: "Align/distribute components in one undo step", example: 'design_align_components(ids=["comp_1","comp_2"], mode="center_x")' },
  { name: "design_z_order_component", group: "session", summary: "Reorder stacking (front/back/forward/backward)", example: 'design_z_order_component(component_id="comp_x", mode="front")' },
  { name: "design_set_token", group: "session", summary: "Set a single design token", example: 'design_set_token(category="colors", key="color-primary", value="#FF5733")' },
  { name: "design_set_theme", group: "session", summary: "Switch the session between light and dark", example: 'design_set_theme(mode="dark")' },
  { name: "design_apply_template", group: "session", summary: "Apply one of 5 built-in page templates", example: 'design_apply_template(template="saas_landing")' },
  { name: "design_add_page", group: "session", summary: "Add a page", example: 'design_add_page(name="About")' },
  { name: "design_switch_page", group: "session", summary: "Switch the current page", example: 'design_switch_page(page_id="page_x")' },
  { name: "design_remove_page", group: "session", summary: "Remove a page", example: 'design_remove_page(page_id="page_x")' },
  { name: "design_get_state", group: "session", summary: "Read the full state (tokens, pages, components, activity)", example: "design_get_state()" },
  { name: "design_get_conflicts", group: "session", summary: "List token contrast conflicts", example: "design_get_conflicts()" },
  { name: "design_undo", group: "session", summary: "Undo the last operation", example: "design_undo()" },
  { name: "design_redo", group: "session", summary: "Redo an undone operation", example: "design_redo()" },

  // ===== Persistence: keep a multi-turn session recoverable =====
  { name: "design_save_project", group: "persistence", summary: "Save the session to a .prism.json file", example: 'design_save_project(name="Landing")' },
  { name: "design_load_project", group: "persistence", summary: "Load a session from a .prism.json file", example: 'design_load_project(file="path.prism.json")' },
  { name: "design_list_projects", group: "persistence", summary: "List saved project files", example: "design_list_projects()" },

  // ===== Review & delivery =====
  { name: "design_audit_accessibility", group: "quality", summary: "WCAG-oriented accessibility audit with a score", example: 'design_audit_accessibility(level="AA")' },
  { name: "design_suggest_improvements", group: "quality", summary: "Heuristic design review with actionable suggestions", example: "design_suggest_improvements()" },
  { name: "design_render_preview", group: "delivery", summary: "Render a standalone HTML preview (PNG when Playwright is installed)", example: 'design_render_preview(viewport="desktop")' },
  { name: "design_export", group: "delivery", summary: "Export as html/react/vue/react-ts/svelte/css/presentation/flutter/swiftui", example: 'design_export(format="html")' },
  { name: "design_export_tokens", group: "delivery", summary: "Export tokens as DTCG/CSS/Style Dictionary/Figma Tokens/DESIGN.md/Tailwind", example: 'design_export_tokens(format="dtcg")' },
  { name: "design_import_tokens", group: "delivery", summary: "Import DTCG tokens (replace / merge strategies)", example: 'design_import_tokens(tokens_json="{...}")' },
  { name: "design_import_webpage", group: "delivery", summary: "Import a webpage URL or pasted HTML as components", example: 'design_import_webpage(url="https://example.com")' },
  { name: "design_import_design_md", group: "delivery", summary: "Import tokens from a Google DESIGN.md document", example: 'design_import_design_md(markdown="---...")' },

  // ===== Semantics =====
  { name: "design_semantic_style", group: "semantics", summary: "Map natural-language adjectives onto measurable token deltas", example: 'design_semantic_style(description="warm landing page", adjectives=["温暖"])' },

  // ===== Meta =====
  { name: "design_list_capabilities", group: "meta", summary: "This manifest: tools, resources, prompts, component types", example: "design_list_capabilities()" },
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
          semantic_adjectives: adjectiveCatalog(),
        };
        return {
          content: [
            {
              type: "text" as const,
              text: `# Prism Capabilities\n\n${manifest.tool_count} tools 路 ${manifest.component_types.length} component types 路 ${manifest.semantic_adjectives.length} semantic adjectives\n\nExported pages are self-contained: no external CDN runtime is injected.`,
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
