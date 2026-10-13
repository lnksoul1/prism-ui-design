/**
 * Live preview artifact.
 *
 * Writes the current design to one stable HTML file so a viewer can watch that
 * single path and re-render whenever it changes. The previous preview tool wrote
 * a timestamped PNG per call, which no file watcher can follow and which loses
 * the interactive parts of the page.
 *
 * The file is a complete standalone document (inline styles, no external
 * requests), so it also works as a plain "open this in a browser" artifact and
 * inside a sandboxed iframe.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { exportDesign } from "./design-tools.js";
import { stateStore } from "../state.js";

/**
 * Where the live preview is written.
 *
 * `PRISM_PREVIEW_FILE` wins (absolute or relative to cwd); otherwise
 * `<cwd>/.prism-preview/design.html`, which keeps the artifact in one directory
 * so a watcher can ignore the rest of the workspace.
 */
export function previewFilePath(): string {
  const configured = process.env.PRISM_PREVIEW_FILE;
  if (configured && configured.trim()) return path.resolve(configured.trim());
  return path.join(process.cwd(), ".prism-preview", "design.html");
}

/** Write the current design to the live preview path; returns what was written. */
export function writePreviewFile(format: "html" = "html"): {
  path: string;
  bytes: number;
  componentCount: number;
  revision: number;
} {
  const html = exportDesign(format);
  const file = previewFilePath();
  mkdirSync(path.dirname(file), { recursive: true });
  // Stamp the revision into the document so a viewer can tell a real change from
  // a rewrite of identical content.
  const revision = Date.now();
  const stamped = html.replace(
    "</head>",
    `  <meta name="prism-preview-revision" content="${revision}"/>\n</head>`
  );
  writeFileSync(file, stamped, "utf8");
  return {
    path: file,
    bytes: Buffer.byteLength(stamped, "utf8"),
    componentCount: stateStore.getState().components.length,
    revision,
  };
}

export function registerPreviewSyncTool(server: McpServer): void {
  server.registerTool(
    "design_preview_sync",
    {
      title: "Sync Live Preview",
      description: `Write the current design to the live-preview file, so a viewer watching that path shows the latest state.

This is the "make the preview show what I just built" step. Call it after changing the design. The file is one complete standalone HTML document (inline styles, no external requests), overwritten in place, so a single path always holds the newest render.

Args:
  - none

Returns:
  - path: the preview file (also PRISM_PREVIEW_FILE, default <cwd>/.prism-preview/design.html)
  - revision: timestamp stamped into the document, so a viewer can detect a real change`,
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const result = writePreviewFile("html");
        const state = stateStore.getState();
        const text = [
          `Live preview synced.`,
          ``,
          `**File:** ${result.path}`,
          `**Size:** ${result.bytes} bytes`,
          `**Project:** ${state.projectName}`,
          `**Components:** ${result.componentCount}`,
          `**Revision:** ${result.revision}`,
          ``,
          `Point a viewer at this file to see the current design; it is overwritten in place on every sync.`,
        ].join("\n");
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            success: true,
            path: result.path,
            bytes: result.bytes,
            revision: result.revision,
            component_count: result.componentCount,
            project_name: state.projectName,
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
