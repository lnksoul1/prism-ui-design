import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ColorPalette,
  PaletteColor,
} from "../types.js";
import {
  hexToHsl,
  hslToHex,
  getColorInfo,
  generateHarmony,
  generateNeutralGrays,
  generateTints,
  generateShades,
  normalizeHex,
  isValidHex,
  HarmonyScheme,
} from "../utils/color.js";
import { formatCssVariables, markdownTable } from "../utils/formatter.js";

const ROLES: Record<string, string[]> = {
  monochromatic: ["Primary Dark", "Primary", "Primary Light", "Accent Light", "Background"],
  analogous: ["Secondary", "Primary Support", "Primary", "Accent", "Highlight"],
  complementary: ["Primary Dark", "Primary", "Background", "Complement", "Complement Dark"],
  split_complementary: ["Primary", "Background", "Split 1", "Split 2", "Neutral"],
  triadic: ["Primary", "Tertiary 1", "Tertiary 2", "Background", "Accent Light"],
  tetradic: ["Primary", "Color 2", "Complement", "Color 4", "Background"],
};

const USAGES: Record<string, string[]> = {
  monochromatic: [
    "Navigation bars, sidebar, active states",
    "Primary buttons, links, focus rings",
    "Hover states, secondary buttons",
    "Badges, highlights, callouts",
    "Page background, card surfaces",
  ],
  analogous: [
    "Secondary buttons, info badges",
    "Supporting elements, tooltips",
    "Primary actions, key CTAs",
    "Accents, notifications, badges",
    "Hero sections, gradient backgrounds",
  ],
  complementary: [
    "Footer, dark sections, headers",
    "Primary buttons, links, brand color",
    "Page background, light surfaces",
    "CTA buttons, important alerts",
    "Hover states, emphasis elements",
  ],
  split_complementary: [
    "Primary brand, buttons, links",
    "Background, card surfaces",
    "Success states, positive feedback",
    "Warning states, attention elements",
    "Borders, dividers, muted text",
  ],
  triadic: [
    "Primary brand, main CTAs",
    "Info badges, secondary actions",
    "Warning badges, alerts",
    "Background, surfaces",
    "Hover states, highlights",
  ],
  tetradic: [
    "Primary brand identity",
    "Secondary section themes",
    "Complementary CTA color",
    "Tertiary accent color",
    "Background, neutral surfaces",
  ],
};

