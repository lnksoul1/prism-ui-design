/**
 * Spec-alignment tools (prism-design-spec.html §8.2).
 *
 * Small read/write tools that match the design spec's MCP tool list:
 * list style presets / components / pages, set project name, get/delete
 * tokens, and batch-set tokens.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { STYLE_PRESETS } from "../constants.js";
import { stateStore } from "../state.js";
import { tokensToDtcg } from "../tokens/dtcgi.js";
import { deleteToken, setPlatform, setTokenBatch } from "../service/design-service.js";

const PLATFORMS = [
  "web-desktop",
  "web-tablet",
  "web-mobile",
  "desktop-macos",
  "desktop-windows",
  "mobile-ios",
  "mobile-android",
] as const;

export function registerSpecTools(server: McpServer): void {
  server.registerTool(
    "design_list_style_presets",
    {
      title: "List Style Presets",
      description: "List all 14 built-in style presets with their key parameters.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const presets = Object.entries(STYLE_PRESETS).map(([id, p]) => ({
        id,
        name: p.name,
        description: p.description,
        base_hue: p.base_hue,
        saturation: p.saturation,
        lightness: p.lightness,
        radius_style: p.radius_style,
        shadow_style: p.shadow_style,
        spacing_base: p.spacing_base,
      }));
      return {
        content: [
          {
            type: "text" as const,
            text: `# Style Presets (${presets.length})\n\n${presets.map((p) => `- ${p.id} — ${p.name} (hue ${p.base_hue}°, ${p.saturation}% / ${p.lightness}%, radius ${p.radius_style})`).join("\n")}`,
          },
        ],
        structuredContent: { success: true, count: presets.length, presets },
      };
    }
  );

  server.registerTool(
    "design_list_components",
    {
      title: "List Components",
      description: "List components on the current page (id, type, variant, animation).",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const state = stateStore.getState();
      const components = state.components.map((c) => ({
        id: c.id,
        type: c.type,
        variant: c.variant || null,
        animation: c.animation || null,
      }));
      return {
        content: [
          {
            type: "text" as const,
            text: components.length === 0
              ? "No components on the current page."
              : components.map((c, i) => `${i + 1}. ${c.type}${c.variant ? "/" + c.variant : ""} — ${c.id}`).join("\n"),
          },
        ],
        structuredContent: { success: true, count: components.length, components },
      };
    }
  );

  server.registerTool(
    "design_list_pages",
    {
      title: "List Pages",
      description: "List all pages with component counts and the active page.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const state = stateStore.getState();
      const pages = state.pages.map((p) => ({
        id: p.id,
        name: p.name,
        component_count: p.components.length,
        active: p.id === state.currentPageId,
      }));
      return {
        content: [
          {
            type: "text" as const,
            text: pages.map((p) => `${p.active ? "▶" : " "} ${p.name} — ${p.component_count} components (${p.id})`).join("\n"),
          },
        ],
        structuredContent: { success: true, count: pages.length, pages },
      };
    }
  );

  server.registerTool(
    "design_set_project_name",
    {
      title: "Set Project Name",
      description: "Rename the current project.",
      inputSchema: {
        name: z.string().min(1).describe("New project name"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      stateStore.setProjectName(params.name, "ai");
      return {
        content: [{ type: "text" as const, text: `Project renamed to "${params.name}".` }],
        structuredContent: { success: true, name: params.name },
      };
    }
  );

  server.registerTool(
    "design_get_tokens",
    {
      title: "Get Design Tokens",
      description: "Get the current token set as W3C DTCG JSON.",
      inputSchema: {
        category: z.string().optional().describe("Filter by category (colors, typography, spacing, shadows, radii, transitions)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const dtcg = tokensToDtcg(stateStore.getState().tokens);
      const filtered = params.category ? { [params.category]: dtcg[params.category] || {} } : dtcg;
      const count = Object.values(filtered).reduce((sum, group) => sum + Object.keys(group).length, 0);
      return {
        content: [{ type: "text" as const, text: `# Tokens (${count})\n\n${JSON.stringify(filtered, null, 2).slice(0, 4000)}` }],
        structuredContent: { success: true, count, tokens: filtered },
      };
    }
  );

  server.registerTool(
    "design_set_token_batch",
    {
      title: "Set Token Batch",
      description: "Set multiple tokens in one category at once.",
      inputSchema: {
        category: z.enum(["colors", "typography", "spacing", "shadows", "radii", "transitions"]),
        tokens: z.record(z.string()).describe("Token key → value map"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      setTokenBatch(params.category, params.tokens, "ai");
      return {
        content: [
          {
            type: "text" as const,
            text: `Updated ${Object.keys(params.tokens).length} tokens in ${params.category}.`,
          },
        ],
        structuredContent: { success: true, category: params.category, count: Object.keys(params.tokens).length },
      };
    }
  );

  server.registerTool(
    "design_delete_token",
    {
      title: "Delete Token",
      description: "Delete a single design token.",
      inputSchema: {
        category: z.enum(["colors", "typography", "spacing", "shadows", "radii", "transitions"]),
        key: z.string().min(1),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      const ok = deleteToken(params.category, params.key, "ai");
      return {
        content: [
          {
            type: "text" as const,
            text: ok ? `Deleted ${params.category}.${params.key}.` : `Token ${params.category}.${params.key} not found.`,
          },
        ],
        structuredContent: { success: ok, category: params.category, key: params.key },
      };
    }
  );

  server.registerTool(
    "design_set_platform",
    {
      title: "Set Preview Platform",
      description: `Set the preview platform the user is viewing. The client dashboard keeps the
same set of platforms in sync, so the AI can adapt layouts per platform.

Platforms: web-desktop, web-tablet, web-mobile, desktop-macos, desktop-windows, mobile-ios, mobile-android`,
      inputSchema: {
        platform: z.enum(PLATFORMS).describe("Preview platform"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      setPlatform(params.platform, "ai");
      return {
        content: [{ type: "text" as const, text: `Preview platform set to ${params.platform}.` }],
        structuredContent: { success: true, platform: params.platform },
      };
    }
  );
}
