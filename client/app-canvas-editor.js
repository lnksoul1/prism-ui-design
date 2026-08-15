// /* === SPLIT-MODULE === */
/**
 * Prism Dashboard — tldraw canvas editor, play mode, more menu, LLM settings, draw tools and init.
 *
 * Part of the split client application. All parts are global-scope scripts;
 * they must be loaded in the order declared in index.html.
 */

// ===== Canvas Editor (方案A: tldraw drawing canvas) =====

let canvasEditorMode = false;
let canvasEditorMounted = false;
let canvasReady = false;
let canvasLoading = false;
let canvasOwnSaveAt = 0;
let canvasSaveTimer = null;
let canvasDirty = false;
let canvasTemplateShownForPage = null;
let toastTimer = null;
let canvasBundlePromise = null;
const appliedDrawIds = new Set();

const BUILTIN_TEMPLATES = [
  { id: "saas_landing", icon: "▲", nameKey: "tplSaaS", descKey: "tplDescSaaS" },
  { id: "ecommerce_home", icon: "▣", nameKey: "tplEcommerce", descKey: "tplDescEcommerce" },
  { id: "blog_post", icon: "▤", nameKey: "tplBlog", descKey: "tplDescBlog" },
  { id: "portfolio", icon: "✦", nameKey: "tplPortfolio", descKey: "tplDescPortfolio" },
  { id: "dashboard", icon: "▣", nameKey: "tplDashboard", descKey: "tplDescDashboard" },
];

function showToastMsg(text, isError) {
  const toast = $("prism-toast");
  if (!toast) return;
  toast.textContent = text;
  toast.className = "prism-toast" + (isError ? " toast-error" : "");
  toast.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 3600);
}

function renderCanvasTemplateCards() {
  const container = $("canvas-template-cards");
  if (!container) return;
  container.innerHTML = "";
  const cards = [
    ...BUILTIN_TEMPLATES,
    { id: "blank", icon: "▢", nameKey: "tplBlank", descKey: null },
  ];
  cards.forEach((card) => {
    const node = el("button", "template-card");
    node.type = "button";
    node.appendChild(renderTplThumb(card.id));
    node.appendChild(el("span", "tc-name", t(card.nameKey)));
    if (card.descKey) {
      node.appendChild(el("span", "tc-desc", t(card.descKey)));
    }
    node.addEventListener("click", () => applyTemplateForCanvas(card.id));
    container.appendChild(node);
  });
}

function renderTplThumb(id) {
  const thumb = el("span", "tpl-thumb");
  thumb.dataset.tpl = id;
  tplThumbBlocks(id).forEach((b) => {
    const block = el("i", "th");
    block.style.top = b.top;
    block.style.left = b.left;
    block.style.width = b.width;
    block.style.height = b.height;
    block.style.background = b.bg;
    block.style.borderRadius = (b.radius || 3) + "px";
    thumb.appendChild(block);
  });
  return thumb;
}

