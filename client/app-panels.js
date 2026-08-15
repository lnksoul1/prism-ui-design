// /* === SPLIT-MODULE === */
/**
 * Prism Dashboard — Token panel, activity log, theme, pages, export, screenshot, explain, prompt bar, conflicts, contrast and health fallback.
 *
 * Part of the split client application. All parts are global-scope scripts;
 * they must be loaded in the order declared in index.html.
 */

// ===== Token Panel =====

function renderTokenPanel() {
  const list = $("token-list");

  if (!currentState || !currentState.tokens) {
    list.innerHTML = `<div class="token-empty">${t("tokenEmpty")}</div>`;
    return;
  }

  const tokens = currentState.tokens[activeTokenTab] || {};
  let keys = Object.keys(tokens);
  if (tokenSearchQuery) {
    keys = keys.filter((key) => {
      const token = tokens[key];
      return (
        key.toLowerCase().includes(tokenSearchQuery) ||
        String(token.value).toLowerCase().includes(tokenSearchQuery)
      );
    });
  }

  if (keys.length === 0) {
    list.innerHTML = `<div class="token-empty">${t("tokenEmptyCategory")}</div>`;
    return;
  }

  list.innerHTML = "";

  keys.forEach((key) => {
    const token = tokens[key];
    const item = el("div", "token-item");

    const row = el("div", "token-row");

    // Color swatch for color tokens
    if (activeTokenTab === "colors" && isColorValue(token.value)) {
      const swatch = el("div", "token-color-swatch");
      swatch.style.background = token.value;
      swatch.title = "点击选择颜色";
      swatch.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "color";
        input.value = normalizeColorForPicker(token.value);
        input.style.position = "absolute";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.click();
        input.addEventListener("change", () => {
          sendTokenUpdate(activeTokenTab, key, input.value);
          document.body.removeChild(input);
        });
      });
      row.appendChild(swatch);
    }

    const label = el("span", "token-label", key);
    row.appendChild(label);

    const source = el("span", `token-source ${token.source || "preset"}`, token.source || "preset");
    row.appendChild(source);

    item.appendChild(row);

    // Value input
    const input = el("input", "token-value-input");
    input.value = token.value;
    input.dataset.category = activeTokenTab;
    input.dataset.key = key;

    // Debounced send on change
    let debounceTimer = null;
    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        sendTokenUpdate(activeTokenTab, key, input.value);
      }, 500);
    });

    input.addEventListener("blur", () => {
      clearTimeout(debounceTimer);
      sendTokenUpdate(activeTokenTab, key, input.value);
    });

    item.appendChild(input);

    // Slider for numeric values
    if (isNumericToken(key, token.value)) {
      const slider = el("input", "token-slider");
      slider.type = "range";
      const { min, max, val } = getSliderRange(key, token.value);
      slider.min = min;
      slider.max = max;
      slider.value = val;

      let sliderDebounce = null;
      slider.addEventListener("input", () => {
        input.value = slider.value + (token.value.includes("rem") ? "rem" : "px");
        clearTimeout(sliderDebounce);
        sliderDebounce = setTimeout(() => {
          sendTokenUpdate(activeTokenTab, key, input.value);
        }, 200);
      });

      item.appendChild(slider);
    }

    list.appendChild(item);
  });
}

function isColorValue(value) {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value) ||
         /^rgb/.test(value) ||
         /^hsl/.test(value);
}

