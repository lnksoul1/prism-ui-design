/**
 * Shared design-mutation service.
 *
 * Both the REST endpoints and the WebSocket message handler in `index.ts`
 * route every mutation through these functions so the two channels can never
 * drift apart (improvement plan A3). The service also validates inputs that
 * the state store itself is intentionally permissive about (e.g. the set of
 * supported component types).
 */

import { z } from "zod";
import { stateStore, type AnimationDef, type ComponentLayout } from "../state.js";
import { applyStyleTokenSet } from "../tokens.js";
import { STYLE_PRESETS } from "../constants.js";

export type MutationSource = "ai" | "user";

/** Component types rendered by the dashboard client (kept in sync with client/app.js). */
export const COMPONENT_TYPES = new Set([
  "hero",
  "navbar",
  "card_grid",
  "card",
  "cta",
  "footer",
  "text_section",
  "feature_list",
  "button",
  "stats",
  "pricing",
  "testimonial",
  "banner",
  "timeline",
  "faq",
  "form",
  "image",
  "tabs",
  "accordion",
  "carousel",
  "modal",
  "sidebar",
  "breadcrumb",
  "pagination",
  "progress",
  "badge",
  "avatar",
  "input",
  "grid",
  "table",
  "alert",
  "tooltip",
  "bento_grid",
  "skeleton",
  "command_palette",
  "glass_card",
  "fab",
  "marquee",
  "feature_grid",
  "cookie_banner",
  "toggle",
]);

export function isKnownComponentType(type: string): boolean {
  return COMPONENT_TYPES.has(type);
}

export function assertKnownComponentType(type: string): void {
  if (!isKnownComponentType(type)) {
    throw new Error(
      `Unknown component type "${type}". Supported types: ${[...COMPONENT_TYPES].sort().join(", ")}`
    );
  }
}

// ===== Project / style =====

export interface InitProjectResult {
  success: boolean;
  project_name: string;
  style: string;
  base_color: string;
  font: string;
  token_count: number;
}

export function initProject(projectName: string, style: string, baseColor?: string): InitProjectResult {
  stateStore.clearAll("ai");
  stateStore.setProjectName(projectName, "ai");
  stateStore.setStyle(style, "ai");

  const preset = STYLE_PRESETS[style];
  if (!preset) {
    throw new Error(`Unknown style: ${style}`);
  }

  const tokens = applyStyleTokenSet(stateStore, style, baseColor, "ai");
  return {
    success: true,
    project_name: projectName,
    style,
    base_color: tokens.baseHex,
    font: `${tokens.font.display.name} + ${tokens.font.body.name}`,
    token_count:
      Object.keys(tokens.colors).length +
      Object.keys(tokens.typography).length +
      Object.keys(tokens.spacing).length +
      Object.keys(tokens.shadows).length +
      Object.keys(tokens.radii).length +
      Object.keys(tokens.transitions).length,
  };
}

export function applyStyle(style: string, source: MutationSource = "user"): boolean {
  if (!STYLE_PRESETS[style]) return false;
  stateStore.setStyle(style, source);
  applyStyleTokenSet(stateStore, style, undefined, source);
  return true;
}

// ===== Tokens =====

const TOKEN_CATEGORIES = [
  "colors",
  "typography",
  "spacing",
  "shadows",
  "radii",
  "transitions",
] as const;

export type TokenCategory = (typeof TOKEN_CATEGORIES)[number];

export function isTokenCategory(value: string): value is TokenCategory {
  return (TOKEN_CATEGORIES as readonly string[]).includes(value);
}

export function setToken(
  category: string,
  key: string,
  value: string,
  source: MutationSource = "user"
): boolean {
  if (!isTokenCategory(category)) {
    throw new Error(`Invalid token category "${category}". Valid: ${TOKEN_CATEGORIES.join(", ")}`);
  }
  stateStore.setToken(category, key, value, source);
  return true;
}

