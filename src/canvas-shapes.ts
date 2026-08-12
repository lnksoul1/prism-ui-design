/**
 * Canvas document helpers (方案A - canvas-first).
 *
 * A "canvas doc" is an opaque tldraw snapshot produced by the browser
 * editor. These helpers translate between that snapshot and Prism's own
 * `ComponentNode[]` model, and can render a standalone HTML file from the
 * drawing so the canvas becomes the source of truth for the page.
 */

import type { ComponentNode, DesignTokens } from "./state.js";

interface CanvasShape {
  id?: string;
  typeName?: string;
  type?: string;
  x?: number;
  y?: number;
  rotation?: number;
  parentId?: string;
  meta?: Record<string, unknown>;
  props?: Record<string, unknown>;
}

interface CanvasDoc {
  document?: {
    schemaVersion?: number;
    store?: Record<string, CanvasShape>;
  };
}

function asDoc(doc: unknown): CanvasDoc {
  if (!doc || typeof doc !== "object") return {};
  return doc as CanvasDoc;
}

function shapeStore(doc: unknown): CanvasShape[] {
  const d = asDoc(doc);
  const store = d.document?.store;
  if (!store || typeof store !== "object") return [];
  return Object.values(store).filter(
    (record): record is CanvasShape =>
      !!record && typeof record === "object" && (record as CanvasShape).typeName === "shape"
  );
}

/**
 * Extract plain text from a tldraw rich-text value, which may be a plain
 * string (older versions), a tiptap document, or nested content arrays.
 */
export function extractPlainText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractPlainText).join("");
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  if (typeof obj.text === "string") return obj.text;
  if (Array.isArray(obj.content)) return obj.content.map(extractPlainText).join("");
  return "";
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** tldraw theme color names -> CSS hex (kept small; unknown names pass through). */
const TL_COLOR_HEX: Record<string, string> = {
  black: "#000000",
  grey: "#9CA3AF",
  blue: "#3B82F6",
  "light-blue": "#93C5FD",
  green: "#22C55E",
  "light-green": "#86EFAC",
  red: "#EF4444",
  "light-red": "#FCA5A5",
  yellow: "#EAB308",
  "light-yellow": "#FDE047",
  orange: "#F97316",
  "light-orange": "#FDBA74",
  violet: "#8B5CF6",
  "light-violet": "#C4B5FD",
};

const TL_FONT_FAMILY: Record<string, string> = {
  sans: "sans-serif",
  serif: "serif",
  mono: "monospace",
};

const TL_FONT_SIZE_PX: Record<string, number> = {
  s: 12,
  m: 16,
  l: 24,
  xl: 36,
};

function normalizeColor(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  return TL_COLOR_HEX[value] || value;
}

function shapeBounds(shape: CanvasShape): { x: number; y: number; w: number; h: number } {
  const props = shape.props || {};
  return {
    x: num(shape.x),
    y: num(shape.y),
    w: num(props.w),
    h: num(props.h),
  };
}