function tplThumbBlocks(id) {
  const B = (top, left, width, height, bg, radius) => ({ top, left, width, height, bg, radius });
  const soft = "var(--surface-hover)";
  const softBorder = "var(--border-strong)";
  const brand = "linear-gradient(135deg, var(--spectrum-1), var(--spectrum-3))";
  const nav = "linear-gradient(90deg, var(--accent) 0 26%, " + soft + " 26% 52%, " + softBorder + " 56% 100%)";
  const map = {
    saas_landing: [
      B("6px", "7%", "86%", "7px", nav),
      B("21px", "7%", "46%", "25px", brand, 5),
      B("30px", "7%", "17%", "5px", "rgba(255,255,255,.6)"),
      B("56px", "7%", "25%", "21px", soft, 4),
      B("56px", "37%", "25%", "21px", soft, 4),
      B("56px", "67%", "25%", "21px", soft, 4),
    ],
    ecommerce_home: [
      B("6px", "7%", "86%", "7px", nav),
      B("21px", "7%", "86%", "18px", "linear-gradient(135deg, var(--spectrum-2), var(--spectrum-4))", 5),
      B("48px", "7%", "25%", "30px", soft, 4),
      B("48px", "37%", "25%", "30px", soft, 4),
      B("48px", "67%", "25%", "30px", soft, 4),
    ],
    blog_post: [
      B("6px", "7%", "86%", "7px", nav),
      B("22px", "7%", "62%", "7px", "var(--accent-bright)", 3),
      B("34px", "7%", "34%", "5px", softBorder, 3),
      B("47px", "7%", "86%", "24px", "linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.05))", 5),
      B("79px", "7%", "86%", "4px", soft, 3),
    ],
    portfolio: [
      B("6px", "7%", "86%", "7px", nav),
      B("22px", "7%", "22%", "22px", brand, "50%"),
      B("34px", "34%", "30%", "6px", "var(--accent-bright)", 3),
      B("45px", "34%", "22%", "5px", softBorder, 3),
      B("60px", "7%", "25%", "18px", soft, 4),
      B("60px", "37%", "25%", "18px", soft, 4),
      B("60px", "67%", "25%", "18px", soft, 4),
    ],
    dashboard: [
      B("6px", "7%", "86%", "7px", nav),
      B("21px", "7%", "25%", "17px", soft, 4),
      B("21px", "37%", "25%", "17px", soft, 4),
      B("21px", "67%", "25%", "17px", soft, 4),
      B("47px", "7%", "86%", "30px", "linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.04))", 5),
      B("52px", "12%", "9%", "19px", "var(--accent-bright)", 2),
      B("64px", "25%", "9%", "8px", "var(--spectrum-2)", 2),
      B("58px", "38%", "9%", "13px", "var(--spectrum-3)", 2),
      B("70px", "51%", "9%", "5px", "var(--spectrum-4)", 2),
      B("62px", "64%", "9%", "10px", "var(--spectrum-2)", 2),
    ],
    blank: [],
  };
  return map[id] || [];
}

function setupCanvasEditor() {
  const previewBtn = $("canvas-mode-preview");
  const designBtn = $("canvas-mode-design");
  if (previewBtn) previewBtn.addEventListener("click", () => setCanvasEditorMode(false));
  if (designBtn) designBtn.addEventListener("click", () => setCanvasEditorMode(true));

  const saveBtn = $("canvas-save-btn");
  if (saveBtn) saveBtn.addEventListener("click", () => saveCurrentCanvas(true));
  const applyBtn = $("canvas-apply-btn");
  if (applyBtn) applyBtn.addEventListener("click", applyCanvasToPreview);
  const exportBtn = $("canvas-export-btn");
  if (exportBtn) exportBtn.addEventListener("click", exportCanvasToFile);
  const autoLayoutBtn = $("canvas-autolayout-btn");
  if (autoLayoutBtn) {
    autoLayoutBtn.addEventListener("click", () => {
      if (!window.PrismCanvas || !window.PrismCanvas.isReady()) return;
      const count = window.PrismCanvas.autoLayout();
      showToastMsg(t("canvasAutoLayoutDone", { n: count }));
    });
  }
  const clearBtn = $("canvas-clear-btn");
  if (clearBtn) clearBtn.addEventListener("click", clearCanvasEditor);

  const tplModal = $("canvas-template-modal");
  const tplClose = $("canvas-template-close");
  if (tplClose) {
    tplClose.addEventListener("click", () => {
      if (tplModal) tplModal.style.display = "none";
    });
  }
  if (tplModal) {
    tplModal.addEventListener("click", (e) => {
      if (e.target === tplModal) tplModal.style.display = "none";
    });
  }

  renderCanvasTemplateCards();
  setupCanvasEditorDropZone();
}

/**
 * Let the design library drop straight onto the drawing canvas: a component
 * becomes a token-colored prism-block shape at the drop point (canvas page
 * coordinates), then the drawing is autosaved.
 */
