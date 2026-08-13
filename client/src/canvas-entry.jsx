/**
 * Prism Canvas Entry (v2)
 *
 * Bundles the tldraw editor (React) into a single IIFE script driven by the
 * vanilla-JS dashboard through `window.PrismCanvas`.
 *
 * v2 additions (方案A round 2):
 *  - Token-driven "prism-block" custom shape: components materialize as
 *    colored UI blocks (buttons, cards, navbars, heroes…) using the live
 *    design tokens instead of plain gray rectangles.
 *  - `applyDraws()`: apply simple AI draw commands (rect/text/arrow/image)
 *    onto the canvas from the `design_draw_canvas` MCP tool.
 *  - `autoLayout()`: arrange selected shapes into a tidy column.
 */
import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  BaseBoxShapeUtil,
  Rectangle2d,
  T,
  Tldraw,
  createShapeId,
  defaultShapeUtils,
  getSnapshot,
  loadSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";

let editorRef = null;
let storeRef = null;
let rootRef = null;
let containerRef = null;
let mountOptions = {};
let loading = false;
let suppressSaveUntil = 0;
let saveTimer = null;

const SAVE_DEBOUNCE_MS = 700;
const AUTO_LAYOUT_GAP = 28;

// Default block sizes for known Prism component types (px).
const DEFAULT_SIZES = {
  navbar: { w: 1200, h: 72 },
  hero: { w: 1200, h: 420 },
  card: { w: 300, h: 220 },
  card_grid: { w: 900, h: 260 },
  cta: { w: 900, h: 240 },
  footer: { w: 1200, h: 180 },
  stats: { w: 900, h: 200 },
  feature_list: { w: 900, h: 260 },
  pricing: { w: 1000, h: 360 },
  text_section: { w: 900, h: 220 },
  image: { w: 800, h: 400 },
  button: { w: 160, h: 52 },
  form: { w: 700, h: 260 },
  testimonial: { w: 900, h: 240 },
  faq: { w: 900, h: 260 },
  banner: { w: 900, h: 180 },
  tabs: { w: 700, h: 120 },
  accordion: { w: 800, h: 260 },
  carousel: { w: 1000, h: 300 },
  sidebar: { w: 280, h: 600 },
  timeline: { w: 900, h: 300 },
  breadcrumb: { w: 500, h: 60 },
  pagination: { w: 400, h: 60 },
  progress: { w: 400, h: 60 },
  badge: { w: 140, h: 40 },
  avatar: { w: 80, h: 80 },
  input: { w: 360, h: 80 },
  grid: { w: 900, h: 280 },
  table: { w: 900, h: 300 },
  alert: { w: 600, h: 120 },
  tooltip: { w: 220, h: 80 },
  bento_grid: { w: 1000, h: 360 },
  skeleton: { w: 600, h: 160 },
  command_palette: { w: 560, h: 220 },
  glass_card: { w: 300, h: 200 },
  fab: { w: 64, h: 64 },
  marquee: { w: 900, h: 80 },
  feature_grid: { w: 1000, h: 300 },
  cookie_banner: { w: 640, h: 140 },
  toggle: { w: 200, h: 48 },
  section: { w: 1200, h: 200 },
  container: { w: 600, h: 240 },
  text: { w: 640, h: 64 },
};

const FALLBACK_SIZE = { w: 360, h: 200 };

// ===== Token palette =====

let designPalette = {
  primary: "#7C3AED",
  bg: "#ffffff",
  surface: "#ffffff",
  surfaceAlt: "#f4f4f5",
  text: "#1a1a1a",
  muted: "#6b7280",
  border: "#e5e5e5",
  radius: "8px",
  radiusLg: "12px",
  fontBody: "system-ui, sans-serif",
  fontDisplay: "system-ui, sans-serif",
  text2xl: 28,
  textXl: 22,
  textLg: 17,
  textBase: 15,
  dark: false,
};

function tokenValue(category, key, fallback) {
  const found = designTokens?.[category]?.[key];
  return found && typeof found.value === "string" ? found.value : fallback;
}

let designTokens = null;

