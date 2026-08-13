/**
 * Animation engine tools (upgrade plan U1: GSAP integration).
 *
 * Three MCP tools:
 *   - design_list_animation_engines: list engines + presets + deps
 *   - design_preview_animation: emit preview code for a preset
 *   - design_set_scroll_trigger: configure ScrollTrigger for a component
 *
 * (design_set_animation with engine field is an extension of the existing
 *  tool in design-tools.ts — handled there via AnimationDef.engine.)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateStore } from "../state.js";
import {
  listAnimationEngines,
  listAnimationPresets,
  getAnimationPreset,
  getDefaultParams,
} from "../animations/index.js";
import { serializeGsapPreset, serializeCssPreset, listAllPresetsForExport } from "../animations/serializer.js";
import { getMotionProfile, STYLE_MOTION_PROFILES } from "../constants.js";

export function registerAnimationEngineTools(server: McpServer): void {
  // ===== design_list_animation_engines =====
  server.registerTool(
    "design_list_animation_engines",
    {
      title: "List Animation Engines & Presets",
      description: `List all available animation engines and their presets (upgrade plan U1).

Engines:
  - css  : 20 presets (13 entry + 7 hover), zero runtime deps, inline @keyframes
  - gsap : 27 presets (12 entry + 8 hover + 4 timeline + 3 loop), needs GSAP CDN

Returns each engine's preset count, dependency list, and full preset metadata
(name, category, description, params schema, supportsScrollTrigger).`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const engines = listAnimationEngines();
      const presets = listAllPresetsForExport();
      return {
        content: [
          {
            type: "text",
            text: `# Animation Engines\n\n${engines
              .map((e) => `- **${e.name}**: ${e.presetCount} presets, deps: [${e.deps.join(", ") || "none"}]`)
              .join("\n")}\n\n## All Presets (${presets.length})\n${presets
              .map(
                (p) =>
                  `- \`${p.name}\` (${p.engine}/${p.category}): ${p.description}${p.supportsScrollTrigger ? " [scroll]" : ""}`
              )
              .join("\n")}`,
          },
        ],
        structuredContent: { engines, presets },
      };
    }
  );

  // ===== design_preview_animation =====
  server.registerTool(
    "design_preview_animation",
    {
      title: "Preview Animation Code",
      description: `Generate preview code for a specific animation preset (upgrade plan U1).

Returns the runnable code (CSS keyframes or GSAP script) that would be applied
to a component. Useful for inspecting what an animation does before applying it,
or for the client dashboard to play a 1.5s preview.

Args:
  - preset (string): preset name (e.g. "fadeUp", "gsap.splitBlur")
  - selector (string, optional): CSS selector (default "#preview-target")
  - params (object, optional): preset parameters (duration, stagger, etc.)
  - scrollTrigger (object, optional): ScrollTrigger config for gsap presets

Example:
  design_preview_animation(preset="gsap.splitBlur", selector=".hero-title", params={duration:1, stagger:0.05})`,
      inputSchema: {
        preset: z.string().describe("Preset name (e.g. 'fadeUp' or 'gsap.splitBlur')"),
        selector: z.string().optional().describe("CSS selector (default '#preview-target')"),
        params: z.record(z.string(), z.any()).optional().describe("Preset parameters"),
        scrollTrigger: z
          .record(z.string(), z.any())
          .optional()
          .describe("ScrollTrigger config (start, end, scrub, pin, markers, toggleActions)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const preset = getAnimationPreset(params.preset);
        if (!preset) {
          return { content: [{ type: "text", text: `Error: preset "${params.preset}" not found.` }] };
        }
        const selector = params.selector || "#preview-target";
        const mergedParams = { ...getDefaultParams(preset), ...(params.params || {}) } as Record<
          string,
          number | string | boolean
        >;

        let code = "";
        if (preset.engine === "css") {
          code = serializeCssPreset(params.preset, selector, mergedParams);
        } else {
          const st = params.scrollTrigger as
            | { start?: string; end?: string; scrub?: boolean | number; pin?: boolean; markers?: boolean; toggleActions?: string }
            | undefined;
          code = serializeGsapPreset(params.preset, selector, mergedParams, st);
        }

        return {
          content: [
            {
              type: "text",
              text: `# Preview: ${params.preset}\n\n**Engine:** ${preset.engine}\n**Category:** ${preset.category}\n**Deps:** ${preset.deps.join(", ") || "none"}\n\n\`\`\`${preset.engine === "css" ? "css" : "javascript"}\n${code}\n\`\`\``,
            },
          ],
          structuredContent: { preset: params.preset, engine: preset.engine, code, deps: preset.deps },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // ===== design_set_scroll_trigger =====
  server.registerTool(
    "design_set_scroll_trigger",
    {
      title: "Set ScrollTrigger Config",
      description: `Configure GSAP ScrollTrigger for a component's animation (upgrade plan U1).

Requires the component to already have a GSAP animation preset set via
design_set_animation(engine="gsap", entry="gsap.scrollReveal", ...).

Args:
  - component_id (string): component to attach ScrollTrigger to
  - start (string, optional): ScrollTrigger start position (e.g. "top 80%")
  - end (string, optional): ScrollTrigger end position (e.g. "bottom 20%")
  - scrub (bool|number, optional): scrub the animation with scroll
  - pin (bool, optional): pin the element during scroll
  - markers (bool, optional): show debug markers
  - toggleActions (string, optional): e.g. "play none none reverse"

Example:
  design_set_scroll_trigger(component_id="comp_123", start="top 80%", scrub=true)`,
      inputSchema: {
        component_id: z.string().describe("Component ID"),
        start: z.string().optional().describe('Start position, e.g. "top 80%"'),
        end: z.string().optional().describe('End position, e.g. "bottom 20%"'),
        scrub: z.union([z.boolean(), z.number()]).optional().describe("Scrub with scroll"),
        pin: z.boolean().optional().describe("Pin element during scroll"),
        markers: z.boolean().optional().describe("Show debug markers"),
        toggleActions: z.string().optional().describe('Toggle actions, e.g. "play none none reverse"'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const success = stateStore.setAnimation(
          params.component_id,
          {
            scrollTrigger: {
              start: params.start,
              end: params.end,
              scrub: params.scrub,
              pin: params.pin,
              markers: params.markers,
              toggleActions: params.toggleActions,
            },
          },
          "ai"
        );
        if (!success) {
          return { content: [{ type: "text", text: `Error: Component "${params.component_id}" not found.` }] };
        }
        return {
          content: [{ type: "text", text: `ScrollTrigger configured for ${params.component_id}.` }],
          structuredContent: { success: true, component_id: params.component_id },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // ===== design_set_export_runtime =====
  server.registerTool(
    "design_set_export_runtime",
    {
      title: "Set Export Runtime Level",
      description: `Set the runtime bundle level for HTML export (upgrade plan U4).

Levels:
  - minimal  : zero external JS — only inline CSS animations are emitted.
  - standard : inject GSAP (+ ScrollTrigger) and Lenis when the active style's
               motion profile prefers gsap or the scroll mode is lenis-gsap.
  - full     : standard + Vanta/three.js CDNs and per-background init scripts.

Also returns the current style's motion profile (entry/hover/duration/easing/
stagger/engine) so the agent knows which runtime the export will pull in.

Args:
  - runtime (string): one of "minimal" | "standard" | "full"

Example:
  design_set_export_runtime(runtime="full")`,
      inputSchema: {
        runtime: z.enum(["minimal", "standard", "full"]).describe("Export runtime level"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        stateStore.setExportRuntime(params.runtime, "ai");
        const style = (stateStore.getState().style as string) || "minimal";
        const motion = getMotionProfile(style);
        return {
          content: [
            {
              type: "text",
              text: `Export runtime set to "${params.runtime}".\n\nActive style "${style}" motion profile:\n- engine: ${motion.engine}\n- entry: ${motion.entry}\n- hover: ${motion.hover}\n- duration: ${motion.duration}s · easing: ${motion.easing} · stagger: ${motion.stagger}s\n- scrollReveal: ${motion.scrollReveal}`,
            },
          ],
          structuredContent: {
            success: true,
            runtime: params.runtime,
            style,
            motionProfile: motion,
            availableProfiles: Object.keys(STYLE_MOTION_PROFILES),
          },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
}
