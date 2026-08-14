/**
 * MCP Prompts (improvement plan B4).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "build_page",
    {
      description: "Build a full page from a natural-language brief using Prism design tools.",
      argsSchema: {
        brief: z.string().describe("What the user wants the page to contain"),
        design_system: z.string().optional().describe("Brand design system to apply (e.g. linear, stripe, apple, notion)"),
      },
    },
    async (args) => {
      const ds = args.design_system ? `After init, apply design system "${args.design_system}" with design_apply_style_guide. ` : "";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Build a complete page for the following brief: "${args.brief}". ${ds}Initialize a project with design_init, apply a template or add components section by section (hero, features, content, pricing/CTA, footer), generate tokens, and finish with design_get_state to summarize what was built. Keep component props in Chinese when the brief is in Chinese.`,
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    "design_review",
    {
      description: "Audit the current design and produce an actionable improvement list.",
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Review the current Prism design: run design_audit_accessibility and design_get_conflicts, then design_render_preview if available. Summarize the strongest issues (accessibility, contrast, layout completeness) and propose concrete, ordered fixes that can be executed with design tools.",
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "import_project",
    {
      description: "Import an existing codebase or saved project into Prism.",
      argsSchema: {
        folder: z.string().optional().describe("Absolute folder path containing HTML/JSX/TSX/Vue files"),
        file: z.string().optional().describe("Path to a .prism.json saved project"),
      },
    },
    async (args) => {
      const target = args.file
        ? `Load the saved project with design_load_project(file="${args.file}").`
        : `Import the folder with the /api/import endpoint or equivalent (folder: "${args.folder || ""}"), then normalize the imported pages.`;
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `${target} After importing, run design_get_state, review component types against prism://components/registry, fix any unknown types, and summarize the imported pages.`,
            },
          },
        ],
      };
    }
  );
}
