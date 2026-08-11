import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ShadowSystem, ShadowItem } from "../types.js";
import { formatCssVariables, markdownTable } from "../utils/formatter.js";

export function registerShadowTool(server: McpServer): void {
  server.registerTool(
    "ui_generate_shadow_system",
    {
      title: "Generate Shadow System",
      description: `Generate a cohesive elevation shadow system with multiple depth levels.

Supports three visual styles: subtle (soft, minimal), medium (balanced depth), and sharp (crisp, defined edges).

Args:
  - style (string, optional): Shadow visual style — 'subtle', 'medium', 'sharp'. Default: 'subtle'
  - response_format (string, optional): 'markdown' or 'json'. Default: 'markdown'

Returns:
  Shadow system with 5 elevation levels (sm, md, lg, xl, 2xl), CSS box-shadow values, usage guidance, and CSS custom properties.

Examples:
  - Subtle shadows for minimal design: style="subtle"
  - Sharp shadows for material/tech design: style="sharp"`,
      inputSchema: {
        style: z
          .enum(["subtle", "medium", "sharp"])
          .default("subtle")
          .describe("Shadow visual style"),
        response_format: z
          .enum(["markdown", "json"])
          .default("markdown")
          .describe("Output format"),
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
        const presets: Record<string, { shadow: string; usage: string }[]> = {
          subtle: [
            { shadow: "0 1px 2px 0 rgba(0,0,0,0.05)", usage: "Buttons, inputs, small cards" },
            { shadow: "0 2px 4px 0 rgba(0,0,0,0.06)", usage: "Cards, dropdowns, popovers" },
            { shadow: "0 4px 8px -1px rgba(0,0,0,0.08)", usage: "Hovered cards, sticky headers" },
            { shadow: "0 8px 16px -2px rgba(0,0,0,0.10)", usage: "Modals, floating panels" },
            { shadow: "0 16px 32px -4px rgba(0,0,0,0.12)", usage: "Full-screen overlays, dialogs" },
          ],
          medium: [
            { shadow: "0 1px 3px 0 rgba(0,0,0,0.12), 0 1px 2px 0 rgba(0,0,0,0.06)", usage: "Buttons, inputs, small cards" },
            { shadow: "0 4px 6px -1px rgba(0,0,0,0.12), 0 2px 4px 0 rgba(0,0,0,0.06)", usage: "Cards, dropdowns, popovers" },
            { shadow: "0 10px 15px -3px rgba(0,0,0,0.12), 0 4px 6px 0 rgba(0,0,0,0.06)", usage: "Hovered cards, sticky headers" },
            { shadow: "0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px 0 rgba(0,0,0,0.06)", usage: "Modals, floating panels" },
            { shadow: "0 25px 50px -12px rgba(0,0,0,0.25)", usage: "Full-screen overlays, dialogs" },
          ],
          sharp: [
            { shadow: "0 0 0 1px rgba(0,0,0,0.05)", usage: "Borders, outlined elements" },
            { shadow: "0 1px 3px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)", usage: "Cards, dropdowns, popovers" },
            { shadow: "0 4px 6px rgba(0,0,0,0.20), 0 0 0 1px rgba(0,0,0,0.05)", usage: "Hovered cards, sticky headers" },
            { shadow: "0 10px 15px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)", usage: "Modals, floating panels" },
            { shadow: "0 20px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.05)", usage: "Full-screen overlays, dialogs" },
          ],
        };

        const names = ["sm", "md", "lg", "xl", "2xl"];
        const preset = presets[params.style];

        const shadows: ShadowItem[] = names.map((name, i) => ({
          name: `shadow-${name}`,
          css: preset[i].shadow,
          usage: preset[i].usage,
        }));

        const cssVars: Record<string, string> = {};
        shadows.forEach((s) => {
          cssVars[s.name] = s.css;
        });

        const result: ShadowSystem = {
          style: params.style,
          shadows,
          css_variables: cssVars,
        };

        if (params.response_format === "json") {
          return {
            content: [
              { type: "text", text: JSON.stringify(result, null, 2) },
            ],
            structuredContent: result,
          };
        }

        const lines: string[] = [];
        lines.push(`# Shadow System — ${params.style}`);
        lines.push("");
        lines.push(
          markdownTable(
            ["Name", "CSS", "Usage"],
            shadows.map((s) => [s.name, `\`${s.css}\``, s.usage])
          )
        );
        lines.push("");
        lines.push(`## CSS Custom Properties`);
        lines.push("```css");
        lines.push(formatCssVariables(cssVars));
        lines.push("```");
        lines.push("");
        lines.push(`## Usage Example`);
        lines.push("```css");
        lines.push(".card {");
        lines.push("  box-shadow: var(--shadow-md);");
        lines.push("}");
        lines.push("");
        lines.push(".card:hover {");
        lines.push("  box-shadow: var(--shadow-lg);");
        lines.push("}");
        lines.push("```");

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error generating shadow system: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
