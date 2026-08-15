// /* === SPLIT-MODULE === */
/**
 * Prism Dashboard — Canvas rendering, page background, freeform drag/resize, rulers/snapping and behavior dispatch.
 *
 * Part of the split client application. All parts are global-scope scripts;
 * they must be loaded in the order declared in index.html.
 */

// ===== Canvas Rendering =====

// Starter instructions shown on the empty canvas so nobody faces a blank page.
const EXAMPLE_PROMPTS = [
  { id: "color", zh: "把主色改成蓝色", en: "make the primary color blue" },
  { id: "template", zh: "生成一个 SaaS 模板", en: "generate a SaaS template" },
  { id: "font", zh: "字太小了，大一点", en: "make the text bigger" },
  { id: "bright", zh: "整体调亮一点", en: "brighten the page a bit" },
];

function examplePromptText(p) {
  return p[uiLang] || p.zh;
}

function renderCanvas(opts) {
  const canvas = $("canvas");
  const meta = $("canvas-meta");
  // 静默重绘（silent）：抑制入场动画重放，避免改一个字整页闪烁。
  const silent = !!(opts && opts.silent);
  canvas.classList.toggle("no-reenter", silent);

  // Phase 2.4 (增量更新): when the change only touched a few components,
  // re-render just those wrappers instead of the whole canvas.
  const onlyIds = opts && Array.isArray(opts.onlyIds) && opts.onlyIds.length > 0 ? opts.onlyIds : null;
  if (onlyIds && currentState && canvas.querySelector(".comp-wrapper")) {
    perfTime("renderCanvas.delta", () => {
      applyComponentDelta(onlyIds);
      applyElementSelectionHighlight();
    }, { count: onlyIds.length });
    return;
  }

  const components = getCurrentComponents();

  if (!currentState || components.length === 0) {
    canvas.innerHTML = `
      <div class="canvas-placeholder">
        <div class="placeholder-guide">
          <div class="placeholder-art">◈</div>
          <h2>${t("startDesigning")}</h2>
          <p class="placeholder-hint">${t("canvasHint1")}</p>
          <div class="placeholder-actions">
            <button class="placeholder-action" id="empty-ai">
              <span class="pa-icon">✦</span>
              <span><span class="pa-title">${t("startWithAI")}</span><br><span class="pa-desc">${t("startWithAIDesc")}</span></span>
            </button>
            <button class="placeholder-action" id="empty-library">
              <span class="pa-icon">▦</span>
              <span><span class="pa-title">${t("startWithLibrary")}</span><br><span class="pa-desc">${t("startWithLibraryDesc")}</span></span>
            </button>
            <button class="placeholder-action" id="empty-template">
              <span class="pa-icon">▤</span>
              <span><span class="pa-title">${t("startWithTemplate")}</span><br><span class="pa-desc">${t("startWithTemplateDesc")}</span></span>
            </button>
            <button class="placeholder-action" id="empty-client">
              <span class="pa-icon">◈</span>
              <span><span class="pa-title">${t("openClientUi")}</span><br><span class="pa-desc">${t("openClientUiDesc")}</span></span>
            </button>
            <button class="placeholder-action" id="empty-capture">
              <span class="pa-icon">▣</span>
              <span><span class="pa-title">${t("captureActualUi")}</span><br><span class="pa-desc">${t("captureActualUiDesc")}</span></span>
            </button>
            <button class="placeholder-action" id="empty-canvas">
              <span class="pa-icon">✎</span>
              <span><span class="pa-title">${t("startWithCanvas")}</span><br><span class="pa-desc">${t("startWithCanvasDesc")}</span></span>
            </button>
          </div>
          <div class="placeholder-examples">
            <span class="examples-hint">${t("examplesHint")}</span>
            ${EXAMPLE_PROMPTS.map((p) => `<button class="example-btn" data-ex="${p.id}">${examplePromptText(p)}</button>`).join("")}
          </div>
        </div>
      </div>
    `;
    const aiBtn = $("empty-ai");
    if (aiBtn) {
      aiBtn.addEventListener("click", () => {
        toggleCommandPalette();
      });
    }
    const libBtn = $("empty-library");
    if (libBtn) {
      libBtn.addEventListener("click", () => {
        const tab = document.querySelector('.lib-tab[data-lib="components"]');
        if (tab) tab.click();
        const hint = $("canvas-drop-hint");
        if (hint) {
          hint.textContent = t("startWithLibraryDesc");
          hint.style.display = "block";
          setTimeout(() => { hint.style.display = "none"; }, 2500);
        }
      });
    }
    const tplBtn = $("empty-template");
    if (tplBtn) {
      tplBtn.addEventListener("click", async () => {
        try {
          const response = await fetch("/api/template", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template: "saas_landing" }),
          });
          if (response.ok) {
            await fetchInitialState();
          }
        } catch (err) {
          console.error("Template create failed:", err);
        }
      });
    }
    const clientBtn = $("empty-client");
    if (clientBtn) {
      clientBtn.addEventListener("click", async () => {
        try {
          const response = await fetch("/api/import-client", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (response.ok) {
            await fetchInitialState();
          }
        } catch (err) {
          console.error("Client UI import failed:", err);
        }
      });
    }
    const captureBtn = $("empty-capture");
    if (captureBtn) {
      captureBtn.addEventListener("click", async () => {
        try {
          const response = await fetch("/api/capture-client", { method: "POST" });
          if (response.ok) {
            await fetchInitialState();
          } else {
            const data = await response.json().catch(() => ({}));
            alert(data.error || "截取失败");
          }
        } catch (err) {
          console.error("Capture failed:", err);
        }
      });
    }
    const canvasBtn = $("empty-canvas");
    if (canvasBtn) {
      canvasBtn.addEventListener("click", () => {
        setCanvasEditorMode(true);
      });
    }
    document.querySelectorAll(".example-btn").forEach((btn) => {
      const ex = EXAMPLE_PROMPTS.find((p) => p.id === btn.dataset.ex);
      if (ex) {
        btn.addEventListener("click", () => sendPrompt(examplePromptText(ex)));
      }
    });
    meta.textContent = "0 个组件";
    // Apply platform class even on placeholder
    applyPlatform(canvas);
    applyPageBackground(canvas);
    return;
  }

  canvas.innerHTML = "";
  applyPlatform(canvas);
  applyPageBackground(canvas);
  const count = countComponents(components);
  meta.textContent = `${count} 个组件`;

  // 自由模式：无布局坐标的组件自动获得坐标（含子组件），保证可移动/缩放。
  if (canvasMode === "freeform") {
    ensureFreeformLayouts();
  }

  perfTime("renderCanvas.full", () => {
    components.forEach((comp) => {
      canvas.appendChild(renderComponent(comp));
    });
    // 标尺/参考线跟随画布尺寸刷新
    renderRulers();
    renderGuides();
    // 元素级编辑 P1: 重绘后恢复内部元素高亮
    applyElementSelectionHighlight();
  }, { count });

  // 布局合一 (P1): 渲染后测量真实高度并回写，纠正估算值（消除重叠）。
  syncMeasuredHeights(components);
}

