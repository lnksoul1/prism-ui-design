/**
 * DESIGN.md import (functional plan F1 / F3).
 *
 * Google's DESIGN.md format (YAML front matter tokens + prose) is becoming a
 * standard way to carry design systems into agent workflows. This tool parses
 * a DESIGN.md document and writes its token groups into the design state.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateStore } from "../state.js";
import { applyImportedTokens, parseDesignMd } from "../tokens/dtcgi.js";

export function registerDesignMdTool(server: McpServer): void {
  server.registerTool(
    "design_import_design_md",
    {
      title: "Import DESIGN.md",
      description: `Import design tokens from a Google DESIGN.md document (YAML front matter + prose).

Args:
  - markdown (string): Full DESIGN.md content
  - merge (string, optional): 'replace' (default) | 'merge-overwrite' | 'merge-keep'`,
      inputSchema: {
        markdown: z.string().min(1).describe("DESIGN.md content"),
        merge: z.enum(["replace", "merge-overwrite", "merge-keep"]).optional(),
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
        const doc = parseDesignMd(params.markdown);
        const count = applyImportedTokens(
          stateStore,
          doc.tokens,
          { merge: params.merge || "replace" },
          "user"
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Imported ${count} tokens from DESIGN.md (merge=${params.merge || "replace"}).\n\nProse excerpt:\n${doc.prose.slice(0, 500)}`,
            },
          ],
          structuredContent: {
            success: true,
            imported: count,
            merge: params.merge || "replace",
            categories: Object.keys(doc.tokens),
            prose_length: doc.prose.length,
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
