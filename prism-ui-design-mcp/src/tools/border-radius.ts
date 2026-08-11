import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RadiusScale, RadiusItem } from "../types.js";
import { formatCssVariables, markdownTable } from "../utils/formatter.js";

export function registerBorderRadiusTool(server: McpServer): void {
  server.registerTool(
    "ui_generate_border_radius_scale",
    {
      title: "Generate Border Radius Scale",
      description: `Generate a border-radius scale with named levels from sharp to fully rounded.

Supports four visual styles: sharp (minimal radius), subtle (small radius), rounded (medium radius), and pill (large/pill radius).

Args:
  - style (string, optional): Radius visual style — 'sharp', 'subtle', 'rounded', 'pill'. Default: 'subtle'
  - response_format (string, optional): 'markdown' or 'json'. Default: 'markdown'

Returns:
  Border radius scale with 6 levels (none to full), px/rem values, usage guidance, and CSS custom properties.

Examples:
  - Subtle radius for minimal design: style="subtle"
  - Pill radius for playful design: style="pill"`,
      inputSchema: {
        style: z
          .enum(["sharp", "subtle", "rounded", "pill"])
          .default("subtle")
          .describe("Radius visual style"),
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
        const presets: Record<string, { px: number; usage: string }[]> = {
          sharp: [
            { px: 0, usage: "No rounding — data tables, code blocks" },
            { px: 2, usage: "Minimal rounding — subtle UI elements" },
            { px: 4, usage: "Small rounding — buttons, inputs, badges" },
            { px: 6, usage: "Medium rounding — cards, panels" },
            { px: 8, usage: "Large rounding — modals, containers" },
            { px: 9999, usage: "Full rounding — avatars, pills" },
          ],
          subtle: [
            { px: 0, usage: "No rounding — dividers, lines" },
            { px: 4, usage: "Small rounding — buttons, inputs, badges" },
            { px: 6, usage: "Medium rounding — cards, dropdowns" },
            { px: 8, usage: "Large rounding — panels, modals" },
            { px: 12, usage: "Extra large — containers, sections" },
            { px: 9999, usage: "Full rounding — avatars, pills" },
          ],
          rounded: [
            { px: 0, usage: "No rounding — full-bleed images" },
            { px: 8, usage: "Small rounding — buttons, inputs" },
            { px: 12, usage: "Medium rounding — cards, dropdowns" },
            { px: 16, usage: "Large rounding — panels, modals" },
            { px: 24, usage: "Extra large — containers, sections" },
            { px: 9999, usage: "Full rounding — avatars, pills" },
          ],
          pill: [
            { px: 0, usage: "No rounding — tables, code" },
            { px: 12, usage: "Small rounding — cards, inputs" },
            { px: 16, usage: "Medium rounding — panels, cards" },
            { px: 24, usage: "Large rounding — modals, containers" },
            { px: 32, usage: "Extra large — hero sections, big cards" },
            { px: 9999, usage: "Full rounding — buttons, avatars, pills" },
          ],
        };

        const names = ["none", "sm", "md", "lg", "xl", "full"];
        const preset = presets[params.style];

        const scale: RadiusItem[] = names.map((name, i) => ({
          name: `radius-${name}`,
          px: preset[i].px === 9999 ? "9999px" : `${preset[i].px}px`,
          rem: preset[i].px === 9999 ? "9999px" : `${(preset[i].px / 16).toFixed(preset[i].px % 16 === 0 ? 0 : 3)}rem`,
          usage: preset[i].usage,
        }));

        const cssVars: Record<string, string> = {};
        scale.forEach((s) => {
          cssVars[s.name] = s.px;
        });

        const result: RadiusScale = {
          style: params.style,
          scale,
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
        lines.push(`# Border Radius Scale — ${params.style}`);
        lines.push("");
        lines.push(
          markdownTable(
            ["Name", "Value", "REM", "Usage"],
            scale.map((s) => [s.name, s.px, s.rem, s.usage])
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
        lines.push(".button { border-radius: var(--radius-sm); }");
        lines.push(".card { border-radius: var(--radius-md); }");
        lines.push(".avatar { border-radius: var(--radius-full); }");
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
              text: `Error generating border radius scale: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