/**
 * 布局合一 (P1): 将渲染后的真实高度回写到 layout.h（仅当差异明显时），
 * 使后续的自动排布/吸附基于真实尺寸，不再重叠。回写是静默的（只更新本地
 * 与远端，不触发整页重绘循环——只在差异 > 8px 时才发送）。
 */
function syncMeasuredHeights(components) {
  const canvas = $("canvas");
  if (!canvas) return;
  for (const comp of components) {
    if (!comp.layout) continue;
    const el = canvas.querySelector(`.comp-wrapper[data-id="${CSS.escape(comp.id)}"]`);
    if (!el) continue;
    const realH = Math.round(el.getBoundingClientRect().height);
    if (realH < 20) continue;
    const curH = comp.layout.h || 0;
    if (Math.abs(realH - curH) > 8) {
      comp.layout.h = realH;
      // 静默更新：仅回写高度，不广播（避免重绘循环）；拖拽结束时会广播完整布局。
    }
  }
}

/**
 * Phase 2.4 (增量更新): apply a component delta — for each affected id,
 * replace (or add/remove) exactly that component's wrapper in place. Falls
 * back to a full re-render when a wrapper cannot be matched.
 */
function applyComponentDelta(ids) {
  const canvas = $("canvas");
  if (!canvas) return;
  const all = getCurrentComponents();

  // Top-level component ids: children render inside their parent wrapper, so
  // we rebuild the top-level ancestor of every affected id. If no ancestor
  // wrapper exists on the canvas, fall back to a full re-render.
  const rootIds = [];
  for (const id of ids) {
    const root = topLevelAncestorOf(all, id);
    if (root) rootIds.push(root.id);
  }
  const uniqueRoots = [...new Set(rootIds)];

  // Remove deleted top-level components first (wrappers no longer in state).
  const liveRootIds = new Set(all.map((c) => c.id));
  uniqueRoots.forEach((id) => {
    if (!liveRootIds.has(id)) {
      const wrapper = canvas.querySelector(`.comp-wrapper[data-id="${CSS.escape(id)}"]`);
      if (wrapper) wrapper.remove();
    }
  });

  let ok = true;
  uniqueRoots.forEach((id) => {
    if (!liveRootIds.has(id)) return; // removed above
    const comp = findCompDeep(all, id);
    if (!comp) return;
    const fresh = renderComponent(comp);
    const existing = canvas.querySelector(`.comp-wrapper[data-id="${CSS.escape(id)}"]`);
    if (existing) {
      existing.replaceWith(fresh);
    } else {
      canvas.appendChild(fresh);
    }
  });

  // If any affected id had no top-level ancestor on the canvas (or the canvas
  // was empty), a full re-render is safer than leaving the delta half-applied.
  if (uniqueRoots.length === 0 || !ok) {
    renderCanvas({ silent: true });
    return;
  }
  updateComponentCount();
  renderRulers();
  renderGuides();
}

/** Walk up from a component id to its top-level ancestor (or null). */
function topLevelAncestorOf(roots, id) {
  for (const root of roots) {
    if (root.id === id) return root;
    const child = findCompDeep(root.children || [], id);
    if (child) return root;
  }
  return null;
}

/** Update the "N 个组件" counter without a full re-render. */
function updateComponentCount() {
  const meta = $("canvas-meta");
  if (!meta || !currentState) return;
  meta.textContent = `${countComponents(getCurrentComponents())} 个组件`;
}

/**
 * 布局合一 (P1): 为所有缺 layout 的顶层组件分配坐标。
 * 优先用已渲染 DOM 的真实高度（避免重叠），否则按类型估算，兜底 140。
 * 子组件相对其父容器排列（流式），无需画布级坐标，因此不在此处递归。
 */
function ensureFreeformLayouts() {
  const canvas = $("canvas");
  const width = canvas ? Math.max(320, Math.round(canvas.getBoundingClientRect().width) - 32) : 640;
  let cursor = 16;
  for (const comp of getCurrentComponents()) {
    if (!comp.layout) {
      const h = measureComponentHeight(comp.id) || estimatedComponentHeight(comp.type);
      comp.layout = { x: 16, y: cursor, w: width, h };
      sendUpdateComponent(comp.id, {}, comp.layout);
    }
    cursor = Math.max(cursor, (comp.layout.y || 0) + (comp.layout.h || 140) + 16);
  }
}

/** 测量已渲染组件的真实高度（px，取整），无 DOM 时返回 null。 */
function measureComponentHeight(compId) {
  const canvas = $("canvas");
  if (!canvas) return null;
  const el = canvas.querySelector(`.comp-wrapper[data-id="${CSS.escape(compId)}"]`);
  if (!el) return null;
  const h = Math.round(el.getBoundingClientRect().height);
  return h > 20 ? h : null;
}