function normalizeColorForPicker(value) {
  // Convert to #RRGGBB for the color input
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value;
  if (/^#[0-9A-Fa-f]{3}$/.test(value)) {
    return "#" + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
  }
  // Try to parse rgb/hsl via a temporary element
  const temp = document.createElement("div");
  temp.style.color = value;
  document.body.appendChild(temp);
  const computed = getComputedStyle(temp).color;
  document.body.removeChild(temp);
  const match = computed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, "0");
    const g = parseInt(match[2]).toString(16).padStart(2, "0");
    const b = parseInt(match[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return "#000000";
}

function isNumericToken(key, value) {
  if (key.startsWith("space-") || key.startsWith("radius-") || key.startsWith("text-")) {
    return /\d/.test(value);
  }
  return false;
}

function getSliderRange(key, value) {
  const numMatch = value.match(/([\d.]+)/);
  if (!numMatch) return { min: 0, max: 100, val: 50 };
  const val = parseFloat(numMatch[1]);
  const unit = value.includes("rem") ? "rem" : "px";
  const isPx = unit === "px";

  if (key.startsWith("space-")) {
    return { min: 0, max: isPx ? 128 : 8, val: Math.min(val, isPx ? 128 : 8) };
  }
  if (key.startsWith("radius-")) {
    return { min: 0, max: isPx ? 48 : 3, val: Math.min(val, isPx ? 48 : 3) };
  }
  if (key.startsWith("text-")) {
    return { min: isPx ? 10 : 0.5, max: isPx ? 64 : 4, val: Math.min(val, isPx ? 64 : 4) };
  }
  return { min: 0, max: 100, val };
}

// ===== Activity Log =====

function renderActivityLog() {
  const list = $("activity-list");

  if (!currentState || !currentState.activityLog || currentState.activityLog.length === 0) {
    list.innerHTML = `<div class="activity-empty">${t("activityEmpty")}</div>`;
    return;
  }

  list.innerHTML = "";
  let entries = currentState.activityLog;
  if (activitySourceFilter) {
    entries = entries.filter((e) => e.source === activitySourceFilter);
  }
  if (activitySearchQuery) {
    entries = entries.filter((e) =>
      String(e.detail || "").toLowerCase().includes(activitySearchQuery) ||
      String(e.action || "").toLowerCase().includes(activitySearchQuery)
    );
  }
  if (entries.length === 0) {
    list.innerHTML = `<div class="activity-empty">—</div>`;
    return;
  }
  entries.forEach((entry) => {
    addActivityEntry(entry, list);
  });
}

function addActivityEntry(entry, container) {
  const list = container || $("activity-list");

  // Remove empty state
  const empty = list.querySelector(".activity-empty");
  if (empty) empty.remove();

  const div = el("div", `activity-entry ${entry.source}`);

  const header = el("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:start;";

  const left = el("div");
  left.appendChild(el("span", "act-source", entry.source === "ai" ? t("ai") : t("user")));
  left.appendChild(el("span", "act-detail", entry.detail));
  header.appendChild(left);

  const time = el("span", "act-time", formatTime(entry.timestamp));
  header.appendChild(time);

  div.appendChild(header);
  list.insertBefore(div, list.firstChild);

  // Keep max 100 entries
  while (list.children.length > 100) {
    list.removeChild(list.lastChild);
  }
}

function formatTime(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

// ===== Apply Tokens to Canvas =====

function applyTokensToCanvas() {
  if (!currentState || !currentState.tokens) return;

  const root = document.documentElement;

  // Apply all token categories as CSS variables
  const categories = ["colors", "typography", "spacing", "shadows", "radii", "transitions"];
  categories.forEach((cat) => {
    const tokens = currentState.tokens[cat] || {};
    Object.entries(tokens).forEach(([key, token]) => {
      root.style.setProperty(`--${key}`, token.value);
    });
  });

  // Apply primary color to accent
  const primary = currentState.tokens.colors?.["color-primary"];
  if (primary) {
    root.style.setProperty("--accent", primary.value);
  }
  const primaryLight = currentState.tokens.colors?.["color-primary-light"];
  if (primaryLight) {
    root.style.setProperty("--accent-light", primaryLight.value);
  }
  const bg = currentState.tokens.colors?.["color-bg"];
  if (bg) {
    root.style.setProperty("--bg", bg.value);
  }
  const surface = currentState.tokens.colors?.["color-surface"];
  if (surface) {
    root.style.setProperty("--surface", surface.value);
  }
  const text = currentState.tokens.colors?.["color-text"];
  if (text) {
    root.style.setProperty("--text", text.value);
  }
  const textMuted = currentState.tokens.colors?.["color-text-muted"];
  if (textMuted) {
    root.style.setProperty("--text-muted", textMuted.value);
  }
  const border = currentState.tokens.colors?.["color-border"];
  if (border) {
    root.style.setProperty("--border", border.value);
  }

  // Re-render canvas to pick up new token values
  // Only if there are components
  if (currentState.components && currentState.components.length > 0) {
    // Apply font families — use BODY font for --font, DISPLAY font for --font-display
    // Always include CJK fallback fonts so Chinese characters render correctly
    const cjkFallback = "'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'WenQuanYi Micro Hei', sans-serif";
    const fontDisplay = currentState.tokens.typography?.["font-display"];
    if (fontDisplay) {
      root.style.setProperty("--font-display", fontDisplay.value + ", " + cjkFallback);
    }
    const fontBody = currentState.tokens.typography?.["font-body"];
    if (fontBody) {
      root.style.setProperty("--font", fontBody.value + ", " + cjkFallback);
    }
  }
}

// ===== User Actions =====

function sendTokenUpdate(category, key, value) {
  send({
    type: "set_token",
    category,
    key,
    value,
  });
}

function handleDeleteComponent(id) {
  send({
    type: "remove_component",
    id,
  });
}

// ===== Tab Switching =====

function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTokenTab = tab.dataset.tab;
      renderTokenPanel();
    });
  });
}

// ===== Platform Switcher =====

