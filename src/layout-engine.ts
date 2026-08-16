/**
 * Server-side smart canvas layout engine (DESIGN.md v1.1 §5.1).
 *
 * The canvas is a single streaming column: components are laid out vertically
 * with `x = 16`, `y = cursor`, `w = containerWidth - 32` and `gap = 16`.
 * User drag/resize updates layout coordinates and suppresses further automatic
 * re-layout until "auto arrange" is invoked again.
 */

import type { ComponentNode, ComponentLayout } from "./state.js";

export const FLOW_X = 16;
export const FLOW_GAP = 16;
export const DEFAULT_CONTAINER_WIDTH = 1200;

const TYPE_HEIGHT_HINTS: Record<string, number> = {
  navbar: 64,
  hero: 360,
  card_grid: 320,
  card: 160,
  cta: 220,
  footer: 160,
  text_section: 140,
  feature_list: 260,
  feature_grid: 260,
  button: 48,
  stats: 160,
  pricing: 360,
  testimonial: 240,
  banner: 180,
  timeline: 280,
  faq: 240,
  form: 300,
  image: 200,
  tabs: 80,
  accordion: 200,
  carousel: 280,
  modal: 240,
  sidebar: 320,
  breadcrumb: 48,
  pagination: 56,
  progress: 40,
  badge: 32,
  avatar: 48,
  input: 56,
  grid: 240,
  table: 280,
  alert: 64,
  tooltip: 40,
  bento_grid: 340,
  skeleton: 200,
  command_palette: 320,
  glass_card: 180,
  fab: 56,
  marquee: 120,
  cookie_banner: 96,
  toggle: 40,
  text: 40,
  section: 240,
  container: 240,
  rect: 120,
  ellipse: 120,
  arrow: 48,
  line: 8,
  note: 120,
  connector: 48,
  html_fragment: 320,
};

/** Resolve the streaming-column width for a platform preset. */
export function containerWidthForPlatform(platform?: string): number {
  switch (platform) {
    case "web-mobile":
    case "mobile-ios":
    case "mobile-android":
      return 375;
    case "web-tablet":
      return 768;
    case "desktop-macos":
    case "desktop-windows":
    default:
      return DEFAULT_CONTAINER_WIDTH;
  }
}

/** Estimate a component height when the measured height is not available yet. */
export function estimateHeight(component: ComponentNode): number {
  const hint = TYPE_HEIGHT_HINTS[component.type] ?? 120;
  if (component.children && component.children.length > 0) {
    return Math.max(hint, component.children.length * 120 + FLOW_GAP);
  }
  return hint;
}

/**
 * Fill missing `layout` for top-level components using the streaming-column
 * algorithm. Components that already have a layout are left untouched; the
 * cursor continues below the bottom-most existing component.
 */
export function ensureTopLevelLayouts(
  components: ComponentNode[],
  containerWidth = DEFAULT_CONTAINER_WIDTH
): ComponentNode[] {
  let cursor = FLOW_X;
  const w = Math.max(containerWidth - FLOW_X * 2, 320);
  for (const comp of components) {
    if (!comp.layout) {
      const h = estimateHeight(comp);
      comp.layout = { x: FLOW_X, y: cursor, w, h };
      cursor += h + FLOW_GAP;
    } else {
      cursor = Math.max(cursor, comp.layout.y + (comp.layout.h || estimateHeight(comp)) + FLOW_GAP);
    }
  }
  return components;
}

/**
 * Re-layout all top-level components from the top of the page.
 * Used by the "auto arrange" action (MCP / REST / client toolbar).
 */
export function autoLayoutTopLevel(
  components: ComponentNode[],
  containerWidth = DEFAULT_CONTAINER_WIDTH
): ComponentNode[] {
  let cursor = FLOW_X;
  const w = Math.max(containerWidth - FLOW_X * 2, 320);
  for (const comp of components) {
    const h = comp.layout?.h || estimateHeight(comp);
    comp.layout = { x: FLOW_X, y: cursor, w, h };
    cursor += h + FLOW_GAP;
  }
  return components;
}

/** Apply auto-layout to every page in the state pages list. */
export function autoLayoutPages(
  pages: Array<{ id: string; name: string; components: ComponentNode[] }>,
  platform?: string
): void {
  const containerWidth = containerWidthForPlatform(platform);
  for (const page of pages) {
    ensureTopLevelLayouts(page.components, containerWidth);
  }
}