/** 按组件类型估算的默认高度（布局合一 P1：用于尚无真实高度时）。 */
function estimatedComponentHeight(type) {
  const map = {
    hero: 240, navbar: 72, card_grid: 260, cta: 180, footer: 96,
    text_section: 120, feature_list: 220, stats: 140, pricing: 340,
    testimonial: 160, banner: 96, timeline: 240, faq: 200, form: 260,
    tabs: 160, accordion: 180, carousel: 220, modal: 200, sidebar: 260,
    table: 200, bento_grid: 240, button: 56, card: 220, image: 200,
  };
  return map[type] || 140;
}

// Apply platform width class + device chrome to canvas
function applyPlatform(canvas) {
  const pf = PLATFORMS[currentPlatform] || PLATFORMS["web-desktop"];
  const deviceClass = `device-${pf.device}`;
  canvas.classList.remove("device-desktop", "device-tablet", "device-mobile");
  canvas.classList.add(deviceClass);
  // Phase 3.2: narrow-canvas marks the mobile preview so component grids
  // collapse via container-scoped rules (media queries can't see the canvas
  // width, only the viewport).
  canvas.classList.toggle("narrow-canvas", pf.device === "mobile");
  const chrome = $("platform-chrome");
  if (chrome) {
    chrome.classList.remove("device-desktop", "device-tablet", "device-mobile");
    chrome.classList.add(deviceClass);
    chrome.dataset.chrome = pf.frame;
    const top = $("chrome-top");
    const bottom = $("chrome-bottom");
    if (top) top.innerHTML = buildChromeTop(pf);
    if (bottom) bottom.innerHTML = buildChromeBottom(pf);
  }
}

function buildChromeTop(pf) {
  if (pf.frame === "browser") {
    return `<span class="chrome-dot dot-r"></span><span class="chrome-dot dot-y"></span><span class="chrome-dot dot-g"></span><span class="chrome-url">${pf.url}</span>`;
  }
  if (pf.frame === "macos") {
    return `<span class="chrome-dot dot-r"></span><span class="chrome-dot dot-y"></span><span class="chrome-dot dot-g"></span><span class="chrome-title">${pf.title}</span>`;
  }
  if (pf.frame === "windows") {
    return `<span class="chrome-title">${pf.title}</span><span class="chrome-win-controls"><span>—</span><span>☐</span><span class="win-close">✕</span></span>`;
  }
  if (pf.frame === "ios") {
    return `<span class="chrome-status-time">9:41</span><span class="chrome-status-icons">● ●● ●</span>`;
  }
  if (pf.frame === "android") {
    return `<span class="chrome-status-time">9:41</span><span class="chrome-status-icons">100%</span>`;
  }
  return "";
}

function buildChromeBottom(pf) {
  if (pf.frame === "ios") {
    return `<span class="chrome-home-indicator"></span>`;
  }
  if (pf.frame === "android") {
    return `<span class="chrome-nav-btn">◯</span><span class="chrome-nav-btn">◻</span><span class="chrome-nav-btn">△</span>`;
  }
  return "";
}

function countComponents(components) {
  let count = 0;
  for (const comp of components) {
    count++;
    if (comp.children) count += countComponents(comp.children);
  }
  return count;
}

function applyStyleProps(wrapper, props) {
  if (!props) return;
  if (props.color) wrapper.style.color = String(props.color);
  if (props.bg) wrapper.style.background = String(props.bg);
  if (props.radius !== undefined && props.radius !== null && props.radius !== "") {
    const r = String(props.radius).replace(/px$/, "");
    wrapper.style.borderRadius = r + "px";
  }
  if (props.fontSize !== undefined && props.fontSize !== null && props.fontSize !== "") {
    const f = String(props.fontSize).replace(/px$/, "");
    wrapper.style.fontSize = f + "px";
  }
  if (props.spacing !== undefined && props.spacing !== null && props.spacing !== "") {
    const s = String(props.spacing).replace(/px$/, "");
    wrapper.style.padding = s + "px";
  }
}

// ===== 背景编辑 P1 (page background) =====

/**
 * 页面背景预设库：一键应用的颜色 / 渐变 / 图案 / 图片 / 动画背景。
 * value 直接作为 CSS background 值使用。
 */