function setupCanvasEditorDropZone() {
  const editorEl = $("canvas-editor");
  const hint = $("canvas-drop-hint");
  if (!editorEl) return;

  const isLibraryDrag = (e) =>
    e.dataTransfer &&
    e.dataTransfer.types &&
    Array.from(e.dataTransfer.types).includes("text/plain") &&
    canvasEditorMode;

  editorEl.addEventListener("dragover", (e) => {
    if (!isLibraryDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (hint) {
      hint.textContent = t("startWithLibraryDesc");
      hint.style.display = "block";
      hint.style.left = e.clientX - 60 + "px";
      hint.style.top = e.clientY - 24 + "px";
    }
  });

  editorEl.addEventListener("dragleave", (e) => {
    if (!canvasEditorMode) return;
    if (!editorEl.contains(e.relatedTarget) && hint) {
      hint.style.display = "none";
    }
  });

  editorEl.addEventListener("drop", (e) => {
    if (!canvasEditorMode || !e.dataTransfer) return;
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw || !raw.startsWith("{")) return;
    e.preventDefault();
    e.stopPropagation();
    if (hint) hint.style.display = "none";

    try {
      const data = JSON.parse(raw);
      if (!data.item || data.libType !== "components") return;
      if (!window.PrismCanvas || !window.PrismCanvas.isReady()) {
        showToastMsg(t("canvasLoading"));
        return;
      }
      const pt = window.PrismCanvas.screenToPage(e.clientX, e.clientY);
      const created = window.PrismCanvas.addComponentShape(
        {
          type: data.item.id,
          variant: data.item.variant,
          props: data.item.defaultProps || {},
        },
        pt.x,
        pt.y
      );
      if (created) {
        saveCurrentCanvas(false);
        showToastMsg(t("canvasComponentDropped", { name: data.item.name || data.item.id }));
      }
    } catch (err) {
      console.error("Canvas library drop failed:", err);
    }
  });
}