function cloneMetaComponent(meta: Record<string, unknown>): ComponentNode | null {
  const type = meta.componentType;
  if (typeof type !== "string" || !type) return null;
  const props =
    meta.componentProps && typeof meta.componentProps === "object"
      ? (JSON.parse(JSON.stringify(meta.componentProps)) as Record<string, unknown>)
      : {};
  return {
    id:
      typeof meta.componentId === "string"
        ? meta.componentId
        : `comp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    variant: typeof meta.componentVariant === "string" ? meta.componentVariant : undefined,
    props,
    children: [],
  };
}

function makeComponent(type: string, props: Record<string, unknown>, bounds: { x: number; y: number; w: number; h: number }): ComponentNode {
  return {
    id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    props,
    layout: { x: bounds.x, y: bounds.y, w: Math.max(1, bounds.w), h: Math.max(1, bounds.h) },
    children: [],
  };
}

function guessComponent(shape: CanvasShape, assets: Map<string, { src?: string; name?: string }>): ComponentNode | null {
  const type = shape.type;
  const props = shape.props || {};
  const bounds = shapeBounds(shape);

  if (!type) return null;

  switch (type) {
    case "text":
    case "note": {
      const text = extractPlainText(props.richText ?? props.text);
      if (!text.trim()) return null;
      const fontSize = TL_FONT_SIZE_PX[String(props.size || "m")] || 16;
      const fontFamily = TL_FONT_FAMILY[String(props.font || "sans")] || "sans-serif";
      const color = normalizeColor(props.color);
      const out: Record<string, unknown> = { text, fontSize: `${fontSize}px`, fontFamily };
      if (color) out.color = color;
      if (typeof props.align === "string" && props.align) out.align = props.align;
      return makeComponent("text", out, bounds);
    }
    case "geo": {
      const text = extractPlainText(props.richText ?? props.label ?? "");
      const geo = typeof props.geo === "string" ? props.geo : "rectangle";
      const isCompact = bounds.h <= 72 && bounds.w <= 320;
      const kind = isCompact && text ? "button" : "container";
      const out: Record<string, unknown> = {
        text: text || kind,
        geo,
        fill: props.fill || "solid",
      };
      const color = normalizeColor(props.color);
      if (color) out.color = color;
      if (typeof props.radius === "number" && props.radius > 0) {
        const r = Math.round(props.radius * Math.min(bounds.w, bounds.h) / 2);
        if (r > 0) out.radius = `${r}px`;
      }
      return makeComponent(kind, out, bounds);
    }
    case "frame":
      return makeComponent("section", { title: extractPlainText(props.title ?? "") }, bounds);
    case "prism-block": {
      const text = extractPlainText(props.label ?? "");
      return makeComponent(
        "container",
        {
          text: text || "Block",
          kind: typeof props.kind === "string" ? props.kind : "card",
          bg: typeof props.bg === "string" ? props.bg : "",
          fg: typeof props.fg === "string" ? props.fg : "",
          border: typeof props.border === "string" ? props.border : "",
          radius: typeof props.radius === "string" ? props.radius : "",
        },
        bounds
      );
    }
    case "image": {
      const assetId = typeof props.assetId === "string" ? props.assetId : "";
      const asset = assets.get(assetId);
      return makeComponent("image", { src: asset?.src || "", alt: asset?.name || "image" }, bounds);
    }
    case "embed": {
      const url = typeof props.url === "string" ? props.url : "";
      return makeComponent("container", { text: url, embed: true }, bounds);
    }
    case "group":
      return makeComponent("container", { text: extractPlainText(props.label ?? "") || "Group" }, bounds);
    default:
      // arrow / line / draw / highlight / bookmark / video: decorative, skip
      return null;
  }
}

/**
 * Convert a tldraw canvas snapshot into Prism `ComponentNode[]`.
 * Shapes created from Prism components (meta.prism) restore the original
 * component type/props with the user's new position/size; freshly drawn
 * shapes are mapped with simple heuristics.
 */
export function shapesToComponents(doc: unknown): ComponentNode[] {
  const shapes = shapeStore(doc);
  if (shapes.length === 0) return [];

  const assets = new Map<string, { src?: string; name?: string }>();
  const rawStore = asDoc(doc).document?.store || {};
  for (const record of Object.values(rawStore)) {
    if (record && record.typeName === "asset") {
      const rec = record as CanvasShape & { src?: string; name?: string };
      if (typeof rec.id === "string") {
        assets.set(rec.id, { src: rec.src, name: rec.name });
      }
    }
  }

  const components: ComponentNode[] = [];
  for (const shape of shapes) {
    const meta = shape.meta || {};
    const bounds = shapeBounds(shape);
    let component: ComponentNode | null;

    if (meta.prism && typeof meta.componentType === "string") {
      component = cloneMetaComponent(meta);
      if (component) {
        component.layout = { x: bounds.x, y: bounds.y, w: Math.max(1, bounds.w), h: Math.max(1, bounds.h) };
      }
    } else {
      component = guessComponent(shape, assets);
    }

    if (component) components.push(component);
  }

  // Top-to-bottom, left-to-right ordering mirrors page flow.
  components.sort((a, b) => {
    const ay = a.layout?.y ?? 0;
    const by = b.layout?.y ?? 0;
    if (ay !== by) return ay - by;
    return (a.layout?.x ?? 0) - (b.layout?.x ?? 0);
  });

  return components;
}

/** Number of shape records in a canvas doc (for summaries/status). */
export function canvasShapeCount(doc: unknown): number {
  return shapeStore(doc).length;
}

function tokenValue(tokens: DesignTokens, category: keyof DesignTokens, key: string, fallback: string): string {
  const found = tokens[category]?.[key];
  return found && typeof found.value === "string" ? found.value : fallback;
}

function escapeHTML(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the canvas drawing as a standalone, absolutely-positioned HTML
 * file. This is the "draw on canvas -> write back to a real page" pipeline.
 */
export function canvasToHtml(doc: unknown, tokens: DesignTokens): string {
  const components = shapesToComponents(doc);
  const bg = tokenValue(tokens, "colors", "color-bg", "#ffffff");
  const surface = tokenValue(tokens, "colors", "color-surface", "#ffffff");
  const text = tokenValue(tokens, "colors", "color-text", "#1a1a1a");
  const border = tokenValue(tokens, "colors", "color-border", "#e5e5e5");
  const primary = tokenValue(tokens, "colors", "color-primary", "#7c3aed");
  const radius = tokenValue(tokens, "radii", "radius-md", "8px");
  const fontBody = tokenValue(tokens, "typography", "font-body", "system-ui, sans-serif");
  const fontDisplay = tokenValue(tokens, "typography", "font-display", "system-ui, sans-serif");

  let maxRight = 0;
  let maxBottom = 0;
  const blocks: string[] = [];

  for (const comp of components) {
    const l = comp.layout || { x: 0, y: 0, w: 0, h: 0 };
    const left = Math.round(l.x || 0);
    const top = Math.round(l.y || 0);
    const width = Math.max(1, Math.round(l.w || 0));
    const height = Math.max(1, Math.round(l.h || 0));
    maxRight = Math.max(maxRight, left + width);
    maxBottom = Math.max(maxBottom, top + height);

    const style = [
      `position:absolute`,
      `left:${left}px`,
      `top:${top}px`,
      `width:${width}px`,
      `height:${height}px`,
      `box-sizing:border-box`,
    ];
    let inner: string;

    if (comp.type === "image") {
      const src = String(comp.props.src || "");
      inner = src
        ? `<img src="${escapeHTML(src)}" alt="${escapeHTML(String(comp.props.alt || "image"))}" style="width:100%;height:100%;object-fit:cover;border-radius:${radius};display:block"/>`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999">image</div>`;
      style.push(`background:${surface}`);
      style.push(`border:1px dashed ${border}`);
      style.push(`border-radius:${radius}`);
    } else if (comp.type === "text") {
      style.push(`color:${text}`);
      style.push(`font-family:${fontBody}`);
      style.push(`font-size:16px`);
      style.push(`line-height:1.4`);
      style.push(`overflow:hidden`);
      inner = escapeHTML(String(comp.props.text || ""));
    } else if (comp.type === "button") {
      style.push(`background:${primary}`);
      style.push(`color:#fff`);
      style.push(`border:none`);
      style.push(`border-radius:${radius}`);
      style.push(`display:flex`);
      style.push(`align-items:center`);
      style.push(`justify-content:center`);
      style.push(`font-family:${fontBody}`);
      style.push(`font-size:15px`);
      style.push(`font-weight:600`);
      inner = escapeHTML(String(comp.props.text || "Button"));
    } else {
      style.push(`background:${surface}`);
      style.push(`border:1px solid ${border}`);
      style.push(`border-radius:${radius}`);
      style.push(`padding:16px`);
      style.push(`overflow:hidden`);
      const label = String(comp.props.title || comp.props.text || comp.type);
      const emoji = comp.type === "section" ? "▣" : "▢";
      inner = `<div style="display:flex;align-items:center;gap:8px;color:${text};font-family:${fontDisplay};font-size:${comp.type === "section" ? 18 : 15}px;font-weight:600">${emoji} ${escapeHTML(label)}</div>`;
    }

    blocks.push(`    <div class="pc pc-${comp.type}" style="${style.join(";")}">${inner}</div>`);
  }

  const pageW = Math.max(800, maxRight + 80);
  const pageH = Math.max(600, maxBottom + 80);

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Prism Canvas Page</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#eef0f4; font-family:${fontBody}; }
  .prism-canvas-page { position:relative; width:${pageW}px; height:${pageH}px; margin:40px auto; background:${bg}; border-radius:12px; box-shadow:0 12px 40px rgba(20,20,40,.12); }
</style>
</head>
<body>
  <div class="prism-canvas-page">
${blocks.join("\n")}
  </div>
</body>
</html>
`;
}