const PAGE_BACKGROUND_PRESETS = [
  // 纯色
  { id: "color_white", type: "color", name: "纯白", value: "#ffffff" },
  { id: "color_snow", type: "color", name: "雪白", value: "#f8fafc" },
  { id: "color_smoke", type: "color", name: "烟灰", value: "#f1f5f9" },
  { id: "color_slate", type: "color", name: "石板灰", value: "#334155" },
  { id: "color_ink", type: "color", name: "墨黑", value: "#0b0a0f" },
  { id: "color_navy", type: "color", name: "藏青", value: "#0f172a" },
  { id: "color_cream", type: "color", name: "奶油", value: "#fdf6ec" },
  { id: "color_mint", type: "color", name: "薄荷", value: "#ecfdf5" },
  // 渐变
  { id: "grad_sunset", type: "gradient", name: "日落", value: "linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)" },
  { id: "grad_ocean", type: "gradient", name: "海洋", value: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)" },
  { id: "grad_aurora", type: "gradient", name: "极光", value: "linear-gradient(135deg, #10b981 0%, #22d3ee 50%, #6366f1 100%)" },
  { id: "grad_berry", type: "gradient", name: "浆果", value: "linear-gradient(135deg, #f43f5e 0%, #a855f7 100%)" },
  { id: "grad_midnight", type: "gradient", name: "午夜", value: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)" },
  { id: "grad_gold", type: "gradient", name: "鎏金", value: "linear-gradient(135deg, #f59e0b 0%, #fde68a 100%)" },
  // 图案
  { id: "pat_dots", type: "pattern", name: "圆点", value: "radial-gradient(circle, rgba(100,116,139,0.35) 1px, transparent 1px) 0 0 / 22px 22px, #f8fafc" },
  { id: "pat_grid", type: "pattern", name: "网格", value: "linear-gradient(rgba(100,116,139,0.18) 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, rgba(100,116,139,0.18) 1px, transparent 1px) 0 0 / 24px 24px, #f8fafc" },
  { id: "pat_stripes", type: "pattern", name: "斜纹", value: "repeating-linear-gradient(45deg, rgba(99,102,241,0.12) 0 10px, transparent 10px 20px), #f8fafc" },
  { id: "pat_checker", type: "pattern", name: "棋盘", value: "conic-gradient(rgba(15,23,42,0.12) 25%, transparent 0 50%, rgba(15,23,42,0.12) 0 75%, transparent 0) 0 0 / 24px 24px, #f8fafc" },
  { id: "pat_dark_grid", type: "pattern", name: "暗色网格", value: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 28px 28px, #0b0a0f" },
  // 动画
  { id: "anim_aurora", type: "animation", name: "流光极光", value: "linear-gradient(135deg, #6366f1, #ec4899, #22d3ee, #6366f1) 0 0 / 300% 300%", animation: "aurora" },
  { id: "anim_shift", type: "animation", name: "渐变流动", value: "linear-gradient(135deg, #0ea5e9, #8b5cf6, #f43f5e, #0ea5e9) 0 0 / 300% 300%", animation: "gradientShift" },
  { id: "anim_pulse", type: "animation", name: "呼吸光晕", value: "radial-gradient(circle at 50% 40%, #6366f1, #0f172a 70%)", animation: "pulse" },
];

/** 页面背景动画 keyframes（客户端预览用）。 */
const PAGE_BACKGROUND_ANIM_CSS = {
  aurora: "@keyframes prismBgAurora { 0% { background-position: 0% 50%; filter: hue-rotate(0deg); } 50% { background-position: 100% 50%; filter: hue-rotate(45deg); } 100% { background-position: 0% 50%; filter: hue-rotate(0deg); } }",
  gradientShift: "@keyframes prismBgShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }",
  pulse: "@keyframes prismBgPulse { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }",
};

let pageBgAnimStyleEl = null;

/** 将页面背景应用到画布容器（预览）。 */
function applyPageBackground(canvas) {
  if (!canvas) return;
  const bg = currentState && currentState.pageBackground;
  if (!bg) {
    canvas.style.background = "";
    canvas.style.animation = "";
    if (pageBgAnimStyleEl) {
      pageBgAnimStyleEl.remove();
      pageBgAnimStyleEl = null;
    }
    return;
  }
  canvas.style.background = bg.value;
  if (bg.type === "animation") {
    const name = cssAnimName(bg.animation);
    if (!pageBgAnimStyleEl) {
      pageBgAnimStyleEl = document.createElement("style");
      pageBgAnimStyleEl.id = "page-bg-anim";
      document.head.appendChild(pageBgAnimStyleEl);
    }
    pageBgAnimStyleEl.textContent = PAGE_BACKGROUND_ANIM_CSS[bg.animation] || PAGE_BACKGROUND_ANIM_CSS.gradientShift;
    canvas.style.animation = `${name} 18s ease-in-out infinite alternate`;
  } else {
    canvas.style.animation = "";
    if (pageBgAnimStyleEl) {
      pageBgAnimStyleEl.remove();
      pageBgAnimStyleEl = null;
    }
  }
}

function cssAnimName(animation) {
  const map = { aurora: "prismBgAurora", gradientShift: "prismBgShift", pulse: "prismBgPulse" };
  return map[animation] || "prismBgShift";
}

/** 保存页面背景（null 清除）。 */
function savePageBackground(background) {
  fetch("/api/page-background", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ background }),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .then(() => {
      if (currentState) {
        if (background) currentState.pageBackground = background;
        else delete currentState.pageBackground;
      }
      applyPageBackground($("canvas"));
      showToastMsg(background ? t("toastBgApplied") : t("toastBgCleared"));
    })
    .catch((err) => {
      console.error("Set page background failed:", err);
      showToastMsg(t("dsError"), true);
    });
}

function renderComponent(comp) {
  const wrapper = el("div", "comp-wrapper");
  wrapper.dataset.id = comp.id;
  applyStyleProps(wrapper, comp.props);
  if (comp.visible === false) {
    wrapper.style.display = "none";
  }
  wrapper.addEventListener("click", (e) => {
    // Ignore clicks on overlay controls and active inline editing
    if (e.target.closest(".comp-delete") || e.target.closest(".comp-drag-handle")) return;
    if (e.target.closest("[contenteditable='true']")) return;
    // 子组件点击不再冒泡到父组件：否则选中的是父组件，内部组成部分无法调整。
    e.stopPropagation();
    // Play mode: dispatch the bound behavior — first element-level (元素级
    // 编辑 P1: 内部文字/按钮的独立交互), falling back to component-level.
    if (playMode) {
      const elBehavior = elementBehaviorAt(e.target, comp);
      if (elBehavior) {
        dispatchElementBehavior(elBehavior);
        return;
      }
      if (hasClickableBehavior(comp)) {
        dispatchBehavior(comp);
      } else {
        const link = ((currentState && currentState.pageLinks) || []).find(
          (l) => l.source_component_id === comp.id
        );
        if (link && link.to_page_id && link.to_page_id !== (currentState && currentState.currentPageId)) {
          send({ type: "switch_page", pageId: link.to_page_id });
        }
      }
      return;
    }
    // 元素级编辑 P1: 单击组件内部元素（文字/按钮）→ 选中该元素而非整个组件。
    const innerEl = e.target.closest("[data-element='true']");
    if (innerEl && innerEl.closest(".comp-wrapper") === wrapper) {
      const path = innerEl.getAttribute("data-prop");
      if (path) {
        selectElement(comp.id, path);
        return;
      }
    }
    selectComponent(comp.id, e.shiftKey);
  });

  let dragHandle = null;

  if (playMode) {
    // Components with a behavior (or a legacy page link) are click-through.
    if (hasClickableBehavior(comp)) {
      wrapper.classList.add("play-linked");
    } else {
      const link = ((currentState && currentState.pageLinks) || []).find(
        (l) => l.source_component_id === comp.id
      );
      if (link && link.to_page_id) wrapper.classList.add("play-linked");
    }
  } else {
    // Overlay with badge, drag handle, and delete button
    const overlay = el("div", "comp-overlay");
    const badge = el("span", "comp-badge", `${comp.type}${comp.variant ? "/" + comp.variant : ""}`);
    overlay.appendChild(badge);

    // Drag handle for reorder (instead of making entire wrapper draggable)
    dragHandle = el("span", "comp-drag-handle", "⠿");
    dragHandle.title = "拖拽排序";
    dragHandle.draggable = true;
    overlay.appendChild(dragHandle);

    const deleteBtn = el("button", "comp-delete", "删除");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteComponent(comp.id);
    });
    overlay.appendChild(deleteBtn);

    wrapper.appendChild(overlay);
  }

  // Render the actual component
  const content = renderComponentContent(comp);
  if (content) {
    applyElementMetaStyles(content, comp);
    wrapper.appendChild(content);
  }

  // Freeform layout: absolute positioning + drag/resize
  if (canvasMode === "freeform" && comp.layout) {
    const L = comp.layout;
    wrapper.style.position = "absolute";
    wrapper.style.left = L.x + "px";
    wrapper.style.top = L.y + "px";
    if (L.w > 0) wrapper.style.width = L.w + "px";
    if (L.h > 0) wrapper.style.minHeight = L.h + "px";
    if (!comp.locked) {
      attachFreeformDrag(wrapper, comp.id);
      attachResizeHandles(wrapper, comp.id);
    }
  }

  // Apply animation if set
  if (comp.animation) {
    applyAnimation(wrapper, comp.animation);
  }

  // Render children if any
  if (comp.children && comp.children.length > 0) {
    comp.children.forEach((child) => {
      wrapper.appendChild(renderComponent(child));
    });
  }

  if (!playMode) {
    // Attach drag & drop handlers (using drag handle, not wrapper)
    attachDragHandlers(wrapper, comp.id, dragHandle);
    // Setup inline editing for data-editable elements
    setupInlineEditing(wrapper, comp.id);
  }

  if (comp.id === selectedComponentId) {
    wrapper.classList.add("selected");
  }

  return wrapper;
}

