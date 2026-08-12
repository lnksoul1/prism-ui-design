/**
 * Canvas-first MCP tools (方案A).
 *
 * Lets the AI agent inspect what the user drew on the tldraw canvas and
 * apply it back to the component model, keeping the drawing loop agent-aware.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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

/** Queue AI drawing commands onto the user's canvas. */
function registerDesignDrawCanvasTool(server: McpServer): void {
  server.registerTool(
    "design_draw_canvas",
    {
      title: "Draw on Canvas",
      description:
        `Queue drawing commands that appear on the user's tldraw canvas (live if the drawing canvas is open). ` +
        `Each command is a simple shape: rect, text, arrow, image, or prism (token-colored block). ` +
        `Coordinates are in canvas pixels; the canvas is infinite, so negative values are allowed. ` +
        `The user can then move/resize and apply the result back to the page with "apply to preview".`,
      inputSchema: {
        shapes: z
          .array(
            z.object({
              type: z.enum(["rect", "text", "arrow", "image", "prism"]).describe("Shape kind"),
              x: z.number().describe("Left position in canvas px"),
              y: z.number().describe("Top position in canvas px"),
              w: z.number().positive().optional().describe("Width in px"),
              h: z.number().positive().optional().describe("Height in px"),
              label: z.string().optional().describe("Text shown on/inside the shape"),
              src: z.string().optional().describe("Image URL or data URI (image kind)"),
              color: z.string().optional().describe("CSS color override"),
              kind: z.string().optional().describe("prism block kind: card|button|hero|cta|navbar|footer|image|text"),
            })
          )
          .min(1)
          .max(50)
          .describe("Drawing commands"),
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
        const state = store.getState();
        const queued = store.addCanvasDraws(params.shapes, state.currentPageId, "ai");
        return {
          content: [
            {
              type: "text",
              text:
                `Queued ${queued.length} drawing command(s) for page "${state.currentPageId}". ` +
                `They will appear on the user's canvas (live if the drawing canvas is open).`,
            },
          ],
          structuredContent: {
            success: true,
            page_id: state.currentPageId,
            queued_count: queued.length,
            draws: queued,
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
  registerDesignDrawCanvasTool(server);
}
