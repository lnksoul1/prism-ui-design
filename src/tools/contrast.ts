import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ContrastResult } from "../types.js";
import {
  getContrastRatio,
  normalizeHex,
  isValidHex,
} from "../utils/color.js";

export function registerContrastTool(server: McpServer): void {
  server.registerTool(
    "ui_check_color_contrast",
    {
      title: "Check Color Contrast (WCAG)",
      description: `Check the WCAG 2.1 color contrast ratio between a foreground and background color.

Evaluates against WCAG AA (4.5:1 for normal text, 3:1 for large text) and AAA (7:1 for normal text, 4.5:1 for large text) standards.

Args:
  - foreground (string): Foreground/text hex color (e.g. "#333333")
  - background (string): Background hex color (e.g. "#FFFFFF")
  - response_format (string, optional): 'markdown' or 'json'. Default: 'markdown'

Returns:
  Contrast ratio, pass/fail for each WCAG level, overall grade, and actionable recommendations.

Examples:
  - Check dark text on white: foreground="#1A1A2E", background="#FFFFFF"
  - Check white text on blue: foreground="#FFFFFF", background="#3B82F6"
  - Check if a muted gray passes: foreground="#888888", background="#FFFFFF"`,
      inputSchema: {
        foreground: z
          .string()
          .min(3)
          .describe("Foreground/text hex color (e.g. '#333333' or '333333')"),
        background: z
          .string()
          .min(3)
          .describe("Background hex color (e.g. '#FFFFFF' or 'FFFFFF')"),
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
        if (!isValidHex(params.foreground)) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Invalid foreground hex color "${params.foreground}". Use format like "#333333" or "333".`,
              },
            ],
          };
        }
        if (!isValidHex(params.background)) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Invalid background hex color "${params.background}". Use format like "#FFFFFF" or "FFF".`,
              },
            ],
          };
        }

        const fg = normalizeHex(params.foreground);
        const bg = normalizeHex(params.background);
        const ratio = getContrastRatio(fg, bg);

        const aaNormal = ratio >= 4.5;
        const aaLarge = ratio >= 3;
        const aaaNormal = ratio >= 7;
        const aaaLarge = ratio >= 4.5;

        let grade: string;
        if (aaaNormal) grade = "AAA";
        else if (aaNormal) grade = "AA";
        else if (aaLarge) grade = "AA Large Text Only";
        else grade = "Fail";

        let recommendation: string;
        if (ratio < 3) {
          recommendation =
            "Contrast is too low for any text usage. Increase the lightness difference between foreground and background significantly.";
        } else if (ratio < 4.5) {
          recommendation =
            "Contrast passes for large text (18pt+ or 14pt+ bold) but fails for normal text. Consider darkening the foreground or lightening the background.";
        } else if (ratio < 7) {
          recommendation =
            "Contrast passes WCAG AA. Suitable for most text. For AAA compliance, increase contrast further.";
        } else {
          recommendation =
            "Excellent contrast. Passes all WCAG levels including AAA. Safe for all text sizes.";
        }

        const result: ContrastResult = {
          foreground: fg,
          background: bg,
          ratio: Math.round(ratio * 100) / 100,
          ratio_formatted: `${Math.round(ratio * 100) / 100}:1`,
          aa_normal: aaNormal,
          aa_large: aaLarge,
          aaa_normal: aaaNormal,
          aaa_large: aaaLarge,
          grade,
          recommendation,
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
        lines.push(`# Color Contrast Check`);
        lines.push("");
        lines.push(`| Property | Value |`);
        lines.push(`| --- | --- |`);
        lines.push(`| Foreground | ${fg} |`);
        lines.push(`| Background | ${bg} |`);
        lines.push(`| Contrast Ratio | **${result.ratio_formatted}** |`);
        lines.push(`| Grade | **${grade}** |`);
        lines.push("");
        lines.push(`## WCAG Compliance`);
        lines.push("");
        lines.push(`| Standard | Requirement | Result |`);
        lines.push(`| --- | --- | --- |`);
        lines.push(
          `| AA Normal Text | ≥ 4.5:1 | ${aaNormal ? "PASS" : "FAIL"} |`
        );
        lines.push(
          `| AA Large Text | ≥ 3.0:1 | ${aaLarge ? "PASS" : "FAIL"} |`
        );
        lines.push(
          `| AAA Normal Text | ≥ 7.0:1 | ${aaaNormal ? "PASS" : "FAIL"} |`
        );
        lines.push(
          `| AAA Large Text | ≥ 4.5:1 | ${aaaLarge ? "PASS" : "FAIL"} |`
        );
        lines.push("");
        lines.push(`## Recommendation`);
        lines.push(recommendation);

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error checking color contrast: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