function setupPlatformSwitcher() {
  const select = $("platform-select");
  if (!select) return;
  select.value = currentPlatform;
  select.addEventListener("change", () => {
    currentPlatform = select.value;
    const canvas = $("canvas");
    applyPlatform(canvas);
    send({ type: "set_platform", platform: currentPlatform });
  });
}

// ===== Undo / Redo =====

function setupUndoRedo() {
  const undoBtn = $("undo-btn");
  const redoBtn = $("redo-btn");

  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      send({ type: "undo" });
    });
  }
  if (redoBtn) {
    redoBtn.addEventListener("click", () => {
      send({ type: "redo" });
    });
  }

  // Global keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;
    if (ctrlKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        send({ type: "redo" });
      } else {
        send({ type: "undo" });
      }
    }
    // Also support Ctrl+Y for redo
    if (ctrlKey && e.key.toLowerCase() === "y") {
      e.preventDefault();
      send({ type: "redo" });
    }
  });
}

function updateUndoRedoButtons() {
  const undoBtn = $("undo-btn");
  const redoBtn = $("redo-btn");
  if (!currentState) return;
  // Use canUndo/canRedo if provided by server, otherwise default to enabled
  const canUndo = currentState.canUndo !== undefined ? currentState.canUndo : true;
  const canRedo = currentState.canRedo !== undefined ? currentState.canRedo : true;
  if (undoBtn) undoBtn.disabled = !canUndo;
  if (redoBtn) redoBtn.disabled = !canRedo;
}

// ===== Theme Toggle =====

function setupThemeToggle() {
  const toggle = $("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const newMode = (currentState && currentState.themeMode === "dark") ? "light" : "dark";
      send({ type: "set_theme", mode: newMode });
    });
  }
}

function applyTheme() {
  if (!currentState) return;
  const mode = currentState.themeMode || "light";
  const toggle = $("theme-toggle");
  if (mode === "dark") {
    document.body.classList.add("theme-dark");
    if (toggle) toggle.textContent = "主题";
  } else {
    document.body.classList.remove("theme-dark");
    if (toggle) toggle.textContent = "主题";
  }
}

// ===== Page Switcher =====

function renderPageSwitcher() {
  const container = $("page-tabs");
  if (!container) return;

  if (!currentState || !currentState.pages || currentState.pages.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = "";
  const currentId = currentState.currentPageId;
  // Notion 风：侧栏页面用 emoji 做轻量图标
  const PAGE_EMOJIS = ["📄", "🗂️", "📋", "📊", "🧭", "🔖", "📌", "🖼️"];

  currentState.pages.forEach((page, idx) => {
    const tab = el("div", "page-tab" + (page.id === currentId ? " active" : ""));
    tab.dataset.pageId = page.id;

    const icon = el("span", "page-icon", PAGE_EMOJIS[idx % PAGE_EMOJIS.length]);
    tab.appendChild(icon);

    const name = el("span", "page-name", page.name || "未命名");
    tab.appendChild(name);

    const delBtn = el("button", "page-del", "✕");
    delBtn.title = "删除页面";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Don't allow deleting if only one page left
      if (currentState.pages.length <= 1) return;
      send({ type: "remove_page", pageId: page.id });
    });
    // Disable delete if only one page
    if (currentState.pages.length <= 1) {
      delBtn.style.opacity = "0.3";
      delBtn.style.cursor = "not-allowed";
    }
    tab.appendChild(delBtn);

    // Click to switch page
    tab.addEventListener("click", () => {
      if (page.id !== currentState.currentPageId) {
        send({ type: "switch_page", pageId: page.id });
      }
    });

    // Double-click to rename
    name.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startPageRename(name, page.id);
    });

    container.appendChild(tab);
  });
}

function startPageRename(nameEl, pageId) {
  nameEl.contentEditable = "true";
  nameEl.focus();
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const commit = () => {
    nameEl.contentEditable = "false";
    const newName = nameEl.textContent.trim();
    if (newName) {
      send({ type: "rename_page", pageId: pageId, name: newName });
    } else {
      // Restore name
      const page = currentState.pages.find((p) => p.id === pageId);
      nameEl.textContent = page ? page.name : "未命名";
    }
  };

  nameEl.addEventListener("blur", commit, { once: true });
  nameEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nameEl.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      const page = currentState.pages.find((p) => p.id === pageId);
      nameEl.textContent = page ? page.name : "未命名";
      nameEl.blur();
    }
  });
}

function setupPageSwitcher() {
  const addBtn = $("page-add-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const name = "页面 " + (currentState && currentState.pages ? currentState.pages.length + 1 : 1);
      send({ type: "add_page", name: name });
    });
  }
}

// ===== Export Modal =====