// ===== Freeform Canvas (B6) =====

/**
 * Phase 2.5 (Pointer Events): run a drag gesture on pointerdown and track it
 * with pointermove/pointerup — one code path for mouse, touch and pen.
 * `onMove(dx, dy, ev)` receives deltas from the pointerdown position and the
 * raw event; `onUp(dx, dy, ev)` runs once on release (including touch end).
 */
function attachPointerDrag(element, handlers) {
  let activePointerId = null;
  let startX = 0;
  let startY = 0;

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (activePointerId !== null) return;
    // Let overlays / handles keep their own behavior unless opted in.
    if (handlers.shouldSkip && handlers.shouldSkip(e)) return;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    if (handlers.onStart) handlers.onStart(e, startX, startY);
    try { element.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (handlers.preventDefault !== false) e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (handlers.onMove) handlers.onMove(dx, dy, e);
  };

  const onPointerUp = (e) => {
    if (e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    activePointerId = null;
    try { element.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (handlers.onUp) handlers.onUp(dx, dy, e);
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerUp);
  // Suppress the browser's synthetic mouse events during touch drags so
  // click-based selection still works correctly.
  element.addEventListener("touchstart", (e) => {
    if (handlers.touchstart !== false) e.preventDefault();
  }, { passive: false });
}

/** True when a pointer drag is active on the given element (internal). */
function attachFreeformDrag(wrapper, compId) {
  attachPointerDrag(wrapper, {
    shouldSkip: (e) => {
      // Only exclude actual controls; dragging from the badge/overlay strip is allowed.
      if (e.target.closest(".comp-delete") || e.target.closest(".comp-drag-handle")) return true;
      if (e.target.closest(".resize-handle")) return true;
      if (e.target.closest("[contenteditable='true']")) return true;
      // 内联编辑文字：不启动拖动，否则双击编辑会被打断。
      if (e.target.closest("[data-editable='true']")) return true;
      // 元素级编辑 P1: 内部元素（文字/按钮）不启动组件拖动，
      // 让元素的 click 处理器完成元素选中/交互。
      if (e.target.closest("[data-element='true']")) return true;
      // 子组件拦截：点击落在内部子组件上时，不启动父组件拖动、不选中父，
      // 让子组件自己的 click 处理器接管。
      const inner = e.target.closest(".comp-wrapper");
      if (inner && inner !== wrapper && inner.contains(e.target)) {
        if (inner.dataset.id !== compId) return true;
      }
      return false;
    },
    onStart: (e, startX, startY) => {
      selectComponent(compId);
      const comp = getCompById(compId);
      const origX = (comp && comp.layout ? comp.layout.x : 0);
      const origY = (comp && comp.layout ? comp.layout.y : 0);
      const origW = (comp && comp.layout ? comp.layout.w : 0);
      const origH = (comp && comp.layout ? comp.layout.h : 0);
      wrapper.style.transition = "none";
      wrapper._prismDrag = { startX, startY, origX, origY, origW, origH };
    },
    onMove: (dx, dy) => {
      const d = wrapper._prismDrag;
      if (!d) return;
      // 吸附 (snapping): align to guides / canvas edges / other components.
      const snapped = snapLayout(
        { x: Math.max(0, d.origX + dx), y: Math.max(0, d.origY + dy), w: d.origW, h: d.origH },
        compId,
        { all: true }
      );
      wrapper.style.left = snapped.x + "px";
      wrapper.style.top = snapped.y + "px";
    },
    onUp: () => {
      if (wrapper._prismDrag) delete wrapper._prismDrag;
      wrapper.style.transition = "";
      clearSnapLines();
      const x = parseFloat(wrapper.style.left) || 0;
      const y = parseFloat(wrapper.style.top) || 0;
      const compNow = getCompById(compId);
      const measuredH = measureComponentHeight(compId);
      sendUpdateComponent(compId, {}, { x, y, h: measuredH || (compNow && compNow.layout && compNow.layout.h) || 140 });
      if (compNow) {
        compNow.layout = {
          ...(compNow.layout || {}),
          x,
          y,
          ...(measuredH ? { h: measuredH } : {}),
        };
      }
    },
  });
}

const RESIZE_DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

function attachResizeHandles(wrapper, compId) {
  RESIZE_DIRS.forEach((dir) => {
    const handle = el("div", `resize-handle rh-${dir}`);
    handle.dataset.dir = dir;
    attachPointerDrag(handle, {
      // Handles only start their own drag; the pointerdown target is the
      // handle itself so no extra skip logic is needed.
      shouldSkip: (e) => e.target !== handle,
      onStart: (e, startX, startY) => {
        e.stopPropagation();
        const comp = getCompById(compId);
        const L = comp && comp.layout ? { ...comp.layout } : { x: 0, y: 0, w: 0, h: 0 };
        handle._prismResize = { startX, startY, L };
      },
      onMove: (dx, dy) => {
        const d = handle._prismResize;
        if (!d) return;
        const { L } = d;
        let { x, y, w, h } = L;
        if (dir.includes("e")) w = Math.max(60, (L.w || 320) + dx);
        if (dir.includes("s")) h = Math.max(40, (L.h || 140) + dy);
        if (dir.includes("w")) {
          w = Math.max(60, (L.w || 320) - dx);
          x = (L.x || 0) + ((L.w || 320) - w);
        }
        if (dir.includes("n")) {
          h = Math.max(40, (L.h || 140) - dy);
          y = (L.y || 0) + ((L.h || 140) - h);
        }
        // 吸附 (snapping): only the edges being moved snap.
        const edges = {
          left: dir.includes("w"),
          right: dir.includes("e"),
          top: dir.includes("n"),
          bottom: dir.includes("s"),
        };
        const snapped = snapLayout({ x, y, w, h }, compId, edges);
        ({ x, y, w, h } = snapped);
        wrapper.style.left = x + "px";
        wrapper.style.top = y + "px";
        wrapper.style.width = w + "px";
        wrapper.style.minHeight = h + "px";
      },
      onUp: () => {
        if (handle._prismResize) delete handle._prismResize;
        clearSnapLines();
        const rect = wrapper.getBoundingClientRect();
        const canvasRect = $("canvas").getBoundingClientRect();
        const layout = {
          x: Math.round(rect.left - canvasRect.left),
          y: Math.round(rect.top - canvasRect.top),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        };
        sendUpdateComponent(compId, {}, layout);
        const compNow = getCompById(compId);
        if (compNow) compNow.layout = layout;
      },
    });
    wrapper.appendChild(handle);
  });
}

// ===== 精确编辑 P0: 标尺 / 参考线 / 吸附 =====

/** Session-scoped guides (canvas units, same space as comp.layout). */
let canvasGuides = { h: [], v: [] };
const SNAP_THRESHOLD = 5; // canvas px

function rulerZoom() {
  return (canvasZoom || 100) / 100;
}

/** Frame's on-screen position in wrap-logical coords (zoom/scroll independent). */
function frameRectInWrap() {
  const wrap = $("canvas-scroll-wrap");
  const frame = $("canvas-frame");
  if (!wrap || !frame) return null;
  const wrapRect = wrap.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const z = rulerZoom();
  return {
    left: (frameRect.left - wrapRect.left) / z,
    top: (frameRect.top - wrapRect.top) / z,
    width: frameRect.width / z,
    height: frameRect.height / z,
  };
}

function renderRulers() {
  const h = $("ruler-h");
  const v = $("ruler-v");
  const frame = frameRectInWrap();
  if (!h || !v || !frame) return;
  // Rulers are pinned at the viewport top-left (sticky stage); the frame
  // scrolls beneath. Ticks offset by the frame's current position so labels
  // stay aligned with canvas coordinates (all in wrap-logical px; CSS zoom
  // scales ruler + frame together).
  h.style.left = Math.max(0, frame.left) + "px";
  h.style.width = frame.width + "px";
  v.style.top = Math.max(0, frame.top) + "px";
  v.style.height = frame.height + "px";

  const STEP = 50;
  let hHtml = "";
  for (let x = 0; x <= frame.width; x += STEP) {
    const major = x % 100 === 0;
    const pos = x + Math.max(0, frame.left);
    hHtml += `<div class="ruler-line" style="left:${pos}px;${major ? "height:100%" : "height:6px"}"></div>`;
    if (major && x > 0) hHtml += `<div class="ruler-tick" style="left:${pos}px">${x}</div>`;
  }
  h.innerHTML = hHtml;
  let vHtml = "";
  for (let y = 0; y <= frame.height; y += STEP) {
    const major = y % 100 === 0;
    const pos = y + Math.max(0, frame.top);
    vHtml += `<div class="ruler-line" style="top:${pos}px;${major ? "width:100%" : "width:6px"}"></div>`;
    if (major && y > 0) vHtml += `<div class="ruler-tick" style="top:${pos}px">${y}</div>`;
  }
  v.innerHTML = vHtml;
}

function renderGuides() {
  const layer = $("canvas-guides");
  if (!layer) return;
  // Preserve snap lines while re-rendering guides.
  layer.querySelectorAll(".canvas-guide").forEach((g) => g.remove());
  canvasGuides.h.forEach((y) => {
    const el = el("div", "canvas-guide guide-h");
    el.style.top = y + "px";
    el.dataset.axis = "h";
    el.dataset.pos = String(y);
    attachGuideDrag(el, "h", y);
    layer.appendChild(el);
  });
  canvasGuides.v.forEach((x) => {
    const el = el("div", "canvas-guide guide-v");
    el.style.left = x + "px";
    el.dataset.axis = "v";
    el.dataset.pos = String(x);
    attachGuideDrag(el, "v", x);
    layer.appendChild(el);
  });
}

function clearSnapLines() {
  const layer = $("canvas-guides");
  if (layer) layer.querySelectorAll(".canvas-snap-line").forEach((s) => s.remove());
}

function showSnapLine(axis, pos) {
  const layer = $("canvas-guides");
  if (!layer) return;
  clearSnapLines();
  const line = el("div", "canvas-snap-line " + (axis === "h" ? "snap-h" : "snap-v"));
  if (axis === "h") line.style.top = pos + "px";
  else line.style.left = pos + "px";
  layer.appendChild(line);
}

/** Create a guide by dragging out of a ruler. */
function startGuideFromRuler(axis) {
  const frame = frameRectInWrap();
  if (!frame) return;
  const layer = $("canvas-guides");
  if (!layer) return;
  const guide = el("div", "canvas-guide guide-" + axis);
  guide.classList.add("dragging");
  const move = (dx, dy, ev) => {
    const z = rulerZoom();
    if (axis === "h") {
      const y = Math.round((ev.clientY - layer.getBoundingClientRect().top) / z);
      guide.style.top = Math.max(0, y) + "px";
    } else {
      const x = Math.round((ev.clientX - layer.getBoundingClientRect().left) / z);
      guide.style.left = Math.max(0, x) + "px";
    }
  };
  const up = () => {
    guide.classList.remove("dragging");
    guide.remove();
    const pos = axis === "h" ? parseFloat(guide.style.top) : parseFloat(guide.style.left);
    if (Number.isFinite(pos)) {
      canvasGuides[axis].push(pos);
      canvasGuides[axis].sort((a, b) => a - b);
      renderGuides();
    }
  };
  layer.appendChild(guide);
  // Track the gesture on the guide element itself via pointer events.
  attachPointerDrag(guide, { onMove: move, onUp: up, preventDefault: false, touchstart: false });
}

/** Drag an existing guide to move it; dragging onto the ruler strip deletes it. */
function attachGuideDrag(guideEl, axis, initial) {
  let startClient = 0;
  let startPos = initial;
  attachPointerDrag(guideEl, {
    shouldSkip: (e) => e.target !== guideEl,
    onStart: (e) => {
      e.stopPropagation();
      startClient = axis === "h" ? e.clientY : e.clientX;
      startPos = initial;
      guideEl.classList.add("dragging");
    },
    onMove: (dx, dy, ev) => {
      const z = rulerZoom();
      const d = ((axis === "h" ? ev.clientY : ev.clientX) - startClient) / z;
      const next = startPos + d;
      if (axis === "h") guideEl.style.top = next + "px";
      else guideEl.style.left = next + "px";
      // Dragging onto the ruler strip (negative coordinate) deletes on release.
      guideEl.dataset.draggingOut = String(next < 0);
    },
    onUp: () => {
      guideEl.classList.remove("dragging");
      if (guideEl.dataset.draggingOut === "true") {
        canvasGuides[axis] = canvasGuides[axis].filter((p) => Math.abs(p - startPos) > 0.01);
        renderGuides();
        return;
      }
      const pos = axis === "h" ? parseFloat(guideEl.style.top) : parseFloat(guideEl.style.left);
      if (Number.isFinite(pos)) {
        const idx = canvasGuides[axis].findIndex((p) => Math.abs(p - startPos) < 0.01);
        const value = Math.max(0, Math.round(pos));
        if (idx >= 0) canvasGuides[axis][idx] = value;
        guideEl.style[axis === "h" ? "top" : "left"] = value + "px";
        guideEl.dataset.pos = String(value);
      }
    },
  });
  // Double-click removes the guide.
  guideEl.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    canvasGuides[axis] = canvasGuides[axis].filter((p) => Math.abs(p - startPos) > 0.01);
    renderGuides();
  });
}

