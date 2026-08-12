/**
 * User template tools (improvement plan C3):
 *   - design_save_template
 *   - design_list_templates
 *   - design_load_template
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listTemplates, loadTemplate, saveTemplate } from "../templates.js";

export function registerTemplateTools(server: McpServer): void {
  server.registerTool(
    "design_save_template",
    {
      title: "Save Page Template",
      description: `Save the current design (style + tokens + pages) as a reusable template.

Args:
  - name (string, optional): Template name (defaults to "<project> Template")
  - file (string, optional): Explicit target path`,
      inputSchema: {
        name: z.string().optional(),
        file: z.string().optional(),
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
        const result = saveTemplate(params.name, params.file);
        return {
          content: [
            {
              type: "text" as const,
              text: `Template saved: ${result.name}\nFile: ${result.file}\nComponents: ${result.component_count}`,
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
    "design_list_templates",
    {
      title: "List Page Templates",
      description: "List all saved .prism-template.json files (newest first).",
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
        const templates = listTemplates();
        const text =
          templates.length === 0
            ? "No saved templates."
            : templates
                .map((t, i) => `${i + 1}. ${t.name} (${t.component_count} components) — ${t.file}`)
                .join("\n");
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: { success: true, count: templates.length, templates },
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
    "design_load_template",
    {
      title: "Load Page Template",
      description: `Load a saved template, replacing the current design content.

Args:
  - file (string): Path to the .prism-template.json file

The current project name is preserved.`,
      inputSchema: {
        file: z.string().describe("Path to the template file"),
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
        const result = loadTemplate(params.file);
        return {
          content: [
            {
              type: "text" as const,
              text: `Template loaded: ${result.name}\nPages: ${result.page_count}\nComponents: ${result.component_count}`,
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
}
