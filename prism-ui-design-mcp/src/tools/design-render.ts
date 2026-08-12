/**
 * Visual verification loop (improvement plan B1 / functional plan F5).
 *
 * `design_render_preview` always returns the standalone HTML of the current
 * design. When Playwright + Chromium are installed (optional dependency) it
 * also renders a PNG screenshot so the AI agent can see its own output.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { exportDesign } from "./design-tools.js";

const VIEWPORTS: Record<string, { width: number; height: number; label: string }> = {
  desktop: { width: 1280, height: 900, label: "Desktop" },
  tablet: { width: 834, height: 1114, label: "Tablet" },
  mobile: { width: 390, height: 844, label: "Mobile" },
};

function previewsDir(): string {
  const dir = process.env.PRISM_PREVIEWS_DIR || path.join(process.cwd(), ".prism-previews");
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function renderPng(html: string, viewport: { width: number; height: number }, outFile: string): Promise<void> {
  // Optional dependency: installed with `npm i -D playwright && npx playwright install chromium`.
  const { chromium } = (await import("playwright" as string)) as {
    chromium: {
      launch(): Promise<{
        newPage(options?: { viewport?: { width: number; height: number } }): Promise<{
          setContent(html: string, options?: { waitUntil?: string }): Promise<void>;
          screenshot(options?: { path?: string; fullPage?: boolean }): Promise<unknown>;
        }>;
        close(): Promise<void>;
      }>;
    };
  };
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.screenshot({ path: outFile, fullPage: false });
  } finally {
    await browser.close();
  }
}

export function registerRenderTool(server: McpServer): void {
  server.registerTool(
    "design_render_preview",
    {
      title: "Render Design Preview",
      description: `Render the current design as a standalone HTML document (always available), and as a PNG screenshot when Playwright is installed (optional).

Args:
  - viewport (string, optional): 'desktop' (default) | 'tablet' | 'mobile'

Returns:
  - html: the full standalone HTML document (with design tokens as CSS variables)
  - png_path / png_base64: screenshot (only when Playwright + Chromium are available)
  - screenshot: false + note when the optional dependency is missing`,
      inputSchema: {
        viewport: z.enum(["desktop", "tablet", "mobile"]).optional().describe("Preview viewport (default desktop)"),
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
        const viewportName = params.viewport || "desktop";
        const viewport = VIEWPORTS[viewportName];
        const html = exportDesign("html");
        let pngPath: string | null = null;
        let pngBase64: string | null = null;
        let screenshotNote = "";

        try {
          const candidate = path.join(previewsDir(), `preview-${Date.now()}-${viewportName}.png`);
          await renderPng(html, viewport, candidate);
          pngPath = candidate;
          const { readFileSync } = await import("fs");
          pngBase64 = readFileSync(pngPath).toString("base64");
        } catch (error) {
          screenshotNote =
            error instanceof Error && error.message.includes("playwright")
              ? "Playwright is not installed — install with `npm i -D playwright && npx playwright install chromium` to enable screenshots."
              : `Screenshot unavailable: ${error instanceof Error ? error.message : String(error)}`;
        }

        const lines = [
          `# Design Preview (${viewport.label}, ${viewport.width}×${viewport.height})`,
          ``,
          `**HTML length:** ${html.length} chars`,
          screenshotNote ? `**Screenshot:** ${screenshotNote}` : `**Screenshot:** ${pngPath}`,
          ``,
          `The full HTML is in structuredContent.html; paste it into a browser or file to inspect.`,
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: lines }],
          structuredContent: {
            success: true,
            viewport: viewportName,
            html,
            screenshot: !!pngPath,
            png_path: pngPath,
            png_base64: pngBase64,
            note: screenshotNote || undefined,
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