/** Lazily load the tldraw bundle (client/vendor/prism-canvas.js). */
function ensureCanvasBundle() {
  if (window.PrismCanvas) return Promise.resolve();
  if (!canvasBundlePromise) {
    canvasBundlePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "vendor/prism-canvas.js";
      script.onload = () => resolve();
      script.onerror = () => {
        canvasBundlePromise = null;
        reject(new Error("canvas bundle failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return canvasBundlePromise;
}

function setCanvasEditorMode(design) {
  if (design === canvasEditorMode) {
    if (design) loadCanvasIntoEditor();
    return;
  }

  const previewBtn = $("canvas-mode-preview");
  const designBtn = $("canvas-mode-design");
  const scrollWrap = $("canvas-scroll-wrap");
  const editorWrap = $("canvas-editor-wrap");
  const actions = $("canvas-editor-actions");
  const label = $("canvas-label");

  if (!design) {
    if (canvasReady) saveCurrentCanvas(false);
    canvasEditorMode = false;
    if (scrollWrap) scrollWrap.style.display = "block";
    if (editorWrap) editorWrap.style.display = "none";
    if (editorWrap) editorWrap.classList.remove("overlay-mode");
    if (actions) actions.style.display = "none";
    if (label) label.textContent = t("canvasLabel");
  } else {
    canvasEditorMode = true;
    // 预览界面绘制 (P1): 不再隐藏预览——tldraw 以透明背景覆盖在预览之上，
    // 预览组件作为参考背景可见，用户直接在预览界面自由绘制。
    if (scrollWrap) scrollWrap.style.display = "block";
    if (editorWrap) editorWrap.style.display = "flex";
    if (editorWrap) editorWrap.classList.add("overlay-mode");
    if (actions) actions.style.display = "inline-flex";
    if (label) label.textContent = t("designMode");
    const hint = $("canvas-editor-hint");
    if (hint) hint.textContent = t("canvasEditorHint");

    showToastMsg(t("canvasLoading"));
    ensureCanvasBundle()
      .then(() => {
        if (!canvasEditorMounted) {
          canvasEditorMounted = true;
          window.PrismCanvas.mount($("canvas-editor"), {
            locale: "en",
            onMount: () => {
              canvasReady = true;
              loadCanvasIntoEditor();
              if (pendingDrawTool) {
                window.PrismCanvas.setTool(pendingDrawTool);
                pendingDrawTool = null;
              }
            },
            onRecover: () => {
              canvasReady = true;
              loadCanvasIntoEditor(true);
            },
            onChange: (snapshot) => {
              canvasDirty = true;
              clearTimeout(canvasSaveTimer);
              canvasSaveTimer = setTimeout(() => saveCurrentCanvas(false, snapshot), 900);
            },
          });
        } else {
          loadCanvasIntoEditor();
        }
      })
      .catch((err) => {
        console.error("Canvas bundle failed:", err);
        showToastMsg(t("canvasSaveError"), true);
        setCanvasEditorMode(false);
      });
  }

  if (previewBtn) previewBtn.classList.toggle("active", !design);
  if (designBtn) designBtn.classList.toggle("active", design);
  applyDrawToolsState();
}

/**
 * Load the current page's drawing into the editor. If no drawing has been
 * saved yet, materialize the current components as editable shapes; if the
 * page is completely empty, offer a template-first start.
 */
async function loadCanvasIntoEditor(forceFromComponents) {
  if (!window.PrismCanvas || !window.PrismCanvas.isReady() || !currentState) return;
  const pageId = currentState.currentPageId;
  if (!pageId) return;

  canvasLoading = true;
  window.PrismCanvas.suppressAutoSave(1800);
  try {
    const res = await fetch(`/api/canvas?pageId=${encodeURIComponent(pageId)}`);
    const data = await res.json().catch(() => ({}));
    const components = getCurrentComponents();

    if (data.doc) {
      const loaded = window.PrismCanvas.loadSnapshot(data.doc);
      // A stale/corrupt drawing can fail to load (unknown shape types, schema
      // drift). Fall back to re-materializing from the component tree and
      // overwrite the bad doc so the canvas never gets stuck broken.
      if (!loaded) {
        window.PrismCanvas.loadComponents(components || [], {
          tokens: currentState.tokens,
          themeMode: currentState.themeMode,
        });
        if (components && components.length > 0) saveCurrentCanvas(false);
      }
    } else if (forceFromComponents || (components && components.length > 0)) {
      window.PrismCanvas.loadComponents(components || [], {
        tokens: currentState.tokens,
        themeMode: currentState.themeMode,
      });
      if (components && components.length > 0) saveCurrentCanvas(false);
    } else {
      window.PrismCanvas.clear();
      if (canvasTemplateShownForPage !== pageId) {
        canvasTemplateShownForPage = pageId;
        const modal = $("canvas-template-modal");
        if (modal) modal.style.display = "flex";
      }
    }
    // Apply any AI draw commands that were queued while the canvas was closed.
    applyPendingCanvasDraws();
  } catch (err) {
    console.error("Load canvas failed:", err);
  } finally {
    setTimeout(() => {
      canvasLoading = false;
    }, 180);
  }
}

/**
 * Apply queued AI drawing commands (`design_draw_canvas`) to the live
 * editor, then clear the server queue and persist the merged drawing.
 */
async function applyPendingCanvasDraws() {
  if (!window.PrismCanvas || !window.PrismCanvas.isReady() || !currentState) return;
  const pageId = currentState.currentPageId;
  const draws = (currentState.canvasDraws && currentState.canvasDraws[pageId]) || [];
  const pending = draws.filter((d) => d && !appliedDrawIds.has(d.id));
  if (pending.length === 0) return;

  const created = window.PrismCanvas.applyDraws(pending);
  pending.forEach((d) => appliedDrawIds.add(d.id));
  try {
    await fetch("/api/canvas/draws/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId }),
    });
  } catch (err) {
    console.error("Clear draw queue failed:", err);
  }
  saveCurrentCanvas(false);
  if (created > 0) showToastMsg(t("canvasDrawsApplied", { n: created }));
}

async function saveCurrentCanvas(showToast, snapshot) {
  if (!window.PrismCanvas || !window.PrismCanvas.isReady() || !currentState) return false;
  const snap = snapshot || window.PrismCanvas.getSnapshot();
  if (!snap) return false;
  canvasOwnSaveAt = Date.now();
  canvasDirty = false;
  try {
    const res = await fetch("/api/canvas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageId: currentState.currentPageId,
        doc: snap,
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    if (showToast) showToastMsg(t("canvasSaved"));
    return true;
  } catch (err) {
    console.error("Save canvas failed:", err);
    if (showToast) showToastMsg(t("canvasSaveError"), true);
    return false;
  }
}

async function applyCanvasToPreview() {
  if (!window.PrismCanvas || !window.PrismCanvas.isReady()) return;
  await saveCurrentCanvas(false);
  try {
    const res = await fetch("/api/canvas/apply", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showToastMsg(data.error || t("canvasSaveError"), true);
      return;
    }
    await fetchInitialState();
    setCanvasEditorMode(false);
    showToastMsg(t("canvasApplied", { n: data.component_count }));
  } catch (err) {
    console.error("Apply canvas failed:", err);
    showToastMsg(t("canvasSaveError"), true);
  }
}

async function exportCanvasToFile() {
  if (!window.PrismCanvas || !window.PrismCanvas.isReady()) return;
  await saveCurrentCanvas(false);
  try {
    const res = await fetch("/api/canvas/export", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showToastMsg(data.error || t("canvasSaveError"), true);
      return;
    }
    showToastMsg(t("canvasExported", { file: data.file }));
  } catch (err) {
    console.error("Export canvas failed:", err);
    showToastMsg(t("canvasSaveError"), true);
  }
}

function clearCanvasEditor() {
  if (!window.PrismCanvas || !window.PrismCanvas.isReady()) return;
  if (!window.confirm(t("clearCanvasConfirm"))) return;
  window.PrismCanvas.clear();
  saveCurrentCanvas(true);
  showToastMsg(t("canvasCleared"));
}

async function applyTemplateForCanvas(templateId) {
  const modal = $("canvas-template-modal");
  if (modal) modal.style.display = "none";

  if (templateId === "blank") {
    if (window.PrismCanvas && window.PrismCanvas.isReady()) {
      window.PrismCanvas.clear();
      saveCurrentCanvas(false);
    } else {
      setCanvasEditorMode(true);
    }
    return;
  }

  try {
    const res = await fetch("/api/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: templateId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToastMsg(data.error || t("canvasSaveError"), true);
      return;
    }
    await fetchInitialState();
    if (currentState) canvasTemplateShownForPage = currentState.currentPageId;
    if (canvasEditorMode && window.PrismCanvas && window.PrismCanvas.isReady()) {
      loadCanvasIntoEditor(true);
    } else {
      setCanvasEditorMode(true);
    }
  } catch (err) {
    console.error("Apply template failed:", err);
    showToastMsg(t("canvasSaveError"), true);
  }
}

// ===== 自由编辑补缺 (P1): 画布形状/图片挂行为 + 画布播放触发 =====

/** Build a concrete behavior from a client-side template id (mirrors server). */
function buildCanvasBehavior(templateId, shapeId) {
  const pages = currentState && currentState.pages ? currentState.pages : [];
  const pageIds = pages.map((p) => p.id);
  switch (templateId) {
    case "open_link_new_tab":
      return { type: "link", url: "https://example.com", new_tab: true };
    case "toast_feedback":
      return { type: "toast", message: "操作成功！" };
    case "navigate_home":
      return { type: "navigate", page_id: pageIds[0] || "" };
    case "toggle_self":
      return { type: "toggle", target_component_id: shapeId || "" };
    case "submit_feedback":
      return { type: "submit", form_id: "" };
    case "ai_enhance":
      return { type: "prompt", prompt: "优化这个组件的视觉效果" };
    default:
      return null;
  }
}

function setupCanvasBehavior() {
  const btn = $("canvas-behavior-btn");
  const menu = $("canvas-behavior-menu");
  const list = $("canvas-behavior-list");
  const clearBtn = $("canvas-behavior-clear");
  if (!btn || !menu || !list) return;

  const hide = () => { menu.style.display = "none"; };

  const applyToSelection = async (behavior) => {
    const ids = window.PrismCanvas ? window.PrismCanvas.getSelectedShapeIds() : [];
    if (ids.length === 0) {
      showToastMsg(t("canvasBehaviorNone"), true);
      return;
    }
    let applied = 0;
    ids.forEach((id) => {
      if (window.PrismCanvas.setShapeBehavior(id, behavior)) applied += 1;
    });
    hide();
    if (applied > 0) {
      showToastMsg(applied === 1 ? t("canvasBehaviorBound") : t("canvasBehaviorBoundN", { n: applied }));
      saveCurrentCanvas(false);
    }
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.style.display === "block") { hide(); return; }
    // Render template list
    list.innerHTML = "";
    LIBRARY_INTERACTIONS.forEach((tpl) => {
      const item = el("div", "cb-menu-item");
      const iconEl = el("span", "cb-menu-icon", tpl.icon);
      item.appendChild(iconEl);
      const textEl = el("div", "cb-menu-text");
      textEl.appendChild(el("div", "cb-menu-name", tpl.name));
      textEl.appendChild(el("div", "cb-menu-desc", tpl.desc));
      item.appendChild(textEl);
      item.addEventListener("click", () => {
        const ids = window.PrismCanvas ? window.PrismCanvas.getSelectedShapeIds() : [];
        const shapeId = ids[0] || null;
        const behavior = buildCanvasBehavior(tpl.id, shapeId);
        if (behavior) applyToSelection(behavior);
      });
      list.appendChild(item);
    });
    const rect = btn.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 240)) + "px";
    menu.style.top = (rect.bottom + 6) + "px";
    menu.style.display = "block";
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => applyToSelection(null));
  }

  // Click elsewhere closes the menu; Escape closes it too.
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#canvas-behavior-menu") && !e.target.closest("#canvas-behavior-btn")) hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
}