function setupExportModal() {
  const exportBtn = $("export-btn");
  const modal = $("export-modal");
  const closeBtn = $("export-close");
  const copyBtn = $("export-copy");
  const openBtn = $("export-open");
  const tabs = document.querySelectorAll(".export-tab");

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      modal.style.display = "flex";
      fetchExportCode(currentExportFormat);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  // Close on overlay click
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentExportFormat = tab.dataset.format;
      fetchExportCode(currentExportFormat);
    });
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const code = $("export-code").textContent;
      copyToClipboard(code);
      copyBtn.textContent = "已复制!";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.textContent = "复制代码";
        copyBtn.classList.remove("copied");
      }, 2000);
    });
  }

  // Open the exported HTML as a standalone page in a new tab — the fastest
  // way for non-coders to see, save, or share what they built.
  if (openBtn) {
    openBtn.addEventListener("click", async () => {
      try {
        const response = await fetch("/api/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: "html" }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        const blob = new Blob([String(data.code || "")], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, "_blank");
        if (!win) {
          alert(t("previewOpened") + " (弹窗被拦截)");
        } else {
          showToastMsg(t("previewOpened"));
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) {
        console.error("Open preview failed:", err);
        showToastMsg(t("explainFailed") + ": " + err.message, true);
      }
    });
  }

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display === "flex") {
      modal.style.display = "none";
    }
  });
}

async function fetchExportCode(format) {
  const codeEl = $("export-code");
  if (!codeEl) return;
  codeEl.textContent = "正在生成代码...";
  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: format }),
    });
    if (response.ok) {
      const data = await response.json();
      codeEl.textContent = data.code || data.output || JSON.stringify(data, null, 2);
    } else {
      codeEl.textContent = "导出失败: " + response.status;
    }
  } catch (err) {
    codeEl.textContent = "导出失败: " + err.message;
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    // Fallback
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand("copy"); } catch (err) {}
    document.body.removeChild(textarea);
  }
}

// ===== Screenshot =====

function setupScreenshot() {
  const btn = $("screenshot-btn");
  if (!btn) return;
  btn.addEventListener("click", takeScreenshot);
}

async function takeScreenshot() {
  const canvas = $("canvas");
  if (!canvas) return;

  // Real PNG via the server render pipeline (Playwright); fall back to HTML.
  try {
    const response = await fetch("/api/render?format=png&viewport=desktop");
    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "prism-preview.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return;
    }
  } catch (err) {
    console.warn("PNG screenshot failed, falling back to HTML preview:", err);
  }
  openHtmlScreenshot();
}

