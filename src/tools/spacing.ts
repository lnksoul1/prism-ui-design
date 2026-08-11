import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SpacingScale, SpacingItem } from "../types.js";
import { formatCssVariables, markdownTable } from "../utils/formatter.js";

export function registerSpacingTool(server: McpServer): void {
  server.registerTool(
    "ui_generate_spacing_scale",
    {
      title: "Generate Spacing Scale",
      description: `Generate a consistent spacing scale for layout and component spacing.

Supports multiple generation strategies: linear (equal steps), geometric (exponential growth), and fibonacci (golden ratio progression).

Args:
  - base_unit (number, optional): Base unit in px — 4 or 8. Default: 8
  - strategy (string, optional): Generation strategy — 'linear', 'geometric', 'fibonacci'. Default: 'geometric'
  - response_format (string, optional): 'markdown' or 'json'. Default: 'markdown'

Returns:
  Spacing scale with named steps (0 to 3xl), px/rem values, usage guidance, and CSS custom properties.

Examples:
  - 8px geometric scale (most common): base_unit=8, strategy="geometric"
  - 4px fibonacci scale for fine control: base_unit=4, strategy="fibonacci"
  - 8px linear scale: base_unit=8, strategy="linear"`,
      inputSchema: {
        base_unit: z
          .number()
          .int()
          .refine((n) => n === 4 || n === 8, "Must be 4 or 8")
          .default(8)
          .describe("Base unit in px (4 or 8)"),
        strategy: z
          .enum(["linear", "geometric", "fibonacci"])
          .default("geometric")
          .describe("Scale generation strategy"),
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
        const base = params.base_unit;
        const names = [
          { name: "0", usage: "No spacing — flush elements" },
          { name: "xs", usage: "Tight spacing — icon-to-text, inline gaps" },
          { name: "sm", usage: "Small spacing — compact component padding" },
          { name: "md", usage: "Default spacing — standard padding, gaps" },
          { name: "lg", usage: "Section padding, card spacing" },
          { name: "xl", usage: "Large section gaps, sidebar margins" },
          { name: "2xl", usage: "Page section spacing" },
          { name: "3xl", usage: "Hero spacing, large page gaps" },
        ];

        let values: number[];

        if (params.strategy === "linear") {
          values = [0, base, base * 2, base * 3, base * 4, base * 6, base * 8, base * 12];
        } else if (params.strategy === "geometric") {
          values = [0, base, base * 1.5, base * 2, base * 3, base * 4, base * 6, base * 8];
        } else {
          // fibonacci
          values = [0, base, base * 1.5, base * 2.5, base * 4, base * 6.5, base * 10.5, base * 17];
        }

        const scaleItems: SpacingItem[] = names.map((item, i) => {
          const px = Math.round(values[i]);
          return {
            name: item.name,
            px,
            rem: `${(px / 16).toFixed(px % 16 === 0 ? 0 : 3)}rem`,
            usage: item.usage,
          };
        });

        const cssVars: Record<string, string> = {};
        scaleItems.forEach((item) => {
          cssVars[`space-${item.name}`] = item.rem;
        });

        const result: SpacingScale = {
          base_unit: base,
          strategy: params.strategy,
          scale: scaleItems,
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
        lines.push(`# Spacing Scale — ${params.strategy} (base: ${base}px)`);
        lines.push("");
        lines.push(
          markdownTable(
            ["Name", "PX", "REM", "Usage"],
            scaleItems.map((s) => [s.name, `${s.px}px`, s.rem, s.usage])
          )
        );
        lines.push("");
        lines.push(`## CSS Custom Properties`);
        lines.push("```css");
        lines.push(formatCssVariables(cssVars));
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
              text: `Error generating spacing scale: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
