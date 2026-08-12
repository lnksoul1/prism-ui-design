/**
 * Style-guide tools (functional plan F7):
 *   - design_get_style_guide
 *   - design_apply_style_guide
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { STYLE_GUIDES, applyStyleGuide, matchStyleGuide } from "../style-guides.js";

export function registerStyleGuideTools(server: McpServer): void {
  server.registerTool(
    "design_get_style_guide",
    {
      title: "Get Style Guide",
      description: `Look up a named style guide by id or fuzzy keyword match.

Available guides: ${STYLE_GUIDES.map((g) => g.id).join(", ")}.

Args:
  - tag (string, optional): Guide id or keyword (omit to list all guides)`,
      inputSchema: {
        tag: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        if (!params.tag) {
          return {
            content: [
              {
                type: "text" as const,
                text: `# Style Guides (${STYLE_GUIDES.length})\n\n${STYLE_GUIDES.map((g) => `- ${g.id} — ${g.name}: ${g.description}`).join("\n")}`,
              },
            ],
            structuredContent: { success: true, guides: STYLE_GUIDES },
          };
        }
        const guide = matchStyleGuide(params.tag);
        if (!guide) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No style guide matched "${params.tag}". Available: ${STYLE_GUIDES.map((g) => g.id).join(", ")}`,
              },
            ],
            structuredContent: { success: false, matched: null },
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `# ${guide.name} (${guide.id})\n\n${guide.description}\n\nToken overrides: ${Object.keys(guide.tokens).length} groups\nVariant hints: ${JSON.stringify(guide.variantHints)}`,
            },
          ],
          structuredContent: { success: true, guide },
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

  server.registerTool(
    "design_apply_style_guide",
    {
      title: "Apply Style Guide",
      description: `Apply a named style guide on top of a base style preset.

Args:
  - tag (string): Guide id or keyword (e.g. "glassmorphism", "brutalist")
  - base_style (string, optional): Base style preset (default: current style)`,
      inputSchema: {
        tag: z.string().min(1).describe("Style guide id or keyword"),
        base_style: z.string().optional(),
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
        const result = applyStyleGuide(params.tag, params.base_style);
        const lines = [
          `# Style Guide Applied: ${result.guide_name} (${result.guide_id})`,
          ``,
          `Base style: ${result.base_style}`,
          `Overrides: ${result.overrides.length}`,
          ...result.overrides.map((o) => `- ${o.category}.${o.key} = ${o.value}`),
        ].join("\n");
        return {
          content: [{ type: "text" as const, text: lines }],
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
