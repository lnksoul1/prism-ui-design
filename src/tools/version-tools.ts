/**
 * Version management tools (improvement plan C4):
 *   - design_create_version
 *   - design_list_versions
 *   - design_restore_version
 *   - design_diff_versions
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createVersion, diffVersions, listVersions, restoreVersion } from "../versions.js";

export function registerVersionTools(server: McpServer): void {
  server.registerTool(
    "design_create_version",
    {
      title: "Create Design Version",
      description: `Snapshot the current design as a named version.

Args:
  - name (string, optional): Version name (defaults to "Version N")`,
      inputSchema: {
        name: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const version = createVersion(params.name);
        return {
          content: [
            {
              type: "text" as const,
              text: `Version created: ${version.name} (${version.id})\nComponents: ${version.componentCount}`,
            },
          ],
          structuredContent: {
            success: true,
            id: version.id,
            name: version.name,
            created_at: version.createdAt,
            component_count: version.componentCount,
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
    "design_list_versions",
    {
      title: "List Design Versions",
      description: "List version snapshots (newest first).",
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
        const versions = listVersions();
        const text =
          versions.length === 0
            ? "No versions yet. Call design_create_version to snapshot the design."
            : versions
                .map((v, i) => `${i + 1}. ${v.name} (${v.id}) — ${v.componentCount} components — ${v.createdAt}`)
                .join("\n");
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { success: true, count: versions.length, versions },
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
    "design_restore_version",
    {
      title: "Restore Design Version",
      description: `Restore the design to a previously created version snapshot.

Args:
  - version_id (string): Version ID from design_list_versions`,
      inputSchema: {
        version_id: z.string().describe("Version ID to restore"),
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
        const version = restoreVersion(params.version_id);
        return {
          content: [
            {
              type: "text" as const,
              text: `Restored version "${version.name}" (${version.id}) — ${version.componentCount} components.`,
            },
          ],
          structuredContent: { success: true, restored_id: version.id, name: version.name },
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
    "design_diff_versions",
    {
      title: "Diff Design Versions",
      description: `Compare two version snapshots and summarize what changed.

Args:
  - from_id (string): Base version ID
  - to_id (string): Target version ID`,
      inputSchema: {
        from_id: z.string().describe("Base version ID"),
        to_id: z.string().describe("Target version ID"),
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
        const diff = diffVersions(params.from_id, params.to_id);
        return {
          content: [
            {
              type: "text" as const,
              text: `# Diff ${diff.from_id} → ${diff.to_id}\n\n${diff.summary.join("\n")}`,
            },
          ],
          structuredContent: { success: true, ...diff },
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
