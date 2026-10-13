/**
 * MCP Prompts — agent entry points that compose the registered tools.
 *
 * Route B: prompt text must only reference tools that are actually registered
 * (the previous `build_page` text pointed at the removed design-system tool, and
 * `import_project` pointed at a removed REST endpoint).
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
        theme: z
          .string()
          .optional()
          .describe('Optional look to steer toward, e.g. "minimal", "bold", "playful", "dark", "editorial", "tech"'),
      },
    },
    async (args) => {
      const theme = args.theme
        ? `Pass style="${args.theme}" to design_init. `
        : "";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Build a complete page for the following brief: "${args.brief}". ${theme}Start with design_init (this resets the session and generates neutral tokens), then either design_apply_template for a matching page template or add sections one by one with design_add_component (hero, features, content, pricing/CTA, footer). Use design_set_token to adjust brand colours. Finish with design_suggest_improvements and design_audit_accessibility, fix what they report, then design_get_state to summarize what was built. Keep component props in Chinese when the brief is in Chinese.`,
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
      description: "Bring an existing page or saved project into the Prism session.",
      argsSchema: {
        url: z.string().optional().describe("Webpage URL to import as components"),
        html: z.string().optional().describe("Raw HTML to import as components"),
        file: z.string().optional().describe("Path to a .prism.json saved project"),
      },
    },
    async (args) => {
      const target = args.file
        ? `Load the saved session with design_load_project(file="${args.file}").`
        : args.url
          ? `Import the page with design_import_webpage(url="${args.url}").`
          : args.html
            ? "Import the page with design_import_webpage(html=\"...\") using the provided HTML."
            : 'Ask the user for a URL, an HTML snippet, or a saved .prism.json path — one of design_import_webpage(url|html) or design_load_project(file) is required.';
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `${target} Then run design_get_state and check every component type against prism://components/registry; report any type that could not be mapped, and summarize the imported pages and component count.`,
            },
          },
        ],
      };
    }
  );
}