/**
 * 画布播放模式：点击带行为的形状/图片时触发（与主画布播放模式同一心智）。
 * Uses capture-phase pointerup on the document because tldraw registers its
 * own window/document capture listeners that swallow events targeting the
 * editor subtree.
 */
function setupCanvasPlayClick() {
  document.addEventListener(
    "pointerup",
    (e) => {
      if (!playMode || !canvasEditorMode) return;
      if (!window.PrismCanvas || !window.PrismCanvas.isReady()) return;
      const shape = window.PrismCanvas.getShapeAtPoint(e.clientX, e.clientY);
      if (!shape || !shape.behavior) return;
      e.stopPropagation();
      dispatchCanvasShapeBehavior(shape.id, shape.behavior);
    },
    true
  );
}

function dispatchCanvasShapeBehavior(shapeId, behavior) {
  if (!behavior || !behavior.type) return;
  switch (behavior.type) {
    case "navigate":
      if (behavior.page_id && behavior.page_id !== (currentState && currentState.currentPageId)) {
        send({ type: "switch_page", pageId: behavior.page_id });
      }
      break;
    case "link":
      if (behavior.url) window.open(behavior.url, behavior.new_tab === false ? "_self" : "_blank", "noopener");
      break;
    case "toggle": {
      if (!behavior.target_component_id) break;
      const target = findCompDeep(getCurrentComponents(), behavior.target_component_id);
      if (target) {
        send({
          type: "update_component",
          id: target.id,
          props: {},
          visible: target.visible === false,
        });
      } else {
        showToastMsg("toggle 目标未找到（画布形状可用「显隐切换」绑定自身）", true);
      }
      break;
    }
    case "toast":
      showToastMsg(behavior.message || t("behaviorToastDefault"));
      break;
    case "submit":
      showToastMsg(t("behaviorSubmitted"));
      break;
    case "prompt":
      if (behavior.prompt) sendPrompt(behavior.prompt);
      break;
    default:
      break;
  }
}

