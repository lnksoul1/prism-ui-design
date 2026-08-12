/**
 * Prism Canvas Entry
 *
 * Bundles the tldraw editor (React) into a single IIFE script that the
 * vanilla-JS dashboard can drive through `window.PrismCanvas`. Keeps the
 * dashboard itself zero-build while giving the user a real drawing canvas:
 * infinite canvas, pan/zoom, shapes, text, arrows, images, box selection,
 * alignment/distribution, and undo/redo.
 */
import * as React from "react";
import { createRoot } from "react-dom/client";
import {
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

function componentToShape(comp, index) {
  const layout = comp.layout || {};
  const size = componentSize(comp);
  const x = typeof layout.x === "number" ? layout.x : 48 + (index % 2) * 24;
  const y = typeof layout.y === "number" ? layout.y : 48 + index * (size.h + 36);
  const label = componentLabel(comp);
  return {
    id: createShapeId(),
    type: "geo",
    x,
    y,
    rotation: 0,
    props: {
      geo: "rectangle",
      w: size.w,
      h: size.h,
      color: "light-violet",
      fill: "solid",
      size: "m",
      font: "sans",
      align: "start",
      verticalAlign: "start",
      richText: makeRichText(label),
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
   * Convert Prism ComponentNode[] into editable shapes on the canvas.
   * Each shape carries the original component identity in `meta` so the
   * "apply back to preview" step restores the exact component type/props.
   */
  loadComponents(components) {
    if (!editorRef) return false;
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
