/**
 * Webpage import (functional plan F1 #2).
 *
 * `design_import_webpage` fetches a URL (or accepts pasted HTML) and runs the
 * existing HTML extraction pipeline to produce Prism components.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { importHtmlString } from "../import-project.js";

const MAX_HTML = 2_000_000;

function validateUrl(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported");
  }
  return parsed;
}

export function registerWebpageImportTool(server: McpServer): void {
  server.registerTool(
    "design_import_webpage",
    {
      title: "Import Webpage",
      description: `Import a live webpage (URL) or pasted HTML into the design canvas as components.

Args:
  - url (string, optional): http(s) URL to fetch and parse
  - html (string, optional): Raw HTML to parse directly (used when url is omitted)
  - clear_existing (boolean, optional): Clear the current design first (default false)

Exactly one of url or html is required.`,
      inputSchema: {
        url: z.string().optional(),
        html: z.string().optional(),
        clear_existing: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        let html: string;
        let sourceName: string;
        if (params.html) {
          html = params.html;
          sourceName = "Pasted HTML";
        } else if (params.url) {
          const url = validateUrl(params.url);
          const response = await fetch(url, {
            headers: { "User-Agent": "Prism-Import/1.0" },
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) {
            throw new Error(`Fetch failed: HTTP ${response.status} for ${params.url}`);
          }
          html = await response.text();
          if (html.length > MAX_HTML) {
            throw new Error(`Page too large (${html.length} chars, max ${MAX_HTML})`);
          }
          sourceName = url.hostname;
        } else {
          throw new Error("Provide either 'url' or 'html'");
        }

        const result = importHtmlString(html, sourceName, params.clear_existing || false);
        return {
          content: [
            {
              type: "text" as const,
              text: `Imported ${result.imported} components from "${sourceName}" into page "${result.pageName}".`,
            },
          ],
          structuredContent: {
            success: true,
            source: sourceName,
            imported: result.imported,
            page_id: result.pageId,
            page_name: result.pageName,
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