function setupRulersAndGuides() {
  const wrap = $("canvas-scroll-wrap");
  if (!wrap) return;
  // Re-render rulers on scroll (throttled) so ticks follow the frame.
  let ticking = false;
  wrap.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      renderRulers();
    });
  });
  window.addEventListener("resize", renderRulers);
  // Drag guides out of the rulers (pointer events — mouse + touch).
  const hRuler = $("ruler-h");
  const vRuler = $("ruler-v");
  if (hRuler) {
    hRuler.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      startGuideFromRuler("h");
    });
  }
  if (vRuler) {
    vRuler.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      startGuideFromRuler("v");
    });
  }
}

// ===== 吸附 (snapping) =====

/** Collect snap candidates for an axis in canvas units. */
function snapCandidates(axis, skipId) {
  const cands = new Set(canvasGuides[axis === "x" ? "v" : "h"]);
  const frame = frameRectInWrap();
  const frameW = frame ? frame.width : 800;
  const frameH = frame ? frame.height : 600;
  if (axis === "x") {
    cands.add(0);
    cands.add(frameW / 2);
    cands.add(frameW);
  } else {
    cands.add(0);
    cands.add(frameH / 2);
    cands.add(frameH);
  }
  findAllComponents(getCurrentComponents())
    .filter((c) => c.id !== skipId && c.layout)
    .forEach((c) => {
      const L = c.layout;
      if (axis === "x") {
        cands.add(L.x);
        cands.add(L.x + (L.w || 0) / 2);
        cands.add(L.x + (L.w || 0));
      } else {
        cands.add(L.y);
        cands.add(L.y + (L.h || 0) / 2);
        cands.add(L.y + (L.h || 0));
      }
    });
  return [...cands].filter((v) => Number.isFinite(v));
}