// ===== Initialize =====

// ===== Play Mode (click-through navigation between linked pages) =====

function setupPlayMode() {
  const btn = $("play-btn");
  if (!btn) return;

  const setPlayMode = (on) => {
    playMode = on;
    const canvas = $("canvas");
    if (canvas) canvas.classList.toggle("play-mode", on);
    btn.textContent = on ? t("playExit") : t("playMode");
    btn.classList.toggle("active", on);
    if (on) deselectAll();
    renderCanvas();
  };

  btn.addEventListener("click", () => setPlayMode(!playMode));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && playMode) {
      setPlayMode(false);
    }
  });
}

// ===== "More" menu (topbar) =====

function setupMoreMenu() {
  const btn = $("more-btn");
  const menu = $("more-dropdown");
  if (!btn || !menu) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".more-menu")) menu.style.display = "none";
  });
  menu.addEventListener("click", () => {
    menu.style.display = "none";
  });
}

// ===== Built-in LLM channel (AI settings modal) =====

function updateLlmBadge() {
  const badge = $("llm-badge");
  if (!badge) return;
  fetch("/api/llm/config")
    .then((r) => r.json())
    .then((data) => {
      badge.style.display = data.configured ? "inline-flex" : "none";
      if (data.configured) badge.title = `${t("llmProvider")}: ${data.provider} · ${data.model}`;
    })
    .catch(() => {});
}