function hexToRgba(hex, alpha) {
  const m = String(hex || "").match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function numToken(category, key, fallback) {
  const found = designTokens?.[category]?.[key];
  const v = found && typeof found.value === "string" ? parseFloat(found.value) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

function buildPalette(tokens, themeMode) {
  designTokens = tokens || null;
  const dark = themeMode === "dark";
  return {
    primary: tokenValue("colors", "color-primary", "#7C3AED"),
    bg: tokenValue("colors", "color-bg", dark ? "#0f0f14" : "#ffffff"),
    surface: tokenValue("colors", "color-surface", dark ? "#17171c" : "#ffffff"),
    surfaceAlt: dark ? "#121218" : "#f4f4f5",
    text: tokenValue("colors", "color-text", dark ? "#f4f4f5" : "#1a1a1a"),
    muted: tokenValue("colors", "color-text-muted", dark ? "#9b9ba3" : "#6b7280"),
    border: tokenValue("colors", "color-border", dark ? "#2a2a33" : "#e5e5e5"),
    radius: tokenValue("radii", "radius-md", "8px"),
    radiusLg: tokenValue("radii", "radius-lg", "12px"),
    fontBody: tokenValue("typography", "font-body", "system-ui, sans-serif"),
    fontDisplay: tokenValue("typography", "font-display", "system-ui, sans-serif"),
    text2xl: numToken("typography", "text-2xl", 28),
    textXl: numToken("typography", "text-xl", 22),
    textLg: numToken("typography", "text-lg", 17),
    textBase: numToken("typography", "text-base", 15),
    dark,
  };
}

// ===== Rich text helpers =====

function makeRichText(text) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: String(text) }] }],
  };
}

