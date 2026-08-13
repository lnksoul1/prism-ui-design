/**
 * Vanta 3D background tools (upgrade plan U2).
 *
 * Three MCP tools:
 *   - design_list_vanta_effects: list 14 effects + param schemas
 *   - design_set_vanta_background: attach a Vanta background to a component/section
 *   - design_preview_vanta: generate a standalone preview HTML for an effect
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateStore } from "../state.js";
import { VANTA_EFFECTS, listVantaEffects, getVantaEffect } from "../vanta-effects.js";
import { CDN_URLS } from "../animations/serializer.js";

export function registerVantaTools(server: McpServer): void {
  // ===== design_list_vanta_effects =====
  server.registerTool(
    "design_list_vanta_effects",
    {
      title: "List Vanta 3D Background Effects",
      description: `List the 14 built-in Vanta.js WebGL 3D background effects (upgrade plan U2).

Each effect renders on three.js and accepts a color + effect-specific params
(waveHeight, shininess, points, speed, etc.). Effects can be attached to
Hero/CTA/Section components or used as standalone vanta_background components.

Effects: ${VANTA_EFFECTS.map((e) => e.name).join(", ")}

Returns each effect's name, description, and full param schema.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const effects = listVantaEffects();
      return {
        content: [
          {
            type: "text",
            text: `# Vanta 3D Background Effects (${effects.length})\n\n${effects
              .map((e) => `- **${e.name}** (${e.key}): ${e.description} — ${e.paramCount} params`)
              .join("\n")}`,
          },
        ],
        structuredContent: { effects, total: effects.length },
      };
    }
  );

  // ===== design_set_vanta_background =====
  server.registerTool(
    "design_set_vanta_background",
    {
      title: "Set Vanta 3D Background",
      description: `Attach a Vanta.js WebGL 3D background to a component or section (upgrade plan U2).

The background renders behind the component's content. On export (runtime=full),
three.js + the Vanta effect script are injected as CDN scripts.

Args:
  - target_id (string): component_id or section_id to attach the background to
  - effect (string): one of ${VANTA_EFFECTS.map((e) => e.name).join(", ")}
  - params (object, optional): effect parameters (color, waveHeight, etc.)
  - mouseControls (bool, default true): respond to mouse
  - touchControls (bool, default true): respond to touch
  - gyroControls (bool, default false): respond to gyroscope

Example:
  design_set_vanta_background(target_id="comp_hero_1", effect="waves", params={color:0x0044aa, waveHeight:20})`,
      inputSchema: {
        target_id: z.string().describe("Component ID or section ID to attach the Vanta background to"),
        effect: z
          .string()
          .describe(`Effect name: ${VANTA_EFFECTS.map((e) => e.name).join(", ")}`),
        params: z
          .record(z.string(), z.any())
          .optional()
          .describe("Effect-specific parameters (color, waveHeight, shininess, etc.)"),
        mouseControls: z.boolean().optional().describe("Mouse controls (default true)"),
        touchControls: z.boolean().optional().describe("Touch controls (default true)"),
        gyroControls: z.boolean().optional().describe("Gyroscope controls (default false)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const effect = getVantaEffect(params.effect);
        if (!effect) {
          return {
            content: [{ type: "text", text: `Error: effect "${params.effect}" not found. Use design_list_vanta_effects to see valid options.` }],
          };
        }

        // Merge default params with user-provided params
        const defaultParams: Record<string, number | string | boolean> = {};
        effect.params.forEach((p) => {
          defaultParams[p.name] = p.default;
        });
        const mergedParams = { ...defaultParams, ...(params.params || {}) };

        const config = stateStore.setVantaBackground(
          params.target_id,
          {
            effect: effect.name,
            params: mergedParams,
            mouseControls: params.mouseControls ?? true,
            touchControls: params.touchControls ?? true,
            gyroControls: params.gyroControls ?? false,
          },
          "ai"
        );

        return {
          content: [{ type: "text", text: `Vanta "${effect.name}" background attached to ${params.target_id}. Export with runtime="full" to include three.js + vanta CDN.` }],
          structuredContent: { success: true, target_id: params.target_id, effect: effect.name, config },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  // ===== design_preview_vanta =====
  server.registerTool(
    "design_preview_vanta",
    {
      title: "Preview Vanta Effect HTML",
      description: `Generate a standalone HTML preview for a Vanta effect (upgrade plan U2).

Returns a complete HTML file with three.js + the Vanta effect CDN injected,
suitable for opening in a browser or embedding in an iframe to preview the
animated background before applying it.

Args:
  - effect (string): one of ${VANTA_EFFECTS.map((e) => e.name).join(", ")}
  - params (object, optional): effect parameters

Example:
  design_preview_vanta(effect="net", params={color:0x00ccff, points:15})`,
      inputSchema: {
        effect: z.string().describe("Effect name"),
        params: z.record(z.string(), z.any()).optional().describe("Effect parameters"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const effect = getVantaEffect(params.effect);
        if (!effect) {
          return { content: [{ type: "text", text: `Error: effect "${params.effect}" not found.` }] };
        }
        const defaultParams: Record<string, number | string | boolean> = {};
        effect.params.forEach((p) => {
          defaultParams[p.name] = p.default;
        });
        const mergedParams = { ...defaultParams, ...(params.params || {}) };

        const paramStr = Object.entries(mergedParams)
          .map(([k, v]) => `${k}: ${typeof v === "number" && k.toLowerCase().includes("color") ? `0x${(v >>> 0).toString(16).padStart(8, "0")}` : JSON.stringify(v)}`)
          .join(", ");

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Vanta Preview: ${effect.name}</title>
<style>html,body{margin:0;height:100%;overflow:hidden}#vanta{position:fixed;inset:0}</style>
</head>
<body>
<div id="vanta"></div>
<script src="${CDN_URLS.three}"></script>
<script src="${CDN_URLS.vantaBase.replace("vanta.min.js", effect.scriptFile)}"></script>
<script>
if (window.VANTA && window.VANTA.${effect.key}) {
  VANTA.${effect.key}({ el: "#vanta", THREE: window.THREE, ${paramStr}, mouseControls: true, touchControls: true });
}
</script>
</body>
</html>`;

        return {
          content: [{ type: "text", text: `# Vanta Preview: ${effect.name}\n\nStandalone HTML preview generated. Save as .html and open in a browser to see the animated 3D background.\n\n\`\`\`html\n${html}\n\`\`\`` }],
          structuredContent: { effect: effect.name, html, deps: ["three.js", effect.scriptFile] },
        };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
}
