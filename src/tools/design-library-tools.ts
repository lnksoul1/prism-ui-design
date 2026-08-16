import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  applyDesignLibraryComponent,
  applyDesignStyle,
  listDesignComponents,
  listDesignStyles,
  listTermTemplates,
} from "../design-library.js";

/**
 * DESIGN.md v1.1 §9.3 — design-library MCP tools.
 * The design library is the only content panel; these tools replace the old
 * style-guide / component-template / behavior-template tools.
 */
export function registerDesignLibraryTools(server: McpServer): void {
  server.registerTool(
    "design_list_design_library",
    {
      title: "List Design Library",
      description: "List the design library catalog: 24 styles, 117 component templates/variants, and term templates.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const styles = listDesignStyles();
      const components = listDesignComponents();
      const termTemplates = listTermTemplates();
      return {
        content: [
          {
            type: "text" as const,
            text: `# Design Library\n\n${styles.length} styles · ${components.length} components · ${termTemplates.length} term templates\n\nSource: https://vibe-hub.org/topics/design`,
          },
        ],
        structuredContent: {
          success: true,
          version: 1,
          source: "https://vibe-hub.org/topics/design",
          styles,
          components,
          termTemplates,
        },
      };
    }
  );

  server.registerTool(
    "design_apply_design_style",
    {
      title: "Apply Design Style",
      description: "Apply a design-library style by id: token overrides + state.style + motion profile.",
      inputSchema: {
        style_id: z.string().describe("Design-library style id, e.g. 'glassmorphism'"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const result = applyDesignStyle(params.style_id, "ai");
      if (!result.ok) {
        return { content: [{ type: "text" as const, text: `Error: ${result.detail || `Unknown style "${params.style_id}"`}` }] };
      }
      return {
        content: [{ type: "text" as const, text: `Applied design style "${result.style_name}" (${result.overrides} token overrides).` }],
        structuredContent: { success: true, ...result },
      };
    }
  );

  server.registerTool(
    "design_apply_design_component",
    {
      title: "Apply Design Component",
      description: "Add a design-library component to the canvas, or replace an existing component in place by target_id (keeping id + layout).",
      inputSchema: {
        component_id: z.string().describe("Design-library component id, e.g. 'hero_split'"),
        target_id: z.string().optional().describe("Existing component id to replace in place"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const result = applyDesignLibraryComponent(params.component_id, params.target_id || null, "ai");
      if (!result.ok) {
        return { content: [{ type: "text" as const, text: `Error: ${result.detail || `Unknown component "${params.component_id}"`}` }] };
      }
      return {
        content: [{ type: "text" as const, text: `${result.mode === "replaced" ? "Replaced" : "Added"} design-library component ${result.component_id}.` }],
        structuredContent: { success: true, ...result },
      };
    }
  );
}