function componentLabel(comp) {
  const p = comp.props || {};
  const candidates = [
    p.brand,
    p.title,
    p.text,
    p.label,
    p.copyright,
    p.name,
    p.cta_text,
    p.button_text,
    p.placeholder,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return comp.type;
}

function componentSize(comp) {
  const layout = comp.layout || {};
  const base = DEFAULT_SIZES[comp.type] || FALLBACK_SIZE;
  return {
    w: layout.w || base.w,
    h: layout.h || base.h,
  };
}

// ===== Token-driven block styles =====

function kindForType(type) {
  switch (type) {
    case "navbar":
      return "navbar";
    case "hero":
      return "hero";
    case "button":
      return "button";
    case "cta":
    case "banner":
      return "cta";
    case "card":
    case "card_grid":
    case "glass_card":
    case "bento_grid":
    case "feature_grid":
    case "feature_list":
    case "pricing":
    case "stats":
    case "testimonial":
    case "faq":
    case "timeline":
    case "accordion":
    case "carousel":
    case "table":
    case "grid":
    case "form":
    case "sidebar":
    case "section":
    case "container":
      return "card";
    case "footer":
      return "footer";
    case "image":
      return "image";
    case "text":
    case "text_section":
      return "text";
    default:
      return "card";
  }
}

function blockIcon(kind, type) {
  if (kind === "navbar") return "☰";
  if (kind === "hero") return "◇";
  if (kind === "image") return "▣";
  if (kind === "footer") return "▬";
  if (kind === "button" || kind === "text") return "";
  if (type === "pricing") return "¥";
  if (type === "stats") return "▤";
  return "▢";
}

function blockStyle(kind, type, label, w, h) {
  const p = designPalette;
  const base = {
    label,
    kind,
    bg: p.surface,
    fg: p.text,
    border: p.border,
    radius: p.radius,
    fontSize: p.textBase,
    fontFamily: p.fontBody,
    align: "start",
    bold: false,
    icon: blockIcon(kind, type),
  };
  switch (kind) {
    case "navbar":
      return {
        ...base,
        bg: p.surface,
        border: p.border,
        radius: "0px",
        fontSize: p.textLg,
        bold: true,
        align: "start",
      };
    case "hero":
      return {
        ...base,
        bg: hexToRgba(p.primary, 0.12),
        border: hexToRgba(p.primary, 0.25),
        radius: p.radiusLg,
        fontSize: p.text2xl,
        bold: true,
        align: "center",
      };
    case "button":
      return {
        ...base,
        bg: p.primary,
        fg: "#ffffff",
        radius: p.radius,
        fontSize: p.textBase,
        bold: true,
        align: "center",
      };
    case "cta":
      return {
        ...base,
        bg: hexToRgba(p.primary, 0.1),
        border: hexToRgba(p.primary, 0.2),
        radius: p.radiusLg,
        fontSize: p.textXl,
        bold: true,
        align: "center",
      };
    case "footer":
      return {
        ...base,
        bg: p.surfaceAlt,
        fg: p.muted,
        radius: "0px",
        fontSize: p.textBase,
        align: "start",
      };
    case "image":
      return {
        ...base,
        bg: p.surfaceAlt,
        border: p.border,
        radius: p.radius,
        fontSize: p.textBase,
        align: "center",
      };
    case "text":
      return {
        ...base,
        bg: "transparent",
        border: "transparent",
        fontSize: p.textLg,
        align: "start",
      };
    case "card":
    default:
      return {
        ...base,
        bg: p.surface,
        border: p.border,
        radius: p.radius,
        fontSize: p.textBase,
        align: "start",
      };
  }
}

function componentToShape(comp, index) {
  const layout = comp.layout || {};
  const size = componentSize(comp);
  const x = typeof layout.x === "number" ? layout.x : 48 + (index % 2) * 24;
  const y = typeof layout.y === "number" ? layout.y : 48 + index * (size.h + 36);
  const label = componentLabel(comp);
  const kind = kindForType(comp.type);
  const style = blockStyle(kind, comp.type, label, size.w, size.h);
  return {
    id: createShapeId(),
    type: "prism-block",
    x,
    y,
    rotation: 0,
    props: {
      w: size.w,
      h: size.h,
      label: style.label,
      kind: style.kind,
      bg: style.bg,
      fg: style.fg,
      border: style.border,
      radius: style.radius,
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      align: style.align,
      bold: style.bold,
      icon: style.icon,
    },
    meta: {
      prism: true,
      componentId: comp.id,
      componentType: comp.type,
      componentVariant: comp.variant || null,
      componentProps: comp.props || {},
    },
  };
}

// ===== Custom shape: token-driven UI block =====

class PrismBlockShapeUtil extends BaseBoxShapeUtil {
  static type = "prism-block";
  static props = {
    w: T.number,
    h: T.number,
    label: T.string,
    kind: T.string,
    bg: T.string,
    fg: T.string,
    border: T.string,
    radius: T.string,
    fontSize: T.number,
    fontFamily: T.string,
    align: T.string,
    bold: T.boolean,
    icon: T.string,
  };

  getDefaultProps() {
    return {
      w: 360,
      h: 200,
      label: "Block",
      kind: "card",
      bg: "#ffffff",
      fg: "#1a1a1a",
      border: "#e5e5e5",
      radius: "8px",
      fontSize: 15,
      fontFamily: "system-ui, sans-serif",
      align: "start",
      bold: false,
      icon: "▢",
    };
  }

  getGeometry(shape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h });
  }

  component(shape) {
    const p = shape.props;
    const isText = p.kind === "text";
    const isButton = p.kind === "button";
    const isHero = p.kind === "hero" || p.kind === "cta";
    const style = {
      width: p.w,
      height: p.h,
      background: p.bg,
      color: p.fg,
      border: isText ? "none" : `1px solid ${p.border}`,
      borderRadius: p.radius,
      fontSize: p.fontSize,
      fontFamily: p.fontFamily,
      fontWeight: p.bold ? 700 : 600,
      display: "flex",
      alignItems: "center",
      justifyContent: p.align === "center" ? "center" : "flex-start",
      padding: isText || isButton ? "0 10px" : "0 16px",
      boxSizing: "border-box",
      overflow: "hidden",
      whiteSpace: "pre-wrap",
      lineHeight: 1.35,
      textAlign: p.align === "center" ? "center" : "left",
      boxShadow:
        p.kind === "card" || p.kind === "navbar" || p.kind === "footer"
          ? "0 1px 3px rgba(0,0,0,.08)"
          : "none",
      backgroundImage: isHero ? `linear-gradient(135deg, ${p.bg}, rgba(255,255,255,0.12))` : "none",
      cursor: "default",
      userSelect: "none",
    };
    const text = (p.icon ? `${p.icon} ` : "") + p.label;
    return React.createElement(
      "div",
      { className: "prism-block", style },
      text
    );
  }

  indicator(shape) {
    return React.createElement("rect", {
      x: 0,
      y: 0,
      width: shape.props.w,
      height: shape.props.h,
      rx: 6,
      ry: 6,
    });
  }
}