export function registerColorPaletteTool(server: McpServer): void {
  server.registerTool(
    "ui_generate_color_palette",
    {
      title: "Generate Color Palette",
      description: `Generate a cohesive, harmonious color palette from a base color using color theory principles.

Supports multiple harmony schemes: monochromatic, analogous, complementary, split_complementary, triadic, and tetradic.
Also generates neutral grays and semantic color roles (primary, secondary, accent, background, etc.).

Args:
  - base_color (string, optional): Hex color code (e.g. "#3B82F6" or "3B82F6"). If omitted, a color is derived from the style preset.
  - scheme (string, optional): Harmony scheme — 'monochromatic', 'analogous', 'complementary', 'split_complementary', 'triadic', 'tetradic'. Default: 'monochromatic'
  - style (string, optional): Style preset — 'minimal', 'bold', 'playful', 'dark', 'editorial', 'tech'. Used when base_color is omitted. Default: 'minimal'
  - include_neutrals (boolean, optional): Include a 11-step neutral gray scale. Default: true
  - response_format (string, optional): 'markdown' or 'json'. Default: 'markdown'

Returns:
  A color palette with hex/rgb/hsl values, semantic role assignments, usage guidance, and CSS custom properties.

Examples:
  - Generate a triadic palette from blue: base_color="#3B82F6", scheme="triadic"
  - Generate a minimal palette without neutrals: style="minimal", include_neutrals=false
  - Generate a complementary palette for a dark theme: base_color="#10B981", scheme="complementary"`,
      inputSchema: {
        base_color: z
          .string()
          .optional()
          .describe("Hex color code (e.g. '#3B82F6' or '3B82F6'). Omit to use style preset."),
        scheme: z
          .enum([
            "monochromatic",
            "analogous",
            "complementary",
            "split_complementary",
            "triadic",
            "tetradic",
          ])
          .default("monochromatic")
          .describe("Color harmony scheme"),
        style: z
          .enum(["minimal", "bold", "playful", "dark", "editorial", "tech"])
          .default("minimal")
          .describe("Style preset (used when base_color is omitted)"),
        include_neutrals: z
          .boolean()
          .default(true)
          .describe("Include 11-step neutral gray scale"),
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
        // Determine base color
        let baseHex: string;
        if (params.base_color) {
          if (!isValidHex(params.base_color)) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Invalid hex color "${params.base_color}". Use format like "#3B82F6" or "3B82F6".`,
                },
              ],
            };
          }
          baseHex = normalizeHex(params.base_color);
        } else {
          // 无风格预设：中性默认基础色
          baseHex = hslToHex({ h: 220, s: 45, l: 50 });
        }

        const baseHsl = hexToHsl(baseHex);
        const scheme = params.scheme as HarmonyScheme;
        const harmonyColors = generateHarmony(baseHsl, scheme);

        const roleNames = ROLES[scheme] || ROLES.monochromatic;
        const usageNames = USAGES[scheme] || USAGES.monochromatic;

        const colors: PaletteColor[] = harmonyColors.map((hsl, i) => {
          const hex = hslToHex(hsl);
          const info = getColorInfo(hex);
          return {
            hex: info.hex,
            rgb: info.rgb,
            hsl: info.hsl,
            role: roleNames[i] || `Color ${i + 1}`,
            usage: usageNames[i] || "General use",
          };
        });

        // Build CSS variables
        const cssVars: Record<string, string> = {};
        colors.forEach((c, i) => {
          const prefix = i === 0 ? "color-primary" : `color-${i}`;
          cssVars[prefix] = c.hex;
        });

        // Add neutrals if requested
        let neutralColors: PaletteColor[] = [];
        if (params.include_neutrals) {
          const neutralHsls = generateNeutralGrays(baseHsl, 11);
          neutralColors = neutralHsls.map((hsl, i) => {
            const hex = hslToHex(hsl);
            const info = getColorInfo(hex);
            const step = i * 10;
            return {
              hex: info.hex,
              rgb: info.rgb,
              hsl: info.hsl,
              role: `Gray ${step}`,
              usage:
                i === 0
                  ? "Pure black / darkest surface"
                  : i === 10
                  ? "Pure white / lightest surface"
                  : i < 5
                  ? "Dark surfaces, text on light backgrounds"
                  : "Light surfaces, borders, muted backgrounds",
            };
          });

          neutralColors.forEach((c, i) => {
            cssVars[`gray-${i * 10}`] = c.hex;
          });
        }

        const palette: ColorPalette = {
          scheme: params.scheme,
          base_color: baseHex,
          colors: colors,
          css_variables: cssVars,
        };

        if (params.response_format === "json") {
          return {
            content: [
              { type: "text", text: JSON.stringify(palette, null, 2) },
            ],
            structuredContent: palette,
          };
        }

        // Markdown format
        const lines: string[] = [];
        lines.push(`# Color Palette — ${params.scheme}`);
        lines.push("");
        lines.push(`**Base Color:** ${baseHex}`);
        lines.push("");

        lines.push("## Harmony Colors");
        lines.push("");
        lines.push(
          markdownTable(
            ["Role", "Hex", "RGB", "HSL", "Usage"],
            colors.map((c) => [
              c.role,
              c.hex,
              c.rgb,
              c.hsl,
              c.usage,
            ])
          )
        );
        lines.push("");

        if (params.include_neutrals && neutralColors.length > 0) {
          lines.push("## Neutral Grays");
          lines.push("");
          lines.push(
            markdownTable(
              ["Role", "Hex", "RGB", "HSL", "Usage"],
              neutralColors.map((c) => [
                c.role,
                c.hex,
                c.rgb,
                c.hsl,
                c.usage,
              ])
            )
          );
          lines.push("");
        }

        lines.push("## CSS Custom Properties");
        lines.push("```css");
        lines.push(formatCssVariables(cssVars));
        lines.push("```");

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: palette,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error generating color palette: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
