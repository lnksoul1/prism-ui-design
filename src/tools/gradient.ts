import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GradientResult } from "../types.js";
import {
  hexToHsl,
  hslToHex,
  normalizeHex,
  isValidHex,
  adjustHue,
  adjustLightness,
} from "../utils/color.js";

export function registerGradientTool(server: McpServer): void {
  server.registerTool(
    "ui_generate_gradient",
    {
      title: "Generate Gradient",
      description: `Generate a CSS gradient from a base color with automatic color stop generation.

Supports linear and radial gradients with configurable angle and number of stops. Color stops are generated using color theory for harmonious transitions.

Args:
  - base_color (string): Hex color code for the gradient base (e.g. "#6366F1")
  - type (string, optional): Gradient type — 'linear' or 'radial'. Default: 'linear'
  - angle (number, optional): Gradient angle in degrees for linear gradients (0-360). Default: 135
  - stops (number, optional): Number of color stops (2-5). Default: 3
  - direction (string, optional): Color shift direction — 'analogous' (nearby hues), 'complementary' (opposite hue), 'triadic' (spread hues). Default: 'analogous'
  - response_format (string, optional): 'markdown' or 'json'. Default: 'markdown'

Returns:
  CSS gradient string, color stops, and raw values.

Examples:
  - Purple linear gradient: base_color="#6366F1", angle=135
  - Blue to orange complementary gradient: base_color="#3B82F6", direction="complementary"
  - Radial triadic gradient: base_color="#10B981", type="radial", direction="triadic"`,
      inputSchema: {
        base_color: z
          .string()
          .min(3)
          .describe("Base hex color (e.g. '#6366F1' or '6366F1')"),
        type: z
          .enum(["linear", "radial"])
          .default("linear")
          .describe("Gradient type"),
        angle: z
          .number()
          .int()
          .min(0)
          .max(360)
          .default(135)
          .describe("Angle in degrees (linear only)"),
        stops: z
          .number()
          .int()
          .min(2)
          .max(5)
          .default(3)
          .describe("Number of color stops (2-5)"),
        direction: z
          .enum(["analogous", "complementary", "triadic"])
          .default("analogous")
          .describe("Color shift direction"),
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
        if (!isValidHex(params.base_color)) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Invalid hex color "${params.base_color}". Use format like "#6366F1" or "6366F1".`,
              },
            ],
          };
        }

        const baseHex = normalizeHex(params.base_color);
        const baseHsl = hexToHsl(baseHex);

        // Generate color stops based on direction
        const hueShifts: Record<string, number[]> = {
          analogous: [0, 20, 40, 60, 80],
          complementary: [0, 45, 90, 135, 180],
          triadic: [0, 60, 120, 180, 240],
        };

        const shifts = hueShifts[params.direction].slice(0, params.stops);
        const colors: string[] = shifts.map((shift, i) => {
          let hsl = adjustHue(baseHsl, shift);
          // Add slight lightness variation for depth
          const lightnessAdjust = (i / (shifts.length - 1)) * 10 - 5;
          hsl = adjustLightness(hsl, lightnessAdjust);
          return hslToHex(hsl);
        });

        // Build gradient string
        const stopPositions = colors.map(
          (_, i) => `${colors[i]} ${Math.round((i / (colors.length - 1)) * 100)}%`
        );

        let css: string;
        if (params.type === "linear") {
          css = `linear-gradient(${params.angle}deg, ${stopPositions.join(", ")})`;
        } else {
          css = `radial-gradient(circle at center, ${stopPositions.join(", ")})`;
        }

        const result: GradientResult = {
          type: params.type,
          css,
          colors,
          angle: params.type === "linear" ? `${params.angle}deg` : "center",
          raw_stops: stopPositions,
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
        lines.push(`# Gradient — ${params.type}`);
        lines.push("");
        lines.push(`**Base Color:** ${baseHex}`);
        lines.push(`**Direction:** ${params.direction}`);
        if (params.type === "linear") {
          lines.push(`**Angle:** ${params.angle}°`);
        }
        lines.push("");
        lines.push(`## CSS`);
        lines.push("```css");
        lines.push(`background: ${css};`);
        lines.push("```");
        lines.push("");
        lines.push(`## Color Stops`);
        colors.forEach((color, i) => {
          const pos = Math.round((i / (colors.length - 1)) * 100);
          lines.push(`${i + 1}. ${color} (${pos}%)`);
        });
        lines.push("");
        lines.push(`## Usage Example`);
        lines.push("```css");
        lines.push(".hero {");
        lines.push(`  background: ${css};`);
        lines.push("  min-height: 400px;");
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
              text: `Error generating gradient: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