// ===== Snapshot / change plumbing =====

function safeSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function clearSaveTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function PrismCanvasApp({ locale }) {
  const handleMount = React.useCallback((editor) => {
    editorRef = editor;
    storeRef = editor.store;
    clearSaveTimer();
    storeRef.listen(
      (update) => {
        if (loading || Date.now() < suppressSaveUntil) return;
        clearSaveTimer();
        saveTimer = setTimeout(() => {
          saveTimer = null;
          if (loading || Date.now() < suppressSaveUntil) return;
          if (mountOptions.onChange) {
            try {
              mountOptions.onChange(safeSnapshot(editor.getSnapshot()));
            } catch (err) {
              console.error("[PrismCanvas] change handler failed:", err);
            }
          }
        }, SAVE_DEBOUNCE_MS);
      },
      { source: "user", scope: "document" }
    );
    if (mountOptions.onMount) {
      try {
        mountOptions.onMount(editor);
      } catch (err) {
        console.error("[PrismCanvas] onMount handler failed:", err);
      }
    }
  }, []);

  return React.createElement(Tldraw, {
    onMount: handleMount,
    locale: locale || "en",
    autoFocus: true,
    shapeUtils: [PrismBlockShapeUtil, ...defaultShapeUtils],
    components: mountOptions.components || {},
  });
}

function renderApp() {
  if (!rootRef || !containerRef) return;
  rootRef.render(
    React.createElement(PrismCanvasApp, {
      locale: mountOptions.locale,
    })
  );
}

// ===== Public API =====

