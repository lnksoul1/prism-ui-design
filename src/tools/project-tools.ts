/**
 * Project persistence tools (save / load / list .prism.json projects).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { saveProject, loadProject, listProjects } from "../project-store.js";

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    "design_save_project",
    {
      title: "Save Project",
      description: `Persist the current design state to a .prism.json file on disk.

Args:
  - name (string, optional): Project name (defaults to the current project name)
  - file (string, optional): Target file path (defaults to the project directory with a timestamped name)

The server restores the most recently saved project on startup, so designs survive restarts.`,
      inputSchema: {
        name: z.string().optional().describe("Project name for the saved file"),
        file: z.string().optional().describe("Explicit target file path"),
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
        const result = saveProject(params.name, params.file);
        return {
          content: [
            {
              type: "text" as const,
              text: `Project saved to ${result.file}\nProject: ${result.project_name}\nComponents: ${result.component_count}`,
            },
          ],
          structuredContent: { success: true, ...result },
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
    "design_load_project",
    {
      title: "Load Project",
      description: `Load a .prism.json project file and restore it as the current design.

Args:
  - file (string): Path to the .prism.json file to load

Undo/redo history is reset so the loaded project becomes the new baseline.`,
      inputSchema: {
        file: z.string().describe("Path to the .prism.json file"),
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
        const result = loadProject(params.file);
        return {
          content: [
            {
              type: "text" as const,
              text: `Project loaded: ${result.project_name}\nPages: ${result.page_count}\nComponents: ${result.component_count}\nTokens: ${result.token_count}`,
            },
          ],
          structuredContent: { success: true, ...result },
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
    "design_list_projects",
    {
      title: "List Saved Projects",
      description: `List all saved .prism.json projects (newest first).

No arguments required. Returns project names, file paths, and component counts.`,
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
        const projects = listProjects();
        const text =
          projects.length === 0
            ? "No saved projects found."
            : projects
                .map(
                  (p, i) =>
                    `${i + 1}. ${p.name} (${p.component_count} components) — ${p.file}${p.updatedAt ? ` — ${p.updatedAt}` : ""}`
                )
                .join("\n");
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { success: true, count: projects.length, projects },
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
