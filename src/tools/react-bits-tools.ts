/**
 * React Bits component library tools (upgrade plan U3).
 *
 * Three MCP tools:
 *   - design_list_react_bits: list components by category + variant
 *   - design_add_react_bits_component: add a React Bits component to canvas
 *   - design_get_react_bits_code: get copy-ready component source
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateStore } from "../state.js";
import {
  listReactBitsComponents,
  getReactBitsComponent,
  getReactBitsStats,
  generateReactBitsCode,
  type ReactBitsCategory,
  type ReactBitsVariant,
} from "../component-library/react-bits-registry.js";

export function registerReactBitsTools(server: McpServer): void {
  // ===== design_list_react_bits =====
  server.registerTool(
    "design_list_react_bits",
    {
      title: "List React Bits Components",
      description: `List the React Bits animated component library (upgrade plan U3).

The library contains 165+ components across 4 categories:
  - text       : animated text (BlurText, DecryptText, GradientText, ...)
  - animations : animated UI wrappers (MagneticButton, TiltCard, SpotlightCard, ...)
  - components : full UI components (AnimatedInput, GlassCard, BentoGrid, ...)
  - backgrounds: animated backgrounds (AuroraBackground, GridBackground, ...)

Each component has 4 variants: JS-CSS, JS-TW, TS-CSS, TS-TW.

Args:
  - category (string, optional): filter by category

Example:
  design_list_react_bits(category="text")`,
      inputSchema: {
        category: z
          .enum(["text", "animations", "components", "backgrounds"])
          .optional()
          .describe("Filter by category"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const stats = getReactBitsStats();
      const components = listReactBitsComponents(params.category as ReactBitsCategory | undefined).map((c) => ({
        name: c.name,
        category: c.category,
        prismType: c.prismType,
        description: c.description,
        shadcnPath: c.shadcnPath,
        tags: c.tags,
        paramCount: c.propsSchema.length,
      }));
      return {
        content: [
          {
            type: "text",
            text: `# React Bits Library (showing ${components.length}/${stats.total})\n\n**Categories:** text=${stats.categories.text}, animations=${stats.categories.animations}, components=${stats.categories.components}, backgrounds=${stats.categories.backgrounds}\n\n${components
              .map((c) => `- **${c.name}** (${c.category}/${c.prismType}): ${c.description}`)
              .join("\n")}`,
          },
        ],
        structuredContent: { total: stats.total, showing: components.length, components, variants: stats.variants },
      };
    }
  );

  // ===== design_add_react_bits_component =====
  server.registerTool(
    "design_add_react_bits_component",
    {
      title: "Add React Bits Component",
      description: `Add a React Bits animated component to the canvas (upgrade plan U3).

This adds a Prism component of the appropriate type (mapping from the React Bits
component's prismType) and registers the React Bits source so the export layer
includes the component code + React CDN.

Args:
  - component_name (string): React Bits component name (e.g. "BlurText")
  - variant (string, default "TS-TW"): JS-CSS | JS-TW | TS-CSS | TS-TW
  - props (object, optional): component-specific props
  - parent_id (string, optional): parent component ID

Example:
  design_add_react_bits_component(component_name="BlurText", variant="TS-TW", props={text:"Hello World", duration:1})`,
      inputSchema: {
        component_name: z.string().describe("React Bits component name (e.g. 'BlurText')"),
        variant: z
          .enum(["JS-CSS", "JS-TW", "TS-CSS", "TS-TW"])
          .optional()
          .describe("Variant (default TS-TW)"),
        props: z.record(z.string(), z.any()).optional().describe("Component-specific props"),
        parent_id: z.string().optional().describe("Parent component ID (optional)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      try {
        const comp = getReactBitsComponent(params.component_name);
        if (!comp) {
          return {
            content: [{ type: "text", text: `Error: component "${params.component_name}" not found. Use design_list_react_bits to see available components.` }],
          };
        }
        const variant = (params.variant || "TS-TW") as ReactBitsVariant;

        // Add the component to the canvas as the mapped Prism type
        const props = {
          text: comp.propsSchema.find((p) => p.name === "text" || p.name === "label")?.default || comp.name,
          source: "react-bits",
          reactBitsName: comp.name,
          reactBitsVariant: variant,
          ...(params.props || {}),
        };

        const node = stateStore.addComponent(
          comp.prismType,
          undefined,
          props,
          params.parent_id || null,
          "ai"
        );

        // Register in the React Bits state map
        stateStore.registerReactBitsComponent(node.id, comp.name, variant, params.props, "ai");

        return {
          content: [{ type: "text", text: `Added React Bits "${comp.name}" (${variant}) as a ${comp.prismType} component. ID: ${node.id}. Export with runtime="full" to include React + React Bits CDN.` }],
          structuredContent: { success: true, component_id: node.id, name: comp.name, prismType: comp.prismType },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // ===== design_get_react_bits_code =====
  server.registerTool(
    "design_get_react_bits_code",
    {
      title: "Get React Bits Component Source",
      description: `Get copy-ready source code for a React Bits component (upgrade plan U3).

Returns the component source in the requested variant, suitable for pasting into
a React project. Also returns the shadcn CLI install command for the full source.

Args:
  - component_name (string): component name
  - variant (string, default "TS-TW"): JS-CSS | JS-TW | TS-CSS | TS-TW

Example:
  design_get_react_bits_code(component_name="BlurText", variant="TS-TW")`,
      inputSchema: {
        component_name: z.string().describe("React Bits component name"),
        variant: z.enum(["JS-CSS", "JS-TW", "TS-CSS", "TS-TW"]).optional().describe("Variant (default TS-TW)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const comp = getReactBitsComponent(params.component_name);
        if (!comp) {
          return { content: [{ type: "text", text: `Error: component "${params.component_name}" not found.` }] };
        }
        const variant = (params.variant || "TS-TW") as ReactBitsVariant;
        const code = generateReactBitsCode(params.component_name, variant);
        return {
          content: [
            {
              type: "text",
              text: `# ${comp.name} (${variant})\n\n**Install:** \`npx shadcn@latest add ${comp.shadcnPath}\`\n\n\`\`\`${variant.startsWith("TS") ? "tsx" : "jsx"}\n${code}\n\`\`\``,
            },
          ],
          structuredContent: { name: comp.name, variant, code, shadcnPath: comp.shadcnPath },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
}