export function setTokenBatch(
  category: string,
  tokens: Record<string, string>,
  source: MutationSource = "user"
): boolean {
  if (!isTokenCategory(category)) {
    throw new Error(`Invalid token category "${category}". Valid: ${TOKEN_CATEGORIES.join(", ")}`);
  }
  stateStore.setTokenBatch(category, tokens, source);
  return true;
}

export function deleteToken(category: string, key: string, source: MutationSource = "user"): boolean {
  if (!isTokenCategory(category)) {
    throw new Error(`Invalid token category "${category}". Valid: ${TOKEN_CATEGORIES.join(", ")}`);
  }
  return stateStore.deleteToken(category, key, source);
}

// ===== Components =====

export function addComponent(
  type: string,
  variant: string | undefined,
  props: Record<string, unknown>,
  parentId: string | null,
  source: MutationSource = "user"
) {
  assertKnownComponentType(type);
  return stateStore.addComponent(type, variant, props, parentId, source);
}

export function updateComponent(
  id: string,
  props: Record<string, unknown>,
  source: MutationSource = "user",
  layout?: Partial<ComponentLayout>,
  flags?: { visible?: boolean; locked?: boolean }
): boolean {
  return stateStore.updateComponent(id, props, source, layout, flags);
}

export function removeComponent(id: string, source: MutationSource = "user"): boolean {
  return stateStore.removeComponent(id, source);
}

export function reorderComponent(
  fromId: string,
  toId: string,
  position: "before" | "after",
  source: MutationSource = "user"
): boolean {
  return stateStore.reorderComponent(fromId, toId, position, source);
}

export function setAnimation(componentId: string, animation: AnimationDef, source: MutationSource = "user"): boolean {
  return stateStore.setAnimation(componentId, animation, source);
}

// ===== Pages =====

export function addPage(name: string, source: MutationSource = "user") {
  return stateStore.addPage(name, source);
}

export function switchPage(pageId: string, source: MutationSource = "user"): boolean {
  return stateStore.switchPage(pageId, source);
}

export function removePage(pageId: string, source: MutationSource = "user"): boolean {
  return stateStore.removePage(pageId, source);
}

export function renamePage(pageId: string, name: string, source: MutationSource = "user"): boolean {
  return stateStore.renamePage(pageId, name, source);
}

// ===== Theme / undo / prompt =====

export function setTheme(mode: "light" | "dark", source: MutationSource = "user"): boolean {
  stateStore.setThemeMode(mode, source);
  return true;
}

export function setPlatform(platform: string, source: MutationSource = "user"): boolean {
  stateStore.setPlatform(platform, source);
  return true;
}

export function undo() {
  return stateStore.undo();
}

export function redo() {
  return stateStore.redo();
}

export function setPendingPrompt(prompt: string): void {
  stateStore.setPendingPrompt(prompt);
  stateStore.recordPrompt(prompt);
}

// ===== WebSocket message schemas =====

export const wsMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("set_token"),
    category: z.string(),
    key: z.string().min(1),
    value: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("update_component"),
    id: z.string().min(1),
    props: z.record(z.unknown()),
    layout: z
      .object({
        x: z.number().optional(),
        y: z.number().optional(),
        w: z.number().optional(),
        h: z.number().optional(),
      })
      .optional(),
    visible: z.boolean().optional(),
    locked: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("remove_component"),
    id: z.string().min(1),
  }),
  z.strictObject({ type: z.literal("undo") }),
  z.strictObject({ type: z.literal("redo") }),
  z.strictObject({
    type: z.literal("add_page"),
    name: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("switch_page"),
    pageId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("remove_page"),
    pageId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("rename_page"),
    pageId: z.string().min(1),
    name: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("reorder_component"),
    fromId: z.string().min(1),
    toId: z.string().min(1),
    position: z.enum(["before", "after"]),
  }),
  z.strictObject({
    type: z.literal("set_theme"),
    mode: z.enum(["light", "dark"]),
  }),
  z.strictObject({
    type: z.literal("set_platform"),
    platform: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("prompt"),
    prompt: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("add_component"),
    component_type: z.string().min(1),
    variant: z.string().optional(),
    props: z.record(z.unknown()).optional(),
  }),
  z.strictObject({
    type: z.literal("set_animation"),
    component_id: z.string().min(1),
    entry: z.string().optional(),
    hover: z.string().optional(),
    duration: z.number().optional(),
    delay: z.number().optional(),
    curve: z.string().optional(),
    stagger: z.number().optional(),
  }),
  z.strictObject({
    type: z.literal("apply_style"),
    style: z.string().min(1),
  }),
]);

