/**
 * Scroll tools (upgrade plan U1: Lenis integration).
 *
 * Three MCP tools:
 *   - design_set_scroll: configure smooth scroll mode + options
 *   - design_get_scroll: read current scroll config
 *   - design_scroll_to:  register a scroll-to target for export runtime
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateStore } from "../state.js";

export function registerScrollTools(server: McpServer): void {
  // ===== design_set_scroll =====
  server.registerTool(
    "design_set_scroll",
    {
      title: "Set Scroll Mode",
      description: `Configure smooth scrolling for the design (upgrade plan U1: Lenis integration).

Modes:
  - native     : browser default scrolling (no JS)
  - smooth     : CSS scroll-behavior: smooth (basic)
  - lenis-gsap : Lenis + GSAP ScrollTrigger (premium, injects CDN on export)

Options (lenis-gsap mode):
  - lerp (0-1, default 0.1): interpolation intensity
  - duration (s, default 1.2): animation duration
  - wheelMultiplier (default 1): mouse wheel speed
  - syncTouch (bool, default false): mimic touch scroll on iOS
  - anchors (bool, default true): smooth anchor links
  - allowNestedScroll (bool, default true): auto-detect nested scroll areas
  - respectReducedMotion (bool, default true): honor prefers-reduced-motion

Example:
  design_set_scroll(mode="lenis-gsap", options={lerp:0.08, anchors:true})`,
      inputSchema: {
        mode: z
          .enum(["native", "smooth", "lenis-gsap"])
          .describe("Scroll mode: native | smooth | lenis-gsap"),
        options: z
          .record(z.string(), z.any())
          .optional()
          .describe("Lenis options (lerp, duration, wheelMultiplier, syncTouch, anchors, allowNestedScroll)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const opts = (params.options || {}) as Record<string, number | string | boolean>;
        stateStore.setScroll(params.mode, opts, "ai");
        return {
          content: [{ type: "text", text: `Scroll mode set to "${params.mode}". Export will inject the appropriate runtime.` }],
          structuredContent: { success: true, mode: params.mode },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // ===== design_get_scroll =====
  server.registerTool(
    "design_get_scroll",
    {
      title: "Get Scroll Configuration",
      description: "Read the current scroll mode and options (Lenis config).",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const scroll = stateStore.getScroll();
      return {
        content: [{ type: "text", text: scroll ? JSON.stringify(scroll, null, 2) : "No scroll config set (defaults to native)." }],
        structuredContent: { scroll: scroll || { mode: "native", options: {} } },
      };
    }
  );

  // ===== design_scroll_to =====
  server.registerTool(
    "design_scroll_to",
    {
      title: "Add Scroll-To Target",
      description: `Register a scroll-to target that the exported page will smooth-scroll to on click.

The target can be a component_id or a CSS selector. The Lenis runtime (when mode=lenis-gsap) will intercept clicks on elements with data-scroll-to="<target>" and call lenis.scrollTo().

Args:
  - target (string): component_id or CSS selector to scroll to
  - offset (number, optional): scroll-padding offset in px (default 0)
  - duration (number, optional): animation duration in seconds (default 1.2)
  - label (string, optional): human-readable label

Example:
  design_scroll_to(target="#pricing", offset=80, duration=1.5, label="Go to Pricing")`,
      inputSchema: {
        target: z.string().describe("Component ID or CSS selector to scroll to"),
        offset: z.number().optional().describe("Scroll-padding offset in px"),
        duration: z.number().min(0.1).max(10).optional().describe("Animation duration in seconds"),
        label: z.string().optional().describe("Human-readable label"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (params) => {
      try {
        const t = stateStore.addScrollToTarget(
          { target: params.target, offset: params.offset, duration: params.duration, label: params.label },
          "ai"
        );
        return {
          content: [{ type: "text", text: `Scroll-to target registered: ${t.target} (id: ${t.id})` }],
          structuredContent: { success: true, id: t.id, target: t.target },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
}
