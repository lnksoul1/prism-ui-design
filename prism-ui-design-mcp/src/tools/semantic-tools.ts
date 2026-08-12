/**
 * Semantic style tool (improvement plan C1):
 *   - design_semantic_style
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { applySemanticStyle, ADJECTIVE_LEXICON } from "../semantics.js";

export function registerSemanticStyleTool(server: McpServer): void {
  server.registerTool(
    "design_semantic_style",
    {
      title: "Apply Semantic Style",
      description: `Translate natural-language style adjectives into concrete design tokens.

The user's description + adjectives are mapped to measurable deltas (hue,
saturation, lightness, radius, shadow, font mood); every applied token records
its reason so the decision stays traceable.

Args:
  - description (string): Free-form style description (e.g. "看起来专业、温暖的主页")
  - adjectives (string[]): One or more style adjectives (Chinese or English), e.g. ["专业", "温暖"]
  - base_style (string, optional): Style preset to start from (default: current style)
  - base_color (string, optional): Base hex color (default: preset color)

Example:
  design_semantic_style(description="温和的落地页", adjectives=["温暖", "简约"])`,
      inputSchema: {
        description: z.string().min(1).describe("Natural-language style description"),
        adjectives: z.array(z.string().min(1)).min(1).describe("Style adjectives"),
        base_style: z.string().optional(),
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
        const result = applySemanticStyle(
          params.description,
          params.adjectives,
          params.base_style,
          params.base_color
        );
        const lines = [
          `# Semantic Style Applied`,
          ``,
          result.summary,
          ``,
          `**Base style:** ${result.base_style}`,
          `**Base color:** ${result.base_color}`,
          `**Token decisions:** ${result.decisions.length}`,
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

/** Known adjective keys (used by the capabilities manifest). */
export function adjectiveCatalog(): string[] {
  return [...new Set(Object.keys(ADJECTIVE_LEXICON))].sort();
}
