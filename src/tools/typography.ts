import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  FontPairing,
  TypographyScale,
  TypeScaleItem,
} from "../types.js";
import {
  FONT_PAIRINGS,
  TYPE_SCALE_RATIOS,
} from "../constants.js";
import { markdownTable } from "../utils/formatter.js";

export function registerTypographyTool(server: McpServer): void {
  server.registerTool(
    "ui_suggest_typography",
    {
      title: "Suggest Typography Pairing",
      description: `Suggest a curated font pairing (display + body font) based on a design style.

Provides Google Fonts import links, CSS font-family declarations, recommended weights, and usage notes.

Args:
  - style (string, optional): Design style — 'minimal', 'bold', 'editorial', 'playful', 'tech'. Default: 'minimal'
  - category (string, optional): Font category preference — 'any', 'sans-serif', 'serif', 'mixed'. Default: 'any'
  - response_format (string, optional): 'markdown' or 'json'. Default: 'markdown'

Returns:
  Font pairing with display font, body font, Google Fonts link, CSS snippet, and usage notes.

Examples:
  - Get a minimal font pairing: style="minimal"
  - Get a tech-focused serif+sans mix: style="tech", category="mixed"
  - Get editorial pairings: style="editorial"`,
      inputSchema: {
        style: z
          .enum(["minimal", "bold", "editorial", "playful", "tech"])
          .default("minimal")
          .describe("Design style for font pairing"),
        category: z
          .enum(["any", "sans-serif", "serif", "mixed"])
          .default("any")
          .describe("Font category preference"),
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
        // Filter by style
        let candidates = FONT_PAIRINGS.filter(
          (p) => p.style === params.style
        );

        // Filter by category if specified
        if (params.category === "sans-serif") {
          candidates = candidates.filter(
            (p) =>
              p.display.category === "sans-serif" &&
              p.body.category === "sans-serif"
          );
        } else if (params.category === "serif") {
          candidates = candidates.filter(
            (p) =>
              p.display.category === "serif" && p.body.category === "serif"
          );
        } else if (params.category === "mixed") {
          candidates = candidates.filter(
            (p) => p.display.category !== p.body.category
          );
        }

        // Fallback to any style if no matches
        if (candidates.length === 0) {
          candidates = FONT_PAIRINGS;
        }

        // Pick first match (deterministic)
        const match = candidates[0];

        // Build Google Fonts link
        const displayWeights = match.display.weights.join(";");
        const bodyWeights = match.body.weights.join(";");
        const displayName = match.display.name.replace(/ /g, "+");
        const bodyName = match.body.name.replace(/ /g, "+");

        const googleFontsLink = `https://fonts.googleapis.com/css2?family=${displayName}:wght@${displayWeights}&family=${bodyName}:wght@${bodyWeights}&display=swap`;

        const cssSnippet = [
          `/* Display / Headings */`,
          `h1, h2, h3, h4, h5, h6 {`,
          `  font-family: ${match.display.family};`,
          `  font-weight: ${match.display.weights[match.display.weights.length - 2] || 600};`,
          `  letter-spacing: -0.02em;`,
          `}`,
          ``,
          `/* Body Text */`,
          `body, p, span, li, a {`,
          `  font-family: ${match.body.family};`,
          `  font-weight: 400;`,
          `  line-height: 1.6;`,
          `}`,
        ].join("\n");

        const pairing: FontPairing = {
          display_font: {
            name: match.display.name,
            family: match.display.family,
            category: match.display.category,
            weights: match.display.weights,
            fallback: match.display.fallback,
          },
          body_font: {
            name: match.body.name,
            family: match.body.family,
            category: match.body.category,
            weights: match.body.weights,
            fallback: match.body.fallback,
          },
          style: params.style,
          google_fonts_link: googleFontsLink,
          css_snippet: cssSnippet,
          usage_notes: match.notes,
        };

        if (params.response_format === "json") {
          return {
            content: [
              { type: "text", text: JSON.stringify(pairing, null, 2) },
            ],
            structuredContent: pairing,
          };
        }

        // Markdown
        const lines: string[] = [];
        lines.push(`# Typography Pairing — ${params.style}`);
        lines.push("");
        lines.push(`## Display Font: ${match.display.name}`);
        lines.push(`- **Category:** ${match.display.category}`);
        lines.push(`- **Weights:** ${match.display.weights.join(", ")}`);
        lines.push(`- **CSS:** \`font-family: ${match.display.family};\``);
        lines.push("");
        lines.push(`## Body Font: ${match.body.name}`);
        lines.push(`- **Category:** ${match.body.category}`);
        lines.push(`- **Weights:** ${match.body.weights.join(", ")}`);
        lines.push(`- **CSS:** \`font-family: ${match.body.family};\``);
        lines.push("");
        lines.push(`## Google Fonts Import`);
        lines.push("```html");
        lines.push(
          `<link rel="preconnect" href="https://fonts.googleapis.com">`
        );
        lines.push(
          `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
        );
        lines.push(`<link href="${googleFontsLink}" rel="stylesheet">`);
        lines.push("```");
        lines.push("");
        lines.push(`## CSS`);
        lines.push("```css");
        lines.push(cssSnippet);
        lines.push("```");
        lines.push("");
        lines.push(`## Usage Notes`);
        match.notes.forEach((note) => {
          lines.push(`- ${note}`);
        });

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: pairing,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error suggesting typography: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ===== Type Scale Tool =====

  server.registerTool(
    "ui_generate_type_scale",
    {
      title: "Generate Type Scale",
      description: `Generate a modular typography scale using a chosen ratio.

Produces a full set of type sizes from 'xs' to '4xl' with px, rem, line-height, weight, and usage recommendations.

Args:
  - base_size (number, optional): Base font size in px. Default: 16
  - ratio (string, optional): Scale ratio — 'minor_second' (1.067), 'major_second' (1.125), 'minor_third' (1.2), 'major_third' (1.25), 'perfect_fourth' (1.333), 'augmented_fourth' (1.414), 'perfect_fifth' (1.5), 'golden_ratio' (1.618). Default: 'perfect_fourth'
  - response_format (string, optional): 'markdown' or 'json'. Default: 'markdown'

Returns:
  Typography scale with named sizes, px/rem values, line heights, and CSS variables.

Examples:
  - Golden ratio scale: ratio="golden_ratio"
  - Large base with perfect fifth: base_size=18, ratio="perfect_fifth"`,
      inputSchema: {
        base_size: z
          .number()
          .int()
          .min(12)
          .max(24)
          .default(16)
          .describe("Base font size in px (12-24)"),
        ratio: z
          .enum([
            "minor_second",
            "major_second",
            "minor_third",
            "major_third",
            "perfect_fourth",
            "augmented_fourth",
            "perfect_fifth",
            "golden_ratio",
          ])
          .default("perfect_fourth")
          .describe("Modular scale ratio"),
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
        const ratioValue = TYPE_SCALE_RATIOS[params.ratio];
        const base = params.base_size;

        const scaleNames = [
          { name: "xs", steps: -2, weight: 400, lh: 1.5, usage: "Captions, footnotes, small print" },
          { name: "sm", steps: -1, weight: 400, lh: 1.5, usage: "Secondary text, table cells, labels" },
          { name: "base", steps: 0, weight: 400, lh: 1.6, usage: "Body text, paragraphs, default" },
          { name: "lg", steps: 1, weight: 500, lh: 1.5, usage: "Lead paragraphs, card titles" },
          { name: "xl", steps: 2, weight: 600, lh: 1.4, usage: "Section headings (h3)" },
          { name: "2xl", steps: 3, weight: 600, lh: 1.3, usage: "Page subheadings (h2)" },
          { name: "3xl", steps: 4, weight: 700, lh: 1.2, usage: "Page headings (h1)" },
          { name: "4xl", steps: 5, weight: 700, lh: 1.1, usage: "Hero text, display headlines" },
        ];

        const scaleItems: TypeScaleItem[] = scaleNames.map((item) => {
          const size = base * Math.pow(ratioValue, item.steps);
          return {
            name: item.name,
            size: `${Math.round(size * 100) / 100}px`,
            rem: `${Math.round((size / base) * 1000) / 1000}rem`,
            line_height: item.lh.toString(),
            weight: item.weight,
            usage: item.usage,
          };
        });

        const cssVars: Record<string, string> = {};
        scaleItems.forEach((item) => {
          cssVars[`text-${item.name}`] = `${item.rem}`;
        });

        const result: TypographyScale = {
          base_size: base,
          ratio: `${params.ratio} (${ratioValue})`,
          scale: scaleItems,
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
        lines.push(`# Type Scale — ${params.ratio} (${ratioValue})`);
        lines.push(`**Base size:** ${base}px`);
        lines.push("");
        lines.push(
          markdownTable(
            ["Name", "Size", "REM", "Line Height", "Weight", "Usage"],
            scaleItems.map((s) => [
              s.name,
              s.size,
              s.rem,
              s.line_height,
              s.weight.toString(),
              s.usage,
            ])
          )
        );
        lines.push("");
        lines.push(`## CSS Variables`);
        lines.push("```css");
        Object.entries(cssVars).forEach(([key, value]) => {
          lines.push(`  --${key}: ${value};`);
        });
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
              text: `Error generating type scale: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
