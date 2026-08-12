/**
 * Platform design snapshots (improvement plan C2).
 *
 * Each platform (web / desktop / mobile …) can keep its own page layout while
 * sharing the project's style and tokens: save the current pages as a
 * platform snapshot, load it back later, or list all saved platforms.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateStore } from "../state.js";

const PLATFORMS = [
  "web-desktop",
  "web-tablet",
  "web-mobile",
  "desktop-macos",
  "desktop-windows",
  "mobile-ios",
  "mobile-android",
] as const;

export function registerPlatformTools(server: McpServer): void {
  server.registerTool(
    "design_save_platform",
    {
      title: "Save Platform Design",
      description: `Save the current pages as the design for a specific platform.
Platform layouts are stored per platform while sharing style + tokens, so each
target (web / desktop / mobile) can have its own layout.

Platforms: web-desktop, web-tablet, web-mobile, desktop-macos, desktop-windows, mobile-ios, mobile-android`,
      inputSchema: {
        platform: z.enum(PLATFORMS).describe("Platform to save the current design as"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const snapshot = stateStore.savePlatformSnapshot(params.platform, "ai");
        return {
          content: [
            {
              type: "text" as const,
              text: `Saved ${snapshot.pages.length} page(s) as the ${params.platform} design (${snapshot.savedAt}).`,
            },
          ],
          structuredContent: { success: true, ...snapshot },
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
    "design_load_platform",
    {
      title: "Load Platform Design",
      description: `Restore the pages previously saved for a platform.

Args:
  - platform (string): Platform whose saved design should be restored`,
      inputSchema: {
        platform: z.enum(PLATFORMS).describe("Platform to restore"),
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
        const snapshot = stateStore.loadPlatformSnapshot(params.platform, "ai");
        return {
          content: [
            {
              type: "text" as const,
              text: `Restored ${snapshot.pages.length} page(s) from the ${params.platform} design (saved ${snapshot.savedAt}).`,
            },
          ],
          structuredContent: { success: true, ...snapshot },
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
    "design_list_platforms",
    {
      title: "List Platform Designs",
      description: "List all platforms with a saved design snapshot.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const platforms = stateStore.listPlatformSnapshots();
        const text =
          platforms.length === 0
            ? "No platform designs saved yet. Call design_save_platform to snapshot the current pages."
            : platforms
                .map((p) => `- ${p.platform}: ${p.pageCount} page(s), ${p.componentCount} component(s) — ${p.savedAt}`)
                .join("\n");
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { success: true, count: platforms.length, platforms },
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