/**
 * Snap a value to the nearest candidate within the threshold.
 * Returns { value, snapped } where snapped is the candidate (or null).
 */
function snapValue(value, candidates) {
  let best = null;
  let bestDist = SNAP_THRESHOLD;
  for (const cand of candidates) {
    const d = Math.abs(value - cand);
    if (d <= bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best === null ? { value, snapped: null } : { value: best, snapped: best };
}

/**
 * Snap a freeform drag: given the proposed layout and which edges matter
 * (all for move; subset for resize), align to guides/edges and return the
 * adjusted layout plus snap lines to display.
 */
function snapLayout(layout, compId, edges) {
  const z = rulerZoom();
  const xCands = snapCandidates("x", compId);
  const yCands = snapCandidates("y", compId);
  let { x, y, w, h } = layout;
  let lineH = null;
  let lineV = null;
  const wantX = edges.x || edges.all;
  const wantY = edges.y || edges.all;
  if (wantX) {
    const edgesX = [];
    if (edges.left || edges.all) edgesX.push({ edge: x, key: "left" });
    if (edges.centerX || edges.all) edgesX.push({ edge: x + (w || 0) / 2, key: "cx" });
    if (edges.right || edges.all) edgesX.push({ edge: x + (w || 0), key: "right" });
    let bestDx = null;
    for (const { edge, key } of edgesX) {
      const res = snapValue(edge, xCands);
      if (res.snapped !== null) {
        const dx = res.snapped - edge;
        if (bestDx === null || Math.abs(dx) < Math.abs(bestDx)) bestDx = dx;
        lineV = res.snapped;
      }
    }
    if (bestDx !== null) x = x + bestDx;
  }
  if (wantY) {
    const edgesY = [];
    if (edges.top || edges.all) edgesY.push({ edge: y, key: "top" });
    if (edges.centerY || edges.all) edgesY.push({ edge: y + (h || 0) / 2, key: "cy" });
    if (edges.bottom || edges.all) edgesY.push({ edge: y + (h || 0), key: "bottom" });
    let bestDy = null;
    for (const { edge } of edgesY) {
      const res = snapValue(edge, yCands);
      if (res.snapped !== null) {
        const dy = res.snapped - edge;
        if (bestDy === null || Math.abs(dy) < Math.abs(bestDy)) bestDy = dy;
        lineH = res.snapped;
      }
    }
    if (bestDy !== null) y = y + bestDy;
  }
  if (lineH !== null) showSnapLine("h", lineH);
  if (lineV !== null) showSnapLine("v", lineV);
  return { x, y, w, h };
}

function getCompById(id) {
  if (!currentState) return null;
  return findCompDeep(getCurrentComponents(), id);
}

function findCompDeep(nodes, id) {
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findCompDeep(node.children, id);
    if (found) return found;
  }
  return null;
}

function findAllComponents(nodes) {
  const out = [];
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

// ===== Behavior model (P1): dispatch an interaction in play mode =====

function dispatchBehavior(comp) {
  const b = comp && comp.behavior;
  if (!b || !b.type) return;
  switch (b.type) {
    case "navigate":
      if (b.page_id && b.page_id !== (currentState && currentState.currentPageId)) {
        send({ type: "switch_page", pageId: b.page_id });
      }
      break;
    case "link":
      if (b.url) {
        window.open(b.url, b.new_tab === false ? "_self" : "_blank", "noopener");
      }
      break;
    case "toggle": {
      if (!b.target_component_id) break;
      const target = findCompDeep(getCurrentComponents(), b.target_component_id);
      if (target) {
        send({
          type: "update_component",
          id: target.id,
          props: {},
          visible: target.visible === false,
        });
      }
      break;
    }
    case "toast":
      showToastMsg(b.message || t("behaviorToastDefault"));
      break;
    case "submit":
      showToastMsg(t("behaviorSubmitted"));
      break;
    case "prompt":
      if (b.prompt) sendPrompt(b.prompt);
      break;
    default:
      break;
  }
}

function hasClickableBehavior(comp) {
  return !!(comp && comp.behavior && comp.behavior.type);
}

function sendUpdateComponent(id, props, layout) {
  send({ type: "update_component", id, props: props || {}, layout: layout || undefined });
}

function applyCanvasMode(canvas) {
  if (!canvas) return;
  canvas.classList.toggle("canvas-freeform", canvasMode === "freeform");
  const wrap = $("canvas-scroll-wrap");
  if (wrap) wrap.classList.toggle("freeform-active", canvasMode === "freeform");
  const btn = $("layout-mode-btn");
  if (btn) btn.textContent = canvasMode === "freeform" ? t("freeform") : t("flow");
  if (canvasMode === "freeform") {
    renderRulers();
    renderGuides();
  }
}

function initializeFreeformLayouts() {
  const canvas = $("canvas");
  const width = canvas ? Math.max(320, Math.round(canvas.getBoundingClientRect().width) - 32) : 640;
  let cursor = 16;
  // 顶层组件按列排列获得布局坐标（子组件相对父容器流式排列）。
  getCurrentComponents().forEach((comp) => {
    if (!comp.layout) {
      const h = measureComponentHeight(comp.id) || estimatedComponentHeight(comp.type);
      const layout = { x: 16, y: cursor, w: width, h };
      comp.layout = layout;
      sendUpdateComponent(comp.id, {}, layout);
    }
    cursor += (comp.layout.h || estimatedComponentHeight(comp.type) || 140) + 16;
  });
}

function autoLayout() {
  const canvas = $("canvas");
  const width = canvas ? Math.max(320, Math.round(canvas.getBoundingClientRect().width) - 32) : 640;
  let cursor = 16;
  getCurrentComponents().forEach((comp) => {
    const h = measureComponentHeight(comp.id) || (comp.layout && comp.layout.h) || estimatedComponentHeight(comp.type);
    const layout = { x: 16, y: cursor, w: width, h };
    comp.layout = layout;
    sendUpdateComponent(comp.id, {}, layout);
    cursor += h + 16;
  });
}

function setupCanvasMode() {
  // 布局合一 (P1): 不再有流式/自由二元切换。两个入口都做"自动排列"，
  // 组件按真实高度纵向排布，且每个组件始终可自由拖动/缩放。
  const autoLayoutAll = () => {
    autoLayout();
    renderCanvas();
    renderInspector();
    applyCanvasMode($("canvas"));
  };
  const modeBtn = $("layout-mode-btn");
  if (modeBtn) {
    modeBtn.title = "自动纵向排列组件（真实高度、不重叠）";
    modeBtn.addEventListener("click", autoLayoutAll);
  }
  const autoBtn = $("auto-layout-btn");
  if (autoBtn) autoBtn.addEventListener("click", autoLayoutAll);
  applyCanvasMode($("canvas"));
}