function openHtmlScreenshot() {
  const canvas = $("canvas");
  if (!canvas) return;

  // Simplified approach: open a new window with canvas HTML + inline styles
  const canvasHTML = canvas.innerHTML;
  const computedStyle = window.getComputedStyle(document.documentElement);
  const cssVars = [];
  const varProps = ["--bg", "--surface", "--surface-hover", "--border", "--text", "--text-muted", "--text-dim", "--accent", "--accent-light", "--accent-bg", "--success", "--warning", "--danger", "--radius", "--font", "--mono"];
  varProps.forEach((v) => {
    const val = computedStyle.getPropertyValue(v).trim();
    if (val) cssVars.push(`${v}: ${val};`);
  });

  const win = window.open("", "_blank");
  if (!win) {
    alert("无法打开新窗口，请允许弹出窗口后重试");
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Prism 截图预览</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root { ${cssVars.join(" ")} }
body { font-family: var(--font); background: var(--bg); color: var(--text); padding: 24px; }
.toolbar { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 999; }
.toolbar button { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; font-size: 13px; }
.toolbar button:hover { border-color: var(--accent); }
.screenshot-container { max-width: 100%; }
.comp-wrapper { position: relative; margin-bottom: 16px; }
.comp-overlay { display: none; }
${getCanvasInlineStyles()}
</style>
</head>
<body>
<div class="toolbar">
  <button onclick="window.print()">打印 / 保存为 PDF</button>
  <button onclick="downloadHTML()">下载 HTML</button>
</div>
<div class="screenshot-container">
${canvasHTML}
</div>
<script>
function downloadHTML() {
  const html = document.documentElement.outerHTML;
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'prism-screenshot.html';
  a.click();
}
<\/script>
</body>
</html>`);
  win.document.close();
}

function getCanvasInlineStyles() {
  // Collect inline styles from style.css that affect canvas components
  const styles = document.querySelectorAll("style");
  let css = "";
  // Try to extract component styles from the loaded stylesheet
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.cssText && (
          rule.cssText.includes(".comp-") ||
          rule.cssText.includes(".btn") ||
          rule.cssText.includes(".card-") ||
          rule.cssText.includes(".nav-") ||
          rule.cssText.includes(".feature-") ||
          rule.cssText.includes("[data-editable") ||
          rule.cssText.includes(".tabs") ||
          rule.cssText.includes(".acc-") ||
          rule.cssText.includes(".carousel-") ||
          rule.cssText.includes(".modal-") ||
          rule.cssText.includes(".sidebar-") ||
          rule.cssText.includes(".crumb") ||
          rule.cssText.includes(".page-btn") ||
          rule.cssText.includes(".progress-") ||
          rule.cssText.includes(".comp-badge") ||
          rule.cssText.includes(".comp-avatar")
        )) {
          css += rule.cssText + "\n";
        }
      }
    } catch (e) {
      // Cross-origin stylesheet, skip
    }
  }
  return css;
}

// ===== Explain Design (plain-language, for non-professionals) =====

function setupExplain() {
  const btn = $("explain-btn");
  const modal = $("explain-modal");
  const closeBtn = $("explain-close");
  if (!btn || !modal) return;

  btn.addEventListener("click", openExplainModal);

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display === "flex") {
      modal.style.display = "none";
    }
  });
}

function openExplainModal() {
  const modal = $("explain-modal");
  const content = $("explain-content");
  if (!modal || !content) return;
  modal.style.display = "flex";
  content.innerHTML = `<p class="explain-loading">${t("explainLoading")}</p>`;
  const lang = uiLang === "en" ? "en" : "zh";
  fetch(`/api/explain?lang=${lang}`)
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((data) => renderExplain(data))
    .catch((err) => {
      console.error("Explain failed:", err);
      content.innerHTML = `<p class="explain-failed">${t("explainFailed")}</p>`;
    });
}

function renderExplain(data) {
  const content = $("explain-content");
  if (!content) return;
  content.innerHTML = "";

  content.appendChild(el("p", "explain-summary", String(data.summary || "")));

  if (Array.isArray(data.facts) && data.facts.length > 0) {
    const facts = el("ul", "explain-facts");
    data.facts.forEach((fact) => facts.appendChild(el("li", "explain-fact", String(fact))));
    content.appendChild(facts);
  }

  if (Array.isArray(data.conflicts) && data.conflicts.length > 0) {
    const box = el("div", "explain-conflicts");
    data.conflicts.forEach((c) => box.appendChild(el("div", "explain-conflict", "⚠ " + String(c))));
    content.appendChild(box);
  }

  if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
    content.appendChild(el("div", "explain-try", t("tryThese")));
    const list = el("div", "explain-suggestions");
    data.suggestions.forEach((s) => {
      const row = el("button", "explain-suggest", String(s.phrase));
      row.type = "button";
      const effect = el("span", "explain-suggest-effect", String(s.effect || ""));
      row.appendChild(effect);
      row.addEventListener("click", () => {
        const modal = $("explain-modal");
        if (modal) modal.style.display = "none";
        sendPrompt(String(s.phrase));
      });
      list.appendChild(row);
    });
    content.appendChild(list);
  }
}

// ===== AI Prompt Bar =====

let promptStatusTimer = null;
let promptSuggestTimer = null;

function setPromptStatus(text, cls) {
  const status = $("prompt-status");
  if (!status) return;
  status.textContent = text;
  status.className = "prompt-status show" + (cls ? " " + cls : "");
  clearTimeout(promptStatusTimer);
  promptStatusTimer = setTimeout(() => {
    status.className = "prompt-status";
  }, cls === "accepted" ? 4000 : 20000);
}

function setupPromptBar() {
  const input = $("prompt-input");
  const sendBtn = $("prompt-send");
  if (!input || !sendBtn) return;

  sendBtn.addEventListener("click", () => sendPrompt());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendPrompt();
    }
  });
  input.addEventListener("input", () => hidePromptSuggestions());
}

/** Show clickable example instructions when the built-in engine cannot act. */
function showPromptSuggestions(suggestions) {
  const container = $("prompt-suggest");
  if (!container || !Array.isArray(suggestions) || suggestions.length === 0) return;
  container.innerHTML = "";
  const label = el("span", "suggest-label", t("promptNotUnderstood"));
  container.appendChild(label);
  suggestions.slice(0, 4).forEach((phrase) => {
    const chip = el("button", "suggest-chip", String(phrase));
    chip.type = "button";
    chip.addEventListener("click", () => {
      hidePromptSuggestions();
      sendPrompt(String(phrase));
    });
    container.appendChild(chip);
  });
  const dismiss = el("button", "suggest-dismiss", "×");
  dismiss.type = "button";
  dismiss.title = t("dismiss") || "关闭";
  dismiss.addEventListener("click", hidePromptSuggestions);
  container.appendChild(dismiss);
  container.style.display = "flex";
  // Auto-hide so the bar never blocks the canvas for long.
  clearTimeout(promptSuggestTimer);
  promptSuggestTimer = setTimeout(hidePromptSuggestions, 45000);
}

function hidePromptSuggestions() {
  const container = $("prompt-suggest");
  if (container) container.style.display = "none";
  clearTimeout(promptSuggestTimer);
}

function applyPromptResult(result) {
  if (!result) return;
  if (result.executed) {
    setPromptStatus(t("promptExecuted", { summary: result.summary || "" }), "accepted");
    showToastMsg(t("promptExecuted", { summary: result.summary || "" }));
  } else if (result.llm === "generating") {
    setPromptStatus(t("llmGenerating"), "queued");
    showToastMsg(t("llmGenerating"));
  } else {
    setPromptStatus(t("promptQueued"), "queued");
    if (Array.isArray(result.suggestions) && result.suggestions.length > 0) {
      showPromptSuggestions(result.suggestions);
    }
  }
}

function sendPrompt(text) {
  const input = $("prompt-input");
  const sendBtn = $("prompt-send");
  const value = (text !== undefined ? String(text) : input ? input.value : "").trim();
  if (!value) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    send({ type: "prompt", prompt: value });
  } else {
    // WebSocket unavailable: fall back to the REST prompt endpoint so the
    // instruction still reaches the agent queue, and surface its result.
    fetch("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: value }),
    })
      .then((response) => response.json())
      .then((data) => applyPromptResult(data))
      .catch((err) => {
        console.error("Prompt fallback failed:", err);
        setPromptStatus(t("promptQueued") + " (WS↓)", "queued");
      });
  }
  setPromptStatus(t("promptQueued"), "queued");
  if (input) input.value = "";
  // Visual feedback
  if (sendBtn) {
    sendBtn.classList.add("sent");
    sendBtn.textContent = t("sent");
    setTimeout(() => {
      sendBtn.classList.remove("sent");
      sendBtn.textContent = t("send");
    }, 1200);
  }
}

// ===== Quick actions: prompt chips, shortcuts help, command palette =====

const QUICK_CHIP_PROMPTS = [
  { key: "chipDark", prompts: { zh: "深色模式", en: "dark mode" } },
  { key: "chipLight", prompts: { zh: "浅色模式", en: "light mode" } },
  { key: "chipSaaS", prompts: { zh: "应用 SaaS 模板", en: "apply the SaaS template" } },
  { key: "chipEcommerce", prompts: { zh: "应用电商模板", en: "apply the e-commerce template" } },
  { key: "chipBigger", prompts: { zh: "字太小了，大一点", en: "make the text bigger" } },
  { key: "chipGlass", prompts: { zh: "换成玻璃拟态风格", en: "switch to the glassmorphism style" } },
  { key: "chipPricing", prompts: { zh: "添加一个定价表", en: "add a pricing table" } },
  { key: "chipUndo", prompts: { zh: "撤销", en: "undo" } },
  { key: "chipClear", prompts: { zh: "清空", en: "clear all" } },
];

function setupPromptChips() {
  const container = $("prompt-chips");
  if (!container) return;
  container.innerHTML = "";
  QUICK_CHIP_PROMPTS.forEach((chip) => {
    const btn = el("button", "prompt-chip", t(chip.key));
    btn.type = "button";
    btn.addEventListener("click", () => sendPrompt(chip.prompts[uiLang] || chip.prompts.zh));
    container.appendChild(btn);
  });
}

function renderHelpShortcuts() {
  const grid = $("help-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const groups = [
    {
      title: t("helpGeneral"),
      items: [
        { keys: ["?"], labelKey: "scHelp" },
        { keys: ["Ctrl", "K"], labelKey: "scPalette" },
        { keys: ["/"], labelKey: "scPrompt" },
        { keys: ["P"], labelKey: "scCanvas" },
      ],
    },
    {
      title: t("helpEdit"),
      items: [
        { keys: ["Ctrl", "Z"], labelKey: "scUndo" },
        { keys: ["Ctrl", "Shift", "Z"], labelKey: "scRedo" },
        { keys: ["Del"], labelKey: "scDelete" },
      ],
    },
  ];
  groups.forEach((group) => {
    const section = el("div", "help-section");
    section.appendChild(el("div", "help-section-title", group.title));
    group.items.forEach((item) => {
      const row = el("div", "help-row");
      const kbdWrap = el("div", "help-keys");
      item.keys.forEach((k, i) => {
        if (i > 0) kbdWrap.appendChild(el("span", "help-key-plus", "+"));
        kbdWrap.appendChild(el("kbd", "help-key", k));
      });
      row.appendChild(kbdWrap);
      row.appendChild(el("span", "help-row-label", t(item.labelKey)));
      section.appendChild(row);
    });
    grid.appendChild(section);
  });
}

function toggleHelp(force) {
  const overlay = $("help-overlay");
  if (!overlay) return false;
  const show = force !== undefined ? force : overlay.style.display !== "flex";
  overlay.style.display = show ? "flex" : "none";
  return show;
}

function buildCommands() {
  const pageCount = currentState && currentState.pages ? currentState.pages.length + 1 : 1;
  return [
    {
      id: "add_page",
      label: t("cmdAddPage"),
      icon: "▤",
      run: () => send({ type: "add_page", name: "页面 " + pageCount }),
    },
    { id: "theme_dark", label: t("cmdThemeDark"), icon: "◑", run: () => send({ type: "set_theme", mode: "dark" }) },
    { id: "theme_light", label: t("cmdThemeLight"), icon: "○", run: () => send({ type: "set_theme", mode: "light" }) },
    { id: "tpl_saas", label: t("cmdTplSaaS"), icon: "▲", run: () => sendPrompt("应用 SaaS 模板") },
    { id: "tpl_ecommerce", label: t("cmdTplEcommerce"), icon: "▣", run: () => sendPrompt("应用电商模板") },
    { id: "clear", label: t("cmdClear"), icon: "✕", run: () => sendPrompt("清空") },
    { id: "project", label: t("cmdProject"), icon: "▤", run: () => { const b = $("project-btn"); if (b) b.click(); } },
    { id: "save", label: t("cmdSaveProject"), icon: "▣", run: saveCurrentProject },
    { id: "export", label: t("cmdExport"), icon: "↑", run: () => { const b = $("export-btn"); if (b) b.click(); } },
    { id: "screenshot", label: t("cmdScreenshot"), icon: "▣", run: takeScreenshot },
    { id: "help", label: t("cmdHelp"), icon: "?", run: () => toggleHelp(true) },
    { id: "undo", label: t("cmdUndo"), icon: "↩", run: () => send({ type: "undo" }) },
    { id: "redo", label: t("cmdRedo"), icon: "↪", run: () => send({ type: "redo" }) },
  ];
}

function saveCurrentProject() {
  const projectBtn = $("project-btn");
  const saveBtn = $("project-save-btn");
  if (projectBtn) projectBtn.click();
  if (saveBtn) saveBtn.click();
}

let commandActiveIndex = -1;
let commandItems = [];

function commandPaletteOpen() {
  const overlay = $("command-overlay");
  return overlay && overlay.style.display === "flex";
}

function closeCommandPalette() {
  const overlay = $("command-overlay");
  const input = $("command-input");
  if (overlay) overlay.style.display = "none";
  if (input) input.blur();
}

function toggleCommandPalette() {
  const overlay = $("command-overlay");
  const input = $("command-input");
  if (!overlay) return;
  const open = overlay.style.display !== "flex";
  overlay.style.display = open ? "flex" : "none";
  if (open) {
    commandActiveIndex = -1;
    if (input) input.value = "";
    renderCommandList("");
    if (input) setTimeout(() => input.focus(), 0);
  } else if (input) {
    input.blur();
  }
}

function runCommandItem(item) {
  closeCommandPalette();
  try {
    item.run();
  } catch (err) {
    console.error("Command failed:", err);
    showToastMsg(err.message || t("cmdNoResults"), true);
  }
}

function renderCommandList(filter) {
  const list = $("command-list");
  if (!list) return;
  const q = (filter || "").trim().toLowerCase();
  let items = buildCommands().filter(
    (c) => !q || c.label.toLowerCase().includes(q) || c.id.includes(q)
  );
  if (q) {
    const raw = filter.trim();
    items = [
      { id: "run_prompt", label: raw, icon: "↑", run: () => sendPrompt(raw) },
      ...items,
    ];
  }
  commandItems = items;
  list.innerHTML = "";
  if (items.length === 0) {
    list.appendChild(el("div", "command-empty", t("cmdNoResults")));
    return;
  }
  items.forEach((item, i) => {
    const row = el("button", "command-row" + (i === commandActiveIndex ? " active" : ""));
    row.type = "button";
    row.appendChild(el("span", "command-row-icon", item.icon || ""));
    row.appendChild(el("span", "command-row-label", item.label));
    row.addEventListener("click", () => runCommandItem(item));
    row.addEventListener("mousemove", () => {
      commandActiveIndex = i;
      updateCommandActive();
    });
    list.appendChild(row);
  });
}

function moveCommandActive(delta) {
  if (commandItems.length === 0) return;
  commandActiveIndex = (commandActiveIndex + delta + commandItems.length) % commandItems.length;
  updateCommandActive();
}

function updateCommandActive() {
  const list = $("command-list");
  if (!list) return;
  Array.from(list.children).forEach((row, i) => {
    row.classList.toggle("active", i === commandActiveIndex);
  });
  const active = list.children[commandActiveIndex];
  if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
}

function setupCommandPalette() {
  const overlay = $("command-overlay");
  const input = $("command-input");
  if (!overlay || !input) return;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeCommandPalette();
  });
  input.addEventListener("input", () => {
    commandActiveIndex = -1;
    renderCommandList(input.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveCommandActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveCommandActive(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = commandItems[commandActiveIndex] || commandItems[0];
      if (item) runCommandItem(item);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      closeCommandPalette();
    }
  });
}

function setupQuickActions() {
  setupPromptChips();
  renderHelpShortcuts();
  const helpOverlay = $("help-overlay");
  const helpClose = $("help-close");
  if (helpClose) helpClose.addEventListener("click", () => toggleHelp(false));
  if (helpOverlay) {
    helpOverlay.addEventListener("click", (e) => {
      if (e.target === helpOverlay) toggleHelp(false);
    });
  }

  document.addEventListener("keydown", (e) => {
    const tag = e.target && e.target.tagName;
    const typing =
      tag === "INPUT" ||
      tag === "SELECT" ||
      tag === "TEXTAREA" ||
      (e.target && e.target.contentEditable === "true");
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

    if (ctrlKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      toggleCommandPalette();
      return;
    }
    if (e.key === "Escape") {
      if (commandPaletteOpen()) {
        closeCommandPalette();
        return;
      }
      if (helpOverlay && helpOverlay.style.display === "flex") {
        toggleHelp(false);
        return;
      }
      return;
    }
    if (typing) return;
    if (e.key === "?") {
      e.preventDefault();
      toggleHelp();
      return;
    }
    if (e.key === "/") {
      e.preventDefault();
      toggleCommandPalette();
      return;
    }
  });
}

// ===== Conflict Warnings =====

function setupConflictCheck() {
  // Check conflicts periodically (every 30s) and after token changes
  if (conflictCheckInterval) clearInterval(conflictCheckInterval);
  conflictCheckInterval = setInterval(checkConflicts, 30000);
}

async function checkConflicts() {
  const container = $("conflict-warnings");
  if (!container) return;

  try {
    const response = await fetch("/api/conflicts");
    if (!response.ok) {
      container.innerHTML = "";
      return;
    }
    const data = await response.json();
    const conflicts = data.conflicts || data || [];
    renderConflictWarnings(container, Array.isArray(conflicts) ? conflicts : []);
  } catch (err) {
    // Silently clear if endpoint not available
    container.innerHTML = "";
  }
}

function renderConflictWarnings(container, conflicts) {
  container.innerHTML = "";
  if (conflicts.length === 0) {
    // Premium pass state (spec §5.3): green card with the real WCAG ratio
    const hasTokens =
      currentState && currentState.tokens && Object.keys(currentState.tokens.colors || {}).length > 0;
    if (hasTokens) {
      const textColor = currentState.tokens.colors["color-text"]?.value;
      const bgColor = currentState.tokens.colors["color-bg"]?.value;
      let ratio = null;
      if (textColor && bgColor) {
        ratio = wcagContrastRatio(textColor, bgColor);
      }
      const card = el("div", "conflict-pass");
      card.appendChild(el("span", null, "✓ " + t("contrastPass")));
      if (ratio !== null) {
        card.appendChild(el("span", "cp-ratio", `WCAG AA ${ratio.toFixed(1)}:1`));
      }
      container.appendChild(card);
    }
    return;
  }

  conflicts.forEach((conflict) => {
    const warning = el("div", "conflict-warning");
    const icon = el("span", "warn-icon", "!");
    const text = el("span", "warn-text", conflict.message || conflict.description || `令牌冲突: ${conflict.key || conflict.token || ""}`);
    warning.appendChild(icon);
    warning.appendChild(text);

    // Click to jump to the token
    if (conflict.key || conflict.token || conflict.category) {
      warning.addEventListener("click", () => {
        const category = conflict.category || "colors";
        // Switch to the relevant token tab
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${category}"]`);
        if (tabBtn) tabBtn.click();
      });
      warning.title = "点击查看相关令牌";
    }

    container.appendChild(warning);
  });
}

// ===== WCAG contrast (client-side) =====

function parseHex(hex) {
  let value = String(hex).trim();
  if (value.startsWith("#")) value = value.slice(1);
  if (value.length === 3) {
    value = value.split("").map((c) => c + c).join("");
  }
  const int = parseInt(value, 16);
  if (Number.isNaN(int)) return null;
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
}

function wcagContrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// ===== Health Check Fallback =====

async function fetchInitialState() {
  try {
    const response = await fetch("/api/state");
    if (response.ok) {
      currentState = await response.json();
      renderAll();
    }
  } catch {
    // Will rely on WebSocket
  }
}

