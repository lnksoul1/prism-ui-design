/**
 * Webpage import (functional plan F1 #2).
 *
 * `design_import_webpage` fetches a URL (or accepts pasted HTML) and runs the
 * existing HTML extraction pipeline to produce Prism components.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { importHtmlString } from "../import-project.js";
import { stateStore } from "../state.js";
import { getProjectDir } from "../project-store.js";

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
          let importBaseUrl = "";
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
          importBaseUrl = response.url || params.url;
            sourceName = new URL(importBaseUrl).hostname;
        } else {
          throw new Error("Provide either 'url' or 'html'");
        }

        // URL 来源同步抓取 link 样式表，让片段编辑态也尽量还原页面视觉。
        let extraCss = "";
        if (params.url) {
          const baseUrl = validateUrl(importBaseUrl || params.url);
          const linkTagRe = /<link\b[^>]*>/gi;
          let m: RegExpExecArray | null;
          while ((m = linkTagRe.exec(html)) !== null) {
            try {
              const rel = /\brel\s*=\s*["']?([^"'\s>]+)/i.exec(m[0]);
                const hrefAttr = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0]);
                if (!rel || !hrefAttr || !rel[1].split(/\s+/).includes("stylesheet")) continue;
                const href = new URL(hrefAttr[1], baseUrl).toString();
              const cssRes = await fetch(href, { signal: AbortSignal.timeout(8000) });
              if (cssRes.ok) extraCss += (await cssRes.text()) + "\n";
            } catch {
              // 单条样式失败不影响整体导入
            }
          }
        }


        const result = importHtmlString(html, sourceName, params.clear_existing || false, extraCss);
          // 记录 provenance：与 dashboard 的 URL/HTML 导入同一套应用/回滚链路。
          try {
            const importsDir = path.join(getProjectDir(), "imports");
            fs.mkdirSync(importsDir, { recursive: true });
            const htmlFile = path.join(importsDir, `${result.pageId}.html`);
            fs.writeFileSync(htmlFile, html, "utf-8");
            stateStore.setImport(
              result.pageId,
              {
                kind: (params.url ? "url" : "html") as "url" | "html",
                source: sourceName,
                ...(params.url ? { url: params.url, base_url: importBaseUrl || params.url } : {}),
                html_file: htmlFile,
                imported_at: new Date().toISOString(),
                component_count: result.imported,
              },
              "user"
            );
          } catch {
            // provenance 失败不阻断导入
          }
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