window.PrismCanvas = {
  /** Mount the editor into `container`. opts: { locale, components, onMount, onChange } */
  mount(container, opts = {}) {
    containerRef = container;
    mountOptions = opts;
    if (!rootRef) {
      rootRef = createRoot(container);
    }
    renderApp();
  },

  unmount() {
    clearSaveTimer();
    editorRef = null;
    storeRef = null;
    if (rootRef) {
      rootRef.unmount();
      rootRef = null;
    }
    containerRef = null;
  },

  isReady() {
    return !!editorRef;
  },

  setLocale(locale) {
    mountOptions.locale = locale;
    renderApp();
  },

  setTheme(colorScheme) {
    if (!editorRef) return;
    editorRef.user.updateUserPreferences({ colorScheme });
  },

  /**
   * Update the token palette used for component blocks and recolor existing
   * component shapes in place (positions/sizes untouched).
   */
  setDesignContext(context = {}) {
    designPalette = buildPalette(context.tokens, context.themeMode);
    if (!editorRef) return;
    const shapes = editorRef
      .getCurrentPageShapes()
      .filter((s) => s.type === "prism-block" && s.meta && s.meta.prism);
    if (shapes.length === 0) return;
    const updates = shapes.map((s) => {
      const kind = kindForType(s.meta.componentType);
      const style = blockStyle(kind, s.meta.componentType, componentLabel(s.meta), s.props.w, s.props.h);
      return {
        id: s.id,
        type: s.type,
        props: {
          w: s.props.w,
          h: s.props.h,
          label: style.label,
          kind: style.kind,
          bg: style.bg,
          fg: style.fg,
          border: style.border,
          radius: style.radius,
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
          align: style.align,
          bold: style.bold,
          icon: style.icon,
        },
      };
    });
    editorRef.updateShapes(updates);
  },

  /** Load a tldraw snapshot (JSON). Returns false if not ready. */
  loadSnapshot(snapshot) {
    if (!editorRef || !snapshot) return false;
    loading = true;
    clearSaveTimer();
    try {
      loadSnapshot(editorRef.store, snapshot);
      editorRef.zoomToFit();
      return true;
    } catch (err) {
      console.error("[PrismCanvas] loadSnapshot failed:", err);
      return false;
    } finally {
      setTimeout(() => {
        loading = false;
      }, 80);
    }
  },

  /** Serialize the current document as a tldraw snapshot. */
  getSnapshot() {
    if (!editorRef) return null;
    return safeSnapshot(editorRef.getSnapshot());
  },

  /**
   * Convert Prism ComponentNode[] into token-colored editable shapes.
   * context: { tokens, themeMode } for the design palette.
   */
  loadComponents(components, context = {}) {
    if (!editorRef) return false;
    designPalette = buildPalette(context.tokens, context.themeMode);
    loading = true;
    clearSaveTimer();
    try {
      editorRef.deleteShapes(editorRef.getCurrentPageShapes());
      const list = Array.isArray(components) ? components : [];
      if (list.length > 0) {
        const shapes = list.map(componentToShape);
        editorRef.createShapes(shapes);
      }
      editorRef.zoomToFit();
      return true;
    } catch (err) {
      console.error("[PrismCanvas] loadComponents failed:", err);
      return false;
    } finally {
      setTimeout(() => {
        loading = false;
      }, 80);
    }
  },

  /**
   * Apply simple draw commands (from AI or script) onto the canvas.
   * draw: { type: rect|text|arrow|image|prism, x, y, w, h, label, src, color, kind }
   */
  applyDraws(draws) {
    if (!editorRef || !Array.isArray(draws) || draws.length === 0) return 0;
    loading = true;
    clearSaveTimer();
    let created = 0;
    try {
      const shapes = [];
      for (const draw of draws) {
        const x = Number(draw.x) || 0;
        const y = Number(draw.y) || 0;
        const w = Math.max(20, Number(draw.w) || 240);
        const h = Math.max(20, Number(draw.h) || 120);
        if (draw.type === "text" || draw.type === "note") {
          shapes.push({
            id: createShapeId(),
            type: "text",
            x,
            y,
            props: {
              w: Math.max(60, w),
              autoSize: true,
              richText: makeRichText(draw.label || "Text"),
              color: draw.color || "light-violet",
            },
            meta: { prismDraw: true, kind: "text" },
          });
        } else if (draw.type === "arrow") {
          shapes.push({
            id: createShapeId(),
            type: "arrow",
            x,
            y,
            props: {},
            meta: { prismDraw: true, kind: "arrow" },
          });
        } else if (draw.type === "image") {
          shapes.push({
            id: createShapeId(),
            type: "prism-block",
            x,
            y,
            props: {
              w,
              h,
              label: draw.label || "image",
              kind: "image",
              bg: designPalette.surfaceAlt,
              fg: designPalette.muted,
              border: designPalette.border,
              radius: designPalette.radius,
              fontSize: designPalette.textBase,
              fontFamily: designPalette.fontBody,
              align: "center",
              bold: false,
              icon: "▣",
            },
            meta: { prismDraw: true, kind: "image", src: draw.src || "" },
          });
        } else if (draw.type === "prism") {
          shapes.push({
            id: createShapeId(),
            type: "prism-block",
            x,
            y,
            props: {
              w,
              h,
              label: draw.label || "Block",
              kind: draw.kind || "card",
              bg: draw.color || designPalette.surface,
              fg: designPalette.text,
              border: designPalette.border,
              radius: designPalette.radius,
              fontSize: designPalette.textBase,
              fontFamily: designPalette.fontBody,
              align: "start",
              bold: false,
              icon: "▢",
            },
            meta: { prismDraw: true, kind: draw.kind || "card" },
          });
        } else {
          // rect (geo)
          shapes.push({
            id: createShapeId(),
            type: "geo",
            x,
            y,
            props: {
              geo: "rectangle",
              w,
              h,
              color: draw.color || "light-violet",
              fill: "solid",
              richText: makeRichText(draw.label || ""),
            },
            meta: { prismDraw: true, kind: "rect" },
          });
        }
        created += 1;
      }
      if (shapes.length > 0) {
        editorRef.createShapes(shapes);
      }
      return created;
    } catch (err) {
      console.error("[PrismCanvas] applyDraws failed:", err);
      return 0;
    } finally {
      setTimeout(() => {
        loading = false;
      }, 80);
    }
  },

  /** Convert viewport coordinates to canvas page coordinates. */
  screenToPage(clientX, clientY) {
    if (!editorRef) return { x: 0, y: 0 };
    const point = editorRef.screenToPage({ x: clientX, y: clientY });
    return { x: point.x, y: point.y };
  },

  /**
   * Drop a library component onto the canvas at page coordinates as a
   * token-colored prism-block shape. Returns the new shape id.
   */
  addComponentShape(spec, x, y) {
    if (!editorRef || !spec || !spec.type) return null;
    loading = true;
    clearSaveTimer();
    try {
      const shape = componentToShape(
        {
          id: null,
          type: spec.type,
          variant: spec.variant || undefined,
          props: spec.props || {},
        },
        0
      );
      shape.x = Math.round(x);
      shape.y = Math.round(y);
      editorRef.createShapes([shape]);
      return shape.id;
    } catch (err) {
      console.error("[PrismCanvas] addComponentShape failed:", err);
      return null;
    } finally {
      setTimeout(() => {
        loading = false;
      }, 80);
    }
  },

  /** Arrange selected shapes (or all shapes) into a tidy column. */
  autoLayout() {
    if (!editorRef) return 0;
    loading = true;
    try {
      const selected = editorRef.getSelectedShapeIds();
      const shapes = selected.length
        ? selected.map((id) => editorRef.getShape(id)).filter(Boolean)
        : editorRef.getCurrentPageShapes();
      if (shapes.length < 2) return shapes.length;
      const entries = shapes
        .map((s) => ({ s, b: editorRef.getShapePageBounds(s.id) }))
        .filter((e) => e.b)
        .sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x);
      const startX = Math.min(...entries.map((e) => e.b.x));
      const startY = Math.min(...entries.map((e) => e.b.y));
      const updates = [];
      let cursorY = startY;
      entries.forEach(({ s, b }) => {
        updates.push({ id: s.id, type: s.type, x: startX, y: cursorY });
        cursorY += b.h + AUTO_LAYOUT_GAP;
      });
      editorRef.updateShapes(updates);
      return updates.length;
    } finally {
      setTimeout(() => {
        loading = false;
      }, 80);
    }
  },

  clear() {
    if (!editorRef) return;
    loading = true;
    clearSaveTimer();
    try {
      editorRef.deleteShapes(editorRef.getCurrentPageShapes());
      editorRef.zoomToFit();
    } finally {
      setTimeout(() => {
        loading = false;
      }, 80);
    }
  },

  setTool(tool) {
    if (editorRef) editorRef.setCurrentTool(tool);
  },

  selectAll() {
    if (editorRef) editorRef.selectAll();
  },

  deleteSelection() {
    if (editorRef) editorRef.deleteShapes(editorRef.getSelectedShapeIds());
  },

  zoomToFit() {
    if (editorRef) editorRef.zoomToFit();
  },

  countShapes() {
    return editorRef ? editorRef.getCurrentPageShapes().length : 0;
  },

  /** Replace the runtime change callback (used after mount). */
  onExternalChange(callback) {
    mountOptions.onChange = callback;
  },

  /** Suppress auto-save callbacks for `ms` milliseconds (e.g. during reload). */
  suppressAutoSave(ms) {
    suppressSaveUntil = Date.now() + (ms || 1200);
    clearSaveTimer();
  },

  _debug() {
    return {
      ready: !!editorRef,
      shapeCount: editorRef ? editorRef.getCurrentPageShapes().length : 0,
      tool: editorRef ? editorRef.getCurrentToolId() : null,
    };
  },
};