function setupLlmSettings() {
  const openBtn = $("llm-settings-btn");
  const modal = $("llm-modal");
  const closeBtn = $("llm-close");
  const provider = $("llm-provider");
  const baseUrl = $("llm-base-url");
  const keyInput = $("llm-key");
  const model = $("llm-model");
  const status = $("llm-status");
  const saveBtn = $("llm-save-btn");
  const testBtn = $("llm-test-btn");
  if (!modal || !openBtn) return;

  const setStatus = (text, cls) => {
    if (!status) return;
    status.textContent = text;
    status.className = "llm-status" + (cls ? " " + cls : "");
  };

  openBtn.addEventListener("click", () => {
    modal.style.display = "flex";
    setStatus("", "");
    fetch("/api/llm/config")
      .then((r) => r.json())
      .then((data) => {
        if (provider) provider.value = data.provider || "openai";
        if (baseUrl) baseUrl.value = data.base_url || "";
        if (model) model.value = data.model || "";
        if (keyInput) keyInput.placeholder = data.masked_key ? data.masked_key + "（已保存，留空保持不变）" : "sk-…";
        toggleBaseField();
      })
      .catch(() => {});
  });
  if (closeBtn) closeBtn.addEventListener("click", () => { modal.style.display = "none"; });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  const toggleBaseField = () => {
    const field = document.querySelector(".llm-base-field");
    if (field) field.style.display = provider && provider.value === "openai" ? "" : "none";
  };
  if (provider) provider.addEventListener("change", toggleBaseField);

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      setStatus(t("llmTesting"), "");
      try {
        const res = await fetch("/api/llm/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: provider ? provider.value : "openai",
            apiKey: keyInput ? keyInput.value : "",
            model: model ? model.value : "",
            baseUrl: baseUrl ? baseUrl.value : "",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || String(res.status));
        setStatus(t("llmSaved"), "ok");
        if (keyInput) keyInput.value = "";
        updateLlmBadge();
      } catch (err) {
        setStatus(t("llmTestFail", { error: err.message }), "err");
      }
    });
  }

  if (testBtn) {
    testBtn.addEventListener("click", async () => {
      setStatus(t("llmTesting"), "");
      try {
        const res = await fetch("/api/llm/test", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || String(res.status));
        setStatus(t("llmTestOk", { reply: data.reply || "" }), "ok");
      } catch (err) {
        setStatus(t("llmTestFail", { error: err.message }), "err");
      }
    });
  }
}

// ===== Drawing tool rail (canvas left edge) =====

let activeDrawTool = "select";

function applyDrawToolsState() {
  const rail = $("canvas-tool-rail");
  if (rail) rail.classList.toggle("active", canvasEditorMode);
  document.querySelectorAll(".draw-tool").forEach((b) => {
    b.classList.toggle("active", canvasEditorMode && b.dataset.tool === activeDrawTool);
  });
}

function selectDrawTool(toolId) {
  activeDrawTool = toolId;
  pendingDrawTool = toolId;
  if (!canvasEditorMode) {
    setCanvasEditorMode(true);
  } else if (window.PrismCanvas && window.PrismCanvas.isReady()) {
    window.PrismCanvas.setTool(toolId);
    pendingDrawTool = null;
  }
  applyDrawToolsState();
}

function setupDrawTools() {
  document.querySelectorAll(".draw-tool").forEach((btn) => {
    btn.addEventListener("click", () => selectDrawTool(btn.dataset.tool));
  });
  applyDrawToolsState();
}

function init() {
  exposePerf();
  setupI18n();
  setupTabs();
  setupPlatformSwitcher();
  setupUndoRedo();
  setupZoom();
  setupCanvasShortcuts();
  setupCanvasMode();
  setupRulersAndGuides();
  setupLiveCursors();
  setupThemeToggle();
  setupPageSwitcher();
  setupExportModal();
  setupImportModal();
  setupProjectPersistence();
  setupWriteback();
  setupToolTabs();
  setupVersionsPanel();
  setupCommentsPanel();
  setupLibrarySearch();
  setupTokenSearch();
  setupActivityFilter();
  setupScreenshot();
  setupPromptBar();
  setupExplain();
  setupPlayMode();
  setupMoreMenu();
  setupLlmSettings();
  updateLlmBadge();
  setupDrawTools();
  setupApplyBanner();
  setupCanvasBehavior();
  setupCanvasPlayClick();
  setupCommandPalette();
  setupQuickActions();
  setupConflictCheck();
  setupDesignLibrary();
  setupCanvasEditor();
  connect();

  // Also try fetching state via HTTP as fallback
  fetchInitialState();

  // Reconnect on visibility change
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && (!ws || ws.readyState !== WebSocket.OPEN)) {
      reconnectAttempts = 0;
      connect();
    }
  });
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
