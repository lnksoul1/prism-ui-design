/**
 * One-shot page generation (improvement plan C6 subset).
 *
 * `design_generate_page` turns a natural-language brief into a complete page:
 * it detects the page type from keywords, picks the matching template, applies
 * a semantic style from adjectives (or a preset), and reports what was built.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateStore } from "../state.js";
import { applyPageTemplate } from "./design-tools.js";
import { applySemanticStyle } from "../semantics.js";
import { applyStyleTokenSet } from "../tokens.js";

export interface GeneratedPage {
  project_name: string;
  template: string;
  style: string;
  adjectives: string[];
  component_ids: string[];
  component_count: number;
  summary: string;
}

function detectTemplate(brief: string): string {
  const text = brief.toLowerCase();
  if (/电商|商店|商城|购物|商品|ecommerce|shop|product|sale/.test(text)) return "ecommerce_home";
  if (/博客|文章|blog|article|post/.test(text)) return "blog_post";
  if (/作品|作品集|portfolio|case|案例/.test(text)) return "portfolio";
  if (/仪表|看板|数据|管理后台|dashboard|admin|analytics/.test(text)) return "dashboard";
  return "saas_landing";
}

export function generatePage(
  brief: string,
  options: { style?: string; adjectives?: string[]; base_color?: string } = {}
): GeneratedPage {
  const template = detectTemplate(brief);
  const projectName = brief.trim().slice(0, 60) || "Untitled";
  const style = options.style || stateStore.getState().style || "minimal";

  // Start a fresh project for the generated page.
  stateStore.clearAll("ai");
  stateStore.setProjectName(projectName, "ai");
  stateStore.setStyle("minimal", "ai");

  let adjectives: string[] = [];
  if (options.adjectives && options.adjectives.length > 0) {
    const semantic = applySemanticStyle(brief, options.adjectives, style, options.base_color);
    adjectives = semantic.adjectives;
  } else {
    applyStyleTokenSet(stateStore, options.base_color, "ai");
  }

  const componentIds = applyPageTemplate(template);
  const state = stateStore.getState();
  return {
    project_name: state.projectName,
    template,
    style: state.style,
    adjectives,
    component_ids: componentIds,
    component_count: state.components.length,
    summary: `Generated "${template}" page from brief with ${componentIds.length} components (style: ${state.style}${adjectives.length ? ", adjectives: " + adjectives.join("/") : ""}).`,
  };
}

export function registerGeneratePageTool(server: McpServer): void {
  server.registerTool(
    "design_generate_page",
    {
      title: "Generate Page",
      description: `Generate a complete page from a natural-language brief.

Detects the page type from keywords (ecommerce / saas landing / blog / portfolio / dashboard),
applies a semantic style from adjectives (optional) or a style preset, and builds the page
with the matching template.

Args:
  - brief (string): What the page should be, e.g. "电商促销首页，主打夏季大促"
  - style (string, optional): Style preset (default: current style)
  - adjectives (string[], optional): Style adjectives for semantic mapping, e.g. ["温暖", "简约"]
  - base_color (string, optional): Base hex color`,
      inputSchema: {
        brief: z.string().min(1).describe("Natural-language brief"),
        style: z.string().optional(),
        adjectives: z.array(z.string()).optional(),
        base_color: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = generatePage(params.brief, {
          style: params.style,
          adjectives: params.adjectives,
          base_color: params.base_color,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `# Page Generated\n\n${result.summary}\n\nComponents: ${result.component_count}\nTemplate: ${result.template}\nIDs: ${result.component_ids.join(", ")}`,
            },
          ],
          structuredContent: { success: true, ...result },
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
