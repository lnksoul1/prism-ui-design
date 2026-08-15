// /* === SPLIT-MODULE === */
/**
 * Prism Dashboard — play mode, more menu, LLM settings, template picker and init.
 *
 * Part of the split client application. All parts are global-scope scripts;
 * they must be loaded in the order declared in index.html.
 *
 * 第一步 (画布调整): tldraw 已移除，预览画布是唯一编辑面；绘制工具见
 * app-canvas.js 的 setupCanvasDrawing（形状直接落为组件，统一坐标系）。
 */

let toastTimer = null;

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
      B("46px", "7%", "86%", "12px", brand, 4),
    ],
    blank: [],
  };
  return map[id] || [];
}

async function applyTemplateForCanvas(templateId) {
  const modal = $("canvas-template-modal");
  if (modal) modal.style.display = "none";

  if (templateId === "blank") return;

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
  } catch (err) {
    console.error("Apply template failed:", err);
    showToastMsg(t("canvasSaveError"), true);
  }
}

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

function init() {
  exposePerf();
  setupI18n();
  setupTabs();
  setupPlatformSwitcher();
  setupUndoRedo();
  setupZoom();
  setupCanvasShortcuts();
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
  setupCanvasDrawing();
  setupApplyBanner();
  setupCommandPalette();
  setupQuickActions();
  setupConflictCheck();
  setupDesignLibrary();
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
