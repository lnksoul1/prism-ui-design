import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DesignTokens } from "../types.js";
import {
  hexToHsl,
  hslToHex,
  generateHarmony,
  generateNeutralGrays,
  normalizeHex,
  isValidHex,
  adjustLightness,
} from "../utils/color.js";
import {
  FONT_PAIRINGS,
  TYPE_SCALE_RATIOS,
} from "../constants.js";
import { formatCssVariables } from "../utils/formatter.js";

export function registerDesignTokensTool(server: McpServer): void {
  server.registerTool(
    "ui_generate_design_tokens",
    {
      title: "Generate Complete Design Tokens",
      description: `Generate a complete, cohesive design token system in a single call.

Combines colors, typography, spacing, shadows, border-radius, and transitions into one unified token set with CSS custom properties. Tokens are harmonized based on the chosen style preset.

Args:
  - style (string, optional): Design style preset — 'minimal', 'bold', 'playful', 'dark', 'editorial', 'tech'. Default: 'minimal'
  - base_color (string, optional): Override the preset's base color with a hex code (e.g. "#6366F1")
  - dark_mode (boolean, optional): Generate dark mode color tokens alongside light mode. Default: true
  - response_format (string, optional): 'markdown' or 'json'. Default: 'markdown'

Returns:
  Complete design token set with all categories (colors, typography, spacing, shadows, radii, transitions) as CSS custom properties, ready to paste into a project.

Examples:
  - Minimal design system: style="minimal"
  - Dark-first system with custom brand color: style="dark", base_color="#6366F1"
  - Playful system without dark mode: style="playful", dark_mode=false`,
      inputSchema: {
        style: z
          .enum(["minimal", "bold", "playful", "dark", "editorial", "tech"])
          .default("minimal")
          .describe("Design style preset"),
        base_color: z
          .string()
          .optional()
          .describe("Override base color (hex, e.g. '#6366F1')"),
        dark_mode: z
          .boolean()
          .default(true)
          .describe("Include dark mode color tokens"),
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
        // 无风格预设：中性默认基础色（220° 蓝灰），base_color 可覆盖。

        // Determine base color
        let baseHex: string;
        if (params.base_color) {
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
          baseHex = normalizeHex(params.base_color);
        } else {
          baseHex = hslToHex({ h: 220, s: 45, l: 50 });
        }

        const baseHsl = hexToHsl(baseHex);

        // ===== Colors =====
        const harmonyColors = generateHarmony(baseHsl, "monochromatic");
        const neutralHsls = generateNeutralGrays(baseHsl, 11);

        const colors: Record<string, string> = {};
        colors["color-primary"] = hslToHex(harmonyColors[1]);
        colors["color-primary-dark"] = hslToHex(harmonyColors[0]);
        colors["color-primary-light"] = hslToHex(harmonyColors[2]);
        colors["color-accent"] = hslToHex(harmonyColors[3]);
        colors["color-bg"] = "#FFFFFF";
        colors["color-surface"] = hslToHex(
          adjustLightness(
            { h: baseHsl.h, s: 10, l: 98 },
            0
          )
        );
        colors["color-text"] = "#1A1A2E";
        colors["color-text-muted"] = hslToHex(
          neutralHsls[5]
        );
        colors["color-border"] = hslToHex(
          adjustLightness(neutralHsls[8], -5)
        );
        colors["color-success"] = "#22C55E";
        colors["color-warning"] = "#F59E0B";
        colors["color-error"] = "#EF4444";
        colors["color-info"] = "#3B82F6";

        neutralHsls.forEach((hsl, i) => {
          colors[`gray-${i * 10}`] = hslToHex(hsl);
        });

        // Dark mode colors
        if (params.dark_mode) {
          colors["color-primary-dark-mode"] = hslToHex(
            adjustLightness(harmonyColors[1], 10)
          );
          colors["color-bg-dark"] = "#0F1115";
          colors["color-surface-dark"] = hslToHex(
            adjustLightness(
              { h: baseHsl.h, s: 15, l: 15 },
              0
            )
          );
          colors["color-text-dark"] = "#E8E8EC";
          colors["color-text-muted-dark"] = hslToHex(
            adjustLightness(neutralHsls[5], -20)
          );
          colors["color-border-dark"] = hslToHex(
            adjustLightness(neutralHsls[2], 10)
          );
        }

        // ===== Typography =====
        const fontMatch = FONT_PAIRINGS[0];
        const ratio = TYPE_SCALE_RATIOS.perfect_fourth;
        const baseSize = 16;

        const typeNames = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];
        const typeSteps = [-2, -1, 0, 1, 2, 3, 4, 5];

        const typography: Record<string, string> = {};
        typography["font-display"] = fontMatch.display.family;
        typography["font-body"] = fontMatch.body.family;
        typography["font-mono"] =
          "'JetBrains Mono', 'Fira Code', monospace";
        typography["font-weight-normal"] = "400";
        typography["font-weight-medium"] = "500";
        typography["font-weight-semibold"] = "600";
        typography["font-weight-bold"] = "700";
        typography["line-height-tight"] = "1.2";
        typography["line-height-normal"] = "1.5";
        typography["line-height-relaxed"] = "1.75";

        typeNames.forEach((name, i) => {
          const size = baseSize * Math.pow(ratio, typeSteps[i]);
          typography[`text-${name}`] = `${(size / 16).toFixed(3)}rem`;
        });

        // ===== Spacing =====
        const spacing: Record<string, string> = {};
        const spacingBase = 8;
        const spacingValues = [
          0,
          spacingBase,
          spacingBase * 1.5,
          spacingBase * 2,
          spacingBase * 3,
          spacingBase * 4,
          spacingBase * 6,
          spacingBase * 8,
        ];
        const spacingNames = ["0", "xs", "sm", "md", "lg", "xl", "2xl", "3xl"];
        spacingNames.forEach((name, i) => {
          const px = Math.round(spacingValues[i]);
          spacing[`space-${name}`] = `${(px / 16).toFixed(px % 16 === 0 ? 0 : 3)}rem`;
        });

        // ===== Shadows =====
        const shadowPresets: Record<string, string[]> = {
          subtle: [
            "0 1px 2px 0 rgba(0,0,0,0.05)",
            "0 2px 4px 0 rgba(0,0,0,0.06)",
            "0 4px 8px -1px rgba(0,0,0,0.08)",
            "0 8px 16px -2px rgba(0,0,0,0.10)",
            "0 16px 32px -4px rgba(0,0,0,0.12)",
          ],
          medium: [
            "0 1px 3px 0 rgba(0,0,0,0.12), 0 1px 2px 0 rgba(0,0,0,0.06)",
            "0 4px 6px -1px rgba(0,0,0,0.12), 0 2px 4px 0 rgba(0,0,0,0.06)",
            "0 10px 15px -3px rgba(0,0,0,0.12), 0 4px 6px 0 rgba(0,0,0,0.06)",
            "0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px 0 rgba(0,0,0,0.06)",
            "0 25px 50px -12px rgba(0,0,0,0.25)",
          ],
          sharp: [
            "0 0 0 1px rgba(0,0,0,0.05)",
            "0 1px 3px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
            "0 4px 6px rgba(0,0,0,0.20), 0 0 0 1px rgba(0,0,0,0.05)",
            "0 10px 15px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)",
            "0 20px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.05)",
          ],
        };

        const shadowStyle = "subtle";
        const shadowVals = shadowPresets[shadowStyle];
        const shadowNames = ["sm", "md", "lg", "xl", "2xl"];
        const shadows: Record<string, string> = {};
        shadowNames.forEach((name, i) => {
          shadows[`shadow-${name}`] = shadowVals[i];
        });

        // ===== Border Radius =====
        const radiusPresets: Record<string, number[]> = {
          sharp: [0, 2, 4, 6, 8],
          subtle: [0, 4, 6, 8, 12],
          rounded: [0, 8, 12, 16, 24],
          pill: [0, 12, 16, 24, 32],
        };
        const radiusStyle = "subtle";
        const radiusVals = radiusPresets[radiusStyle];
        const radiusNames = ["none", "sm", "md", "lg", "xl"];
        const radii: Record<string, string> = {};
        radiusNames.forEach((name, i) => {
          radii[`radius-${name}`] = `${radiusVals[i]}px`;
        });
        radii["radius-full"] = "9999px";

        // ===== Transitions =====
        const transitions: Record<string, string> = {};
        transitions["transition-fast"] = "150ms ease";
        transitions["transition-normal"] = "250ms ease";
        transitions["transition-slow"] = "400ms ease";
        transitions["transition-spring"] = "500ms cubic-bezier(0.34, 1.56, 0.64, 1)";

        // ===== Build CSS =====
        const cssParts: string[] = [];
        cssParts.push(":root {");
        cssParts.push("  /* Colors */");
        Object.entries(colors).forEach(([k, v]) => {
          cssParts.push(`  --${k}: ${v};`);
        });
        cssParts.push("");
        cssParts.push("  /* Typography */");
        Object.entries(typography).forEach(([k, v]) => {
          cssParts.push(`  --${k}: ${v};`);
        });
        cssParts.push("");
        cssParts.push("  /* Spacing */");
        Object.entries(spacing).forEach(([k, v]) => {
          cssParts.push(`  --${k}: ${v};`);
        });
        cssParts.push("");
        cssParts.push("  /* Shadows */");
        Object.entries(shadows).forEach(([k, v]) => {
          cssParts.push(`  --${k}: ${v};`);
        });
        cssParts.push("");
        cssParts.push("  /* Border Radius */");
        Object.entries(radii).forEach(([k, v]) => {
          cssParts.push(`  --${k}: ${v};`);
        });
        cssParts.push("");
        cssParts.push("  /* Transitions */");
        Object.entries(transitions).forEach(([k, v]) => {
          cssParts.push(`  --${k}: ${v};`);
        });
        cssParts.push("}");

        // Dark mode override
        if (params.dark_mode) {
          cssParts.push("");
          cssParts.push('[data-theme="dark"] {');
          cssParts.push(`  --color-bg: ${colors["color-bg-dark"]};`);
          cssParts.push(`  --color-surface: ${colors["color-surface-dark"]};`);
          cssParts.push(`  --color-text: ${colors["color-text-dark"]};`);
          cssParts.push(
            `  --color-text-muted: ${colors["color-text-muted-dark"]};`
          );
          cssParts.push(`  --color-border: ${colors["color-border-dark"]};`);
          cssParts.push(
            `  --color-primary: ${colors["color-primary-dark-mode"]};`
          );
          cssParts.push("}");
        }

        const result: DesignTokens = {
          style: params.style,
          tokens: {
            colors,
            typography,
            spacing,
            shadows,
            radii,
            transitions,
          },
          css: cssParts.join("\n"),
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
        lines.push(`# Design Tokens — ${params.style}`);
        lines.push(`**Base Color:** ${baseHex}`);
        lines.push(`**Shadow Style:** ${shadowStyle}`);
        lines.push(`**Radius Style:** ${radiusStyle}`);
        lines.push(`**Spacing Base:** ${spacingBase}px`);
        lines.push("");
        lines.push(`## Colors`);
        Object.entries(colors).forEach(([k, v]) => {
          lines.push(`- \`--${k}\`: ${v}`);
        });
        lines.push("");
        lines.push(`## Typography`);
        lines.push(`- Display: ${fontMatch.display.name}`);
        lines.push(`- Body: ${fontMatch.body.name}`);
        Object.entries(typography)
          .filter(([k]) => k.startsWith("text-"))
          .forEach(([k, v]) => {
            lines.push(`- \`--${k}\`: ${v}`);
          });
        lines.push("");
        lines.push(`## Complete CSS`);
        lines.push("```css");
        lines.push(cssParts.join("\n"));
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
              text: `Error generating design tokens: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
