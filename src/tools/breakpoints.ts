import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BreakpointSystem, BreakpointItem } from "../types.js";
import { BREAKPOINT_PRESETS } from "../constants.js";
import { markdownTable } from "../utils/formatter.js";

export function registerBreakpointsTool(server: McpServer): void {
  server.registerTool(
    "ui_suggest_breakpoints",
    {
      title: "Suggest Responsive Breakpoints",
      description: `Generate a responsive breakpoint system with named breakpoints, container max-widths, and CSS media queries.

Supports popular frameworks (Tailwind, Bootstrap, Material) and custom breakpoints, with mobile-first or desktop-first strategies.

Args:
  - framework (string, optional): Breakpoint preset — 'tailwind', 'bootstrap', 'material', 'custom'. Default: 'tailwind'
  - strategy (string, optional): Media query strategy — 'mobile_first' (min-width) or 'desktop_first' (max-width). Default: 'mobile_first'
  - response_format (string, optional): 'markdown' or 'json'. Default: 'markdown'

Returns:
  Breakpoint definitions with px values, container max-widths, usage guidance, and ready-to-use CSS media queries.

Examples:
  - Tailwind mobile-first: framework="tailwind", strategy="mobile_first"
  - Bootstrap desktop-first: framework="bootstrap", strategy="desktop_first"
  - Custom simple breakpoints: framework="custom"`,
      inputSchema: {
        framework: z
          .enum(["tailwind", "bootstrap", "material", "custom"])
          .default("tailwind")
          .describe("Breakpoint preset framework"),
        strategy: z
          .enum(["mobile_first", "desktop_first"])
          .default("mobile_first")
          .describe("Media query strategy"),
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
        const preset = BREAKPOINT_PRESETS[params.framework];

        const breakpoints: BreakpointItem[] = preset.map((bp) => ({
          name: bp.name,
          min_width: bp.px === 0 ? "base" : `${bp.px}px`,
          px: bp.px,
          container_max: `${bp.container_max}px`,
          usage: bp.usage,
        }));

        // Generate CSS media queries
        const cssLines: string[] = [];
        if (params.strategy === "mobile_first") {
          cssLines.push("/* Mobile-first: Base styles apply to all screens */");
          breakpoints.forEach((bp, i) => {
            if (bp.px === 0) return;
            cssLines.push("");
            cssLines.push(`/* ${bp.name}: ${bp.usage} */`);
            cssLines.push(`@media (min-width: ${bp.px}px) {`);
            cssLines.push(`  .container { max-width: ${bp.container_max}; }`);
            cssLines.push(`}`);
          });
        } else {
          cssLines.push("/* Desktop-first: Base styles apply to largest screens */");
          const reversed = [...breakpoints].reverse();
          reversed.forEach((bp, i) => {
            const next = reversed[i + 1];
            if (!next) {
              cssLines.push(`/* Base: largest screens */`);
              cssLines.push(`.container { max-width: ${bp.container_max}; }`);
              return;
            }
            cssLines.push("");
            cssLines.push(`/* ${bp.name} and below: ${bp.usage} */`);
            cssLines.push(`@media (max-width: ${(next.px || 0) - 1}px) {`);
            cssLines.push(`  .container { max-width: ${bp.container_max}; }`);
            cssLines.push(`}`);
          });
        }

        const result: BreakpointSystem = {
          framework: params.framework,
          strategy: params.strategy,
          breakpoints,
          css: cssLines.join("\n"),
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
        lines.push(`# Responsive Breakpoints — ${params.framework}`);
        lines.push(`**Strategy:** ${params.strategy.replace("_", "-")}`);
        lines.push("");
        lines.push(
          markdownTable(
            ["Name", "Min Width", "Container Max", "Usage"],
            breakpoints.map((bp) => [
              bp.name,
              bp.min_width,
              bp.container_max,
              bp.usage,
            ])
          )
        );
        lines.push("");
        lines.push(`## CSS Media Queries`);
        lines.push("```css");
        lines.push(cssLines.join("\n"));
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
              text: `Error generating breakpoints: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
