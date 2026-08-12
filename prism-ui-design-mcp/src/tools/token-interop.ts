/**
 * Design-token interchange tools (improvement plan B3):
 *   - design_export_tokens  → dtcg | css | style-dictionary | figma_tokens
 *   - design_import_tokens  → DTCG JSON with merge strategies
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateStore } from "../state.js";
import {
  applyImportedTokens,
  dtcgToTokenMaps,
  tokensToCss,
  tokensToDesignMd,
  tokensToDtcg,
  tokensToStyleDictionary,
  type DtcgExportFormat,
} from "../tokens/dtcgi.js";

export function registerTokenInteropTools(server: McpServer): void {
  server.registerTool(
    "design_export_tokens",
    {
      title: "Export Design Tokens",
      description: `Export the current design tokens in a standard interchange format.

Supported formats:
  - dtcg: W3C Design Tokens Community Group JSON ($value/$type/$description)
  - css: Flat CSS custom properties (:root { --token: value; })
  - style-dictionary: Nested Style Dictionary JSON (category → token → value)
  - figma_tokens: Figma Tokens plugin compatible JSON (DTCG-shaped)
  - design_md: Google DESIGN.md document (YAML front matter + prose)

Args:
  - format (string): 'dtcg' | 'css' | 'style-dictionary' | 'figma_tokens' | 'design_md'`,
      inputSchema: {
        format: z
          .enum(["dtcg", "css", "style-dictionary", "figma_tokens", "design_md"])
          .describe("Export format"),
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
        const state = stateStore.getState();
        const tokens = state.tokens;
        const format = params.format as DtcgExportFormat;
        const data =
          format === "css"
            ? tokensToCss(tokens)
            : format === "style-dictionary"
              ? JSON.stringify(tokensToStyleDictionary(tokens), null, 2)
              : format === "design_md"
                ? tokensToDesignMd(tokens, state.projectName || "Prism Design")
                : JSON.stringify(tokensToDtcg(tokens), null, 2);
        const count = Object.values(tokens).reduce((sum, cat) => sum + Object.keys(cat).length, 0);
        return {
          content: [
            {
              type: "text" as const,
              text: `# Exported ${count} tokens (${format})\n\n\`\`\`json\n${data.slice(0, 4000)}${data.length > 4000 ? "\n… (truncated in text view)" : ""}\n\`\`\`\n\nFull payload is available in structuredContent.code.`,
            },
          ],
          structuredContent: {
            success: true,
            format,
            token_count: count,
            code: data,
          },
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

  server.registerTool(
    "design_import_tokens",
    {
      title: "Import Design Tokens",
      description: `Import design tokens from W3C DTCG JSON and write them into the design state.

Accepts grouped DTCG JSON, e.g.:
  { "colors": { "color-primary": { "$type": "color", "$value": "#7C3AED" } } }
or a flat object per category:
  { "colors": { "color-primary": "#7C3AED" } }

Args:
  - tokens_json (string): DTCG JSON string
  - merge (string, optional): 'replace' (clear each category first, default) | 'merge-overwrite' | 'merge-keep'`,
      inputSchema: {
        tokens_json: z.string().min(1).describe("DTCG JSON string to import"),
        merge: z
          .enum(["replace", "merge-overwrite", "merge-keep"])
          .optional()
          .describe("Merge strategy (default: replace)"),
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
        const parsed = JSON.parse(params.tokens_json) as unknown;
        const maps = dtcgToTokenMaps(parsed);
        const count = applyImportedTokens(
          stateStore,
          maps,
          { merge: params.merge || "replace" },
          "user"
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Imported ${count} tokens (merge=${params.merge || "replace"}).`,
            },
          ],
          structuredContent: {
            success: true,
            imported: count,
            merge: params.merge || "replace",
            categories: Object.keys(maps),
          },
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
