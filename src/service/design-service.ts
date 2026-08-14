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
import { stateStore, type AlignMode, type AnimationDef, type ComponentBehavior, type ComponentLayout, type ZOrderMode } from "../state.js";
import { applyStyleTokenSet } from "../tokens.js";
import { STYLE_PRESETS } from "../constants.js";
import { executeUserPrompt, type PromptExecutionResult } from "../prompt-executor.js";
import { getBehaviorTemplate, getComponentTemplate } from "../template-catalog.js";

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
  "text",
  "section",
  "container",
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

export function duplicateComponent(id: string, source: MutationSource = "user") {
  return stateStore.duplicateComponent(id, source);
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

export function setBehavior(componentId: string, behavior: ComponentBehavior | null, source: MutationSource = "user"): boolean {
  return stateStore.setBehavior(componentId, behavior, source);
}

export function alignComponents(ids: string[], mode: AlignMode, source: MutationSource = "user"): boolean {
  return stateStore.alignComponents(ids, mode, source);
}

export function zOrderComponent(id: string, mode: ZOrderMode, source: MutationSource = "user"): boolean {
  return stateStore.zOrderComponent(id, mode, source);
}

// ===== 模板快速变更 (v3.2 支柱⑦ P0) =====

export interface ApplyComponentTemplateResult {
  ok: boolean;
  /** "added" (new block) or "replaced" (swapped an existing component). */
  mode?: "added" | "replaced";
  component_id?: string;
  template_id?: string;
  detail?: string;
}

/**
 * Apply a component template (组件模板): adds the block to the canvas, or —
 * when `targetId` is given — replaces that component in place (keeping its
 * layout position). Falls back to adding when the target no longer exists.
 */
export function applyComponentTemplate(
  templateId: string,
  targetId: string | null,
  source: MutationSource = "user"
): ApplyComponentTemplateResult {
  const template = getComponentTemplate(templateId);
  if (!template) {
    return { ok: false, template_id: templateId, detail: `Unknown component template "${templateId}"` };
  }
  const props = JSON.parse(JSON.stringify(template.props)) as Record<string, unknown>;

  if (targetId) {
    const replaced = stateStore.replaceComponent(
      targetId,
      { type: template.type, variant: template.variant, props, behavior: template.behavior ?? null },
      source
    );
    if (replaced) {
      return {
        ok: true,
        mode: "replaced",
        component_id: targetId,
        template_id: templateId,
        detail: `Replaced component ${targetId} with ${template.name}`,
      };
    }
    // Target missing — fall through and add a fresh block.
  }

  const node = stateStore.addComponent(template.type, template.variant, props, null, source);
  if (template.behavior) {
    stateStore.setBehavior(node.id, template.behavior, source);
  }
  return {
    ok: true,
    mode: "added",
    component_id: node.id,
    template_id: templateId,
    detail: `Added ${template.name} (${node.id})`,
  };
}

export interface ApplyBehaviorTemplateResult {
  ok: boolean;
  component_id?: string;
  template_id?: string;
  behavior?: ComponentBehavior;
  detail?: string;
}

/**
 * Apply a behavior template (交互模板): builds the preset interaction with
 * sensible defaults and binds it to the selected component. Undoable.
 */
export function applyBehaviorTemplate(
  componentId: string,
  templateId: string,
  selectedComponentId: string | null,
  source: MutationSource = "user"
): ApplyBehaviorTemplateResult {
  const template = getBehaviorTemplate(templateId);
  if (!template) {
    return { ok: false, template_id: templateId, detail: `Unknown behavior template "${templateId}"` };
  }
  const state = stateStore.getState();
  const pageIds = state.pages.map((p) => p.id);
  const behavior = template.build({
    currentPageId: state.currentPageId ?? pageIds[0] ?? null,
    pageIds,
    selectedComponentId,
  });
  const ok = stateStore.setBehavior(componentId, behavior, source);
  if (!ok) {
    return { ok: false, component_id: componentId, template_id: templateId, detail: `Component ${componentId} not found` };
  }
  return { ok: true, component_id: componentId, template_id: templateId, behavior, detail: `Bound ${template.name} to ${componentId}` };
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

/**
 * Queue a user prompt and run the built-in executor against it. Returns the
 * executor result so both the REST and WebSocket channels can acknowledge
 * the outcome (executed locally vs. queued for an external agent).
 */
export function submitPrompt(prompt: string): PromptExecutionResult {
  stateStore.setPendingPrompt(prompt);
  stateStore.recordPrompt(prompt);
  const result = executeUserPrompt(prompt);
  if (result.executed) {
    // Handled by the built-in engine: don't leave it queued for the agent.
    stateStore.clearPendingPrompt();
    stateStore.recordPromptExecuted(result.summary, result.action || "prompt_executed");
  }
  return result;
}

/** @deprecated Use submitPrompt (returns the execution result). */
export function setPendingPrompt(prompt: string): void {
  submitPrompt(prompt);
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
  z.strictObject({
    type: z.literal("duplicate_component"),
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
    type: z.literal("set_behavior"),
    component_id: z.string().min(1),
    behavior: z
      .object({
        type: z.enum(["navigate", "link", "toggle", "toast", "submit", "prompt"]),
        page_id: z.string().optional(),
        url: z.string().optional(),
        new_tab: z.boolean().optional(),
        target_component_id: z.string().optional(),
        message: z.string().optional(),
        form_id: z.string().optional(),
        prompt: z.string().optional(),
      })
      .nullable(),
  }),
  z.strictObject({
    type: z.literal("align_components"),
    ids: z.array(z.string().min(1)).min(2),
    mode: z.enum(["left", "center_x", "right", "top", "center_y", "bottom", "distribute_x", "distribute_y"]),
  }),
  z.strictObject({
    type: z.literal("z_order_component"),
    id: z.string().min(1),
    mode: z.enum(["front", "back", "forward", "backward"]),
  }),
  z.strictObject({
    type: z.literal("apply_style"),
    style: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("apply_component_template"),
    template_id: z.string().min(1),
    target_id: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("apply_behavior_template"),
    component_id: z.string().min(1),
    template_id: z.string().min(1),
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
    case "duplicate_component": {
      const copy = duplicateComponent(msg.id, "user");
      return {
        ok: !!copy,
        detail: copy ? `component ${copy.id}` : `component ${msg.id} not found`,
      };
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
    case "set_behavior": {
      const ok = setBehavior(msg.component_id, msg.behavior, "user");
      return { ok, detail: ok ? `behavior ${msg.component_id}` : `component ${msg.component_id} not found` };
    }
    case "align_components": {
      const ok = alignComponents(msg.ids, msg.mode, "user");
      return { ok, detail: ok ? `align ${msg.ids.length} components` : "align failed (need 2+ valid components)" };
    }
    case "z_order_component": {
      const ok = zOrderComponent(msg.id, msg.mode, "user");
      return { ok, detail: ok ? `z-order ${msg.id}` : `component ${msg.id} not found` };
    }
    case "apply_style": {
      const ok = applyStyle(msg.style, "user");
      return { ok, detail: ok ? `style ${msg.style}` : `unknown style ${msg.style}` };
    }
    case "apply_component_template": {
      const result = applyComponentTemplate(msg.template_id, msg.target_id || null, "user");
      return { ok: result.ok, detail: result.detail || result.template_id || "apply component template failed" };
    }
    case "apply_behavior_template": {
      const result = applyBehaviorTemplate(msg.component_id, msg.template_id, msg.component_id, "user");
      return { ok: result.ok, detail: result.detail || result.template_id || "apply behavior template failed" };
    }
    default:
      return { ok: false, detail: `unsupported message type` };
  }
}