export type WsClientMessage = z.infer<typeof wsMessageSchema>;

/**
 * Apply a validated WebSocket client message to the state store.
 * Returns a short human-readable summary (or null when there is nothing to
 * report back, e.g. undo/redo where the client derives state from broadcasts).
 */
export function applyClientMessage(msg: WsClientMessage): { ok: boolean; detail: string } {
  switch (msg.type) {
    case "set_token":
      setToken(msg.category, msg.key, msg.value, "user");
      return { ok: true, detail: `token ${msg.category}.${msg.key}` };
    case "update_component": {
      const ok = updateComponent(msg.id, msg.props, "user", msg.layout, {
        visible: msg.visible,
        locked: msg.locked,
      });
      return { ok, detail: ok ? `component ${msg.id}` : `component ${msg.id} not found` };
    }
    case "remove_component": {
      const ok = removeComponent(msg.id, "user");
      return { ok, detail: ok ? `component ${msg.id}` : `component ${msg.id} not found` };
    }
    case "undo":
      return { ok: undo(), detail: "undo" };
    case "redo":
      return { ok: redo(), detail: "redo" };
    case "add_page": {
      const page = addPage(msg.name, "user");
      return { ok: true, detail: `page ${page.name}` };
    }
    case "switch_page": {
      const ok = switchPage(msg.pageId, "user");
      return { ok, detail: ok ? `page ${msg.pageId}` : `page ${msg.pageId} not found` };
    }
    case "remove_page": {
      const ok = removePage(msg.pageId, "user");
      return { ok, detail: ok ? `page ${msg.pageId}` : `page ${msg.pageId} not found` };
    }
    case "rename_page": {
      const ok = renamePage(msg.pageId, msg.name, "user");
      return { ok, detail: ok ? `page ${msg.pageId}` : `page ${msg.pageId} not found` };
    }
    case "reorder_component": {
      const ok = reorderComponent(msg.fromId, msg.toId, msg.position, "user");
      return { ok, detail: ok ? `${msg.fromId} → ${msg.toId}` : "reorder failed" };
    }
    case "set_theme":
      setTheme(msg.mode, "user");
      return { ok: true, detail: `theme ${msg.mode}` };
    case "set_platform":
      setPlatform(msg.platform, "user");
      return { ok: true, detail: `platform ${msg.platform}` };
    case "prompt":
      setPendingPrompt(msg.prompt);
      return { ok: true, detail: "prompt queued" };
    case "add_component": {
      try {
        const node = addComponent(msg.component_type, msg.variant, msg.props || {}, null, "user");
        return { ok: true, detail: `${node.type} ${node.id}` };
      } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : String(error) };
      }
    }
    case "set_animation": {
      const animation: AnimationDef = {};
      if (msg.entry !== undefined) animation.entry = msg.entry;
      if (msg.hover !== undefined) animation.hover = msg.hover;
      if (msg.duration !== undefined) animation.duration = msg.duration;
      if (msg.delay !== undefined) animation.delay = msg.delay;
      if (msg.curve !== undefined) animation.curve = msg.curve;
      if (msg.stagger !== undefined) animation.stagger = msg.stagger;
      const ok = setAnimation(msg.component_id, animation, "user");
      return { ok, detail: ok ? `animation ${msg.component_id}` : `component ${msg.component_id} not found` };
    }
    case "apply_style": {
      const ok = applyStyle(msg.style, "user");
      return { ok, detail: ok ? `style ${msg.style}` : `unknown style ${msg.style}` };
    }
    default:
      return { ok: false, detail: `unsupported message type` };
  }
}
