/**
 * Canvas-first MCP tools (方案A).
 *
 * Lets the AI agent inspect what the user drew on the tldraw canvas and
 * apply it back to the component model, keeping the drawing loop agent-aware.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { stateStore } from "../state.js";
import { canvasShapeCount, shapesToComponents } from "../canvas-shapes.js";

const store = stateStore;

/** Report canvas status for the current page (read-only). */
function registerDesignGetCanvasTool(server: McpServer): void {
  server.registerTool(
    "design_get_canvas",
    {
      title: "Get Canvas Document",
      description:
        `Inspect the tldraw canvas document for the current page. The user draws freely on the canvas; ` +
        `this tool reports whether a document exists, how many shapes it contains, and what components it would map to. ` +
        `No arguments required.`,
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
        const state = store.getState();
        const doc = store.getCanvasDoc(state.currentPageId);
        const components = doc ? shapesToComponents(doc) : [];
        return {
          content: [
            {
              type: "text",
              text: doc
                ? `Canvas document found for page "${state.currentPageId}":\n- shapes: ${canvasShapeCount(doc)}\n- mapped components: ${components.length}`
                : `No canvas document yet for page "${state.currentPageId}".`,
            },
          ],
          structuredContent: {
            success: true,
            page_id: state.currentPageId,
            has_canvas: !!doc,
            shape_count: doc ? canvasShapeCount(doc) : 0,
            component_count: components.length,
            components,
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

/** Apply the current canvas document to the component model. */
function registerDesignApplyCanvasTool(server: McpServer): void {
  server.registerTool(
    "design_apply_canvas",
    {
      title: "Apply Canvas to Components",
      description:
        `Convert the current page's tldraw canvas drawing into Prism components and replace the page content. ` +
        `Shapes originally created from components keep their type and props with the user's new position/size; ` +
        `freshly drawn shapes are mapped heuristically. No arguments required.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const state = store.getState();
        const pageId = state.currentPageId;
        const doc = store.getCanvasDoc(pageId);
        if (!pageId || !doc) {
          return {
            content: [{ type: "text", text: `No canvas document found for page "${pageId}".` }],
            structuredContent: { success: false, error: "no_canvas" },
          };
        }
        const components = shapesToComponents(doc);
        store.replacePageComponents(pageId, components, "ai");
        return {
          content: [
            {
              type: "text",
              text: `Applied canvas to page "${pageId}": ${components.length} components.`,
            },
          ],
          structuredContent: {
            success: true,
            page_id: pageId,
            component_count: components.length,
            components,
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

export function registerCanvasTools(server: McpServer): void {
  registerDesignGetCanvasTool(server);
  registerDesignApplyCanvasTool(server);
}
