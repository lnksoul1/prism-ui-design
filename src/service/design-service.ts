/**
 * Shared design-mutation service.
 *
 * Every mutation path (MCP tools, and any future transport) routes through these
 * functions so channels cannot drift apart. The service also validates inputs
 * that the state store itself is intentionally permissive about (e.g. the set of
 * supported component types).
 */

import { stateStore, type AlignMode, type AnimationDef, type ComponentBehavior, type ComponentLayout, type ElementMeta, type PageBackground, type ZOrderMode, type ImportRecord } from "../state.js";
import { applyStyleTokenSet } from "../tokens.js";
import { validateComponentProps } from "../component-schemas.js";

export type MutationSource = "ai" | "user";

/** Component types the exporter knows how to render. */
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
  "timeline",
  "faq",
  "form",
  "image",
  "tabs",
  "accordion",
  "carousel",
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
  "glass_card",
  "marquee",
  "feature_grid",
  "text",
  "container",
  "html_fragment",
]);

export function isKnownComponentType(type: string): boolean {
  return COMPONENT_TYPES.has(type);
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

export function initProject(projectName: string, baseColor?: string): InitProjectResult {
  stateStore.clearAll("ai");
  stateStore.setProjectName(projectName, "ai");
  stateStore.setStyle("minimal", "ai");

  const tokens = applyStyleTokenSet(stateStore, baseColor, "ai");
  return {
    success: true,
    project_name: projectName,
    style: "minimal",
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

export function applyStyle(_style: string, source: MutationSource = "user"): boolean {
  // Style presets were removed with the dashboard; "minimal" is the only base.
  stateStore.setStyle("minimal", source);
  applyStyleTokenSet(stateStore, undefined, source);
  return true;
}

export function setProjectName(projectName: string, source: MutationSource = "user"): boolean {
  stateStore.setProjectName(projectName, source);
  return true;
}

export function setStyle(_style: string, source: MutationSource = "user"): boolean {
  stateStore.setStyle("minimal", source);
  return true;
}

/** Discard all state and start over. Used by design_init. */
export function clearAll(source: MutationSource = "user"): void {
  stateStore.clearAll(source);
}

/** Record provenance for an imported page. */
export function setImport(pageId: string, record: ImportRecord, source: MutationSource = "user"): void {
  stateStore.setImport(pageId, record, source);
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
  if (!isKnownComponentType(type)) {
    throw new Error(
      `Unknown component type "${type}". Supported types: ${[...COMPONENT_TYPES].sort().join(", ")}`
    );
  }
  // 组件 props schema (Phase 2.2): 校验并按类型规范化，AI 参数更可预测。
  const normalized = validateComponentProps(type, props);
  return stateStore.addComponent(type, variant, normalized, parentId, source);
}

export function updateComponent(
  id: string,
  props: Record<string, unknown>,
  source: MutationSource = "user",
  layout?: Partial<ComponentLayout>,
  flags?: { visible?: boolean; locked?: boolean }
): boolean {
  const node = stateStore.getState().components.length
    ? stateStore.getState().components.find((c) => c.id === id)
    : undefined;
  const type = node?.type;
  const normalized = type ? validateComponentProps(type, props) : props;
  return stateStore.updateComponent(id, normalized, source, layout, flags);
}

export function renameComponent(id: string, name: string, source: MutationSource = "user"): boolean {
  return stateStore.renameComponent(id, name, source);
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

export function setElementMeta(
  componentId: string,
  path: string,
  meta: { behavior?: ComponentBehavior | null; kind?: ElementMeta["kind"] | null; css?: Record<string, string> | null } | null,
  source: MutationSource = "user"
): boolean {
  return stateStore.setElementMeta(componentId, path, meta, source);
}

export function moveArrayItem(
  componentId: string,
  path: string,
  position: "before" | "after",
  targetPath: string,
  source: MutationSource = "user"
): boolean {
  return stateStore.moveArrayItem(componentId, path, position, targetPath, source);
}

export function setPageBackground(background: PageBackground | null, source: MutationSource = "user"): boolean {
  return stateStore.setPageBackground(background, source);
}

export function alignComponents(ids: string[], mode: AlignMode, source: MutationSource = "user"): boolean {
  return stateStore.alignComponents(ids, mode, source);
}

export function zOrderComponent(id: string, mode: ZOrderMode, source: MutationSource = "user"): boolean {
  return stateStore.zOrderComponent(id, mode, source);
}

export function reparentComponent(id: string, parentId: string | null, source: MutationSource = "user"): boolean {
  return stateStore.reparentComponent(id, parentId, source);
}

export function groupComponents(ids: string[], source: MutationSource = "user") {
  return stateStore.groupComponents(ids, source);
}

export function ungroupComponents(groupId: string, source: MutationSource = "user"): boolean {
  return stateStore.ungroupComponents(groupId, source);
}

export function moveComponentToPage(id: string, targetPageId: string, source: MutationSource = "user"): boolean {
  return stateStore.moveComponentToPage(id, targetPageId, source);
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

// NOTE: the HTTP/WebSocket transport was removed in the route-B refactor.
// The former `wsMessageSchema` + `applyClientMessage` vocabulary lived here and
// had no callers left. Every mutation arrives through a registered MCP tool,
// which calls the functions above (never `stateStore` directly) so that input
// validation — component type allowlist, prop schemas, token categories —
// cannot be bypassed by any one tool.