/**
 * Prism Studio v2 — Interactive Prototype
 *
 * Core features:
 * 1. Direct manipulation: click-select, drag-move, 8-point resize, inline edit
 * 2. Multi-platform design: Web + Desktop App + Mobile App
 * 3. Property inspector with live sliders
 * 4. Layer panel with tree view
 */

// ===== DOM Helpers =====
function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ===== Toast =====
let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ===== Init =====
function init() {
  renderPlatformSwitcher();
  renderLayerPanel();
  renderLibrary();
  renderCanvas();
  renderInspector();
  setupGlobalListeners();
  setupPromptBar();
  updateMeta();
}

// ===== Platform Switcher =====
function renderPlatformSwitcher() {
  const container = $("platform-switcher");
  container.innerHTML = "";

  // Group: Web
  const webGroup = el("div", "platform-group");
  webGroup.appendChild(makePlatformBtn("web-desktop", "Web 桌面"));
  webGroup.appendChild(makePlatformBtn("web-tablet", "平板"));
  webGroup.appendChild(makePlatformBtn("web-mobile", "手机"));
  container.appendChild(webGroup);

  // Group: Desktop App
  const desktopGroup = el("div", "platform-group");
  desktopGroup.appendChild(makePlatformBtn("desktop-macos", "macOS"));
  desktopGroup.appendChild(makePlatformBtn("desktop-win", "Windows"));
  container.appendChild(desktopGroup);

  // Group: Mobile App
  const mobileGroup = el("div", "platform-group");
  mobileGroup.appendChild(makePlatformBtn("mobile-ios", "iOS"));
  mobileGroup.appendChild(makePlatformBtn("mobile-android", "Android"));
  container.appendChild(mobileGroup);
}

function makePlatformBtn(platformId, label) {
  const btn = el("button", "platform-btn");
  if (platformId === appState.platform) btn.classList.add("active");
  btn.dataset.platform = platformId;
  btn.textContent = label;
  btn.addEventListener("click", () => switchPlatform(platformId));
  return btn;
}

function switchPlatform(platformId) {
  if (platformId === appState.platform) return;
  appState.platform = platformId;
  appState.selectedId = null;

  // Update active button
  document.querySelectorAll(".platform-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.platform === platformId);
  });

  renderCanvas();
  renderLayerPanel();
  renderInspector();
  updateMeta();
  const pf = PLATFORMS[platformId];
  toast(`已切换至 ${pf.name} 设计模式`);
}

// ===== Canvas Rendering =====
function renderCanvas() {
  const scrollWrap = $("canvas-scroll-wrap");
  const pf = PLATFORMS[appState.platform];
  const components = getCurrentDesign();

  // Build frame
  scrollWrap.innerHTML = "";
  // Put platform class on scrollWrap so CSS descendant selectors work
  scrollWrap.className = "canvas-scroll-wrap pf-" + appState.platform;

  const frame = el("div", "canvas-frame");

  // Apply width if set
  if (pf.width > 0) {
    frame.style.width = pf.width + "px";
  } else {
    frame.style.width = "100%";
    frame.style.maxWidth = "1200px";
  }

  // Build platform chrome
  frame.appendChild(buildPlatformChrome(pf));

  // Build canvas
  const canvas = el("div", "canvas");
  if (pf.canvasHeight) canvas.style.minHeight = pf.canvasHeight + "px";

  if (components.length === 0) {
    canvas.classList.add("placeholder");
    canvas.innerHTML = `
      <div class="canvas-placeholder-inner">
        <div class="ph-icon">◈</div>
        <p>空白画布</p>
        <p class="ph-hint">从左侧组件库拖拽组件到此处</p>
      </div>`;
  } else {
    components.forEach(comp => {
      canvas.appendChild(renderComponent(comp));
    });
  }

  frame.appendChild(canvas);
  scrollWrap.appendChild(frame);

  // Apply zoom
  scrollWrap.style.zoom = appState.zoom / 100;
}

function buildPlatformChrome(pf) {
  if (pf.frame === "browser") {
    const chrome = el("div", "browser-chrome");
    const dots = el("div", "browser-dots");
    dots.appendChild(el("span", "dot-r"));
    dots.appendChild(el("span", "dot-y"));
    dots.appendChild(el("span", "dot-g"));
    chrome.appendChild(dots);
    const url = el("div", "browser-url");
    url.textContent = "https://prism.studio/preview";
    chrome.appendChild(url);
    return chrome;
  }
  if (pf.frame === "macos") {
    const chrome = el("div", "window-chrome");
    const dots = el("div", "browser-dots");
    dots.appendChild(el("span", "dot-r"));
    dots.appendChild(el("span", "dot-y"));
    dots.appendChild(el("span", "dot-g"));
    chrome.appendChild(dots);
    const title = el("div", "window-title");
    title.textContent = "Prism Studio";
    chrome.appendChild(title);
    return chrome;
  }
  if (pf.frame === "windows") {
    const chrome = el("div", "window-chrome");
    const title = el("div", "window-title");
    title.textContent = "Prism Studio";
    chrome.appendChild(title);
    const controls = el("div", "win-controls");
    controls.innerHTML = "<span>—</span><span>☐</span><span class='win-close'>✕</span>";
    chrome.appendChild(controls);
    return chrome;
  }
  if (pf.frame === "ios") {
    const bar = el("div", "ios-status-bar");
    bar.innerHTML = "<span>9:41</span><span>● ●● ●</span>";
    return bar;
  }
  if (pf.frame === "android") {
    const bar = el("div", "android-status-bar");
    bar.innerHTML = "<span>9:41</span><span>📶 100%</span>";
    return bar;
  }
  return el("div");
}

// ===== Component Rendering =====
function renderComponent(comp) {
  const wrapper = el("div", "comp-wrapper");
  wrapper.dataset.id = comp.id;
  wrapper.dataset.label = comp.label || comp.type;

  // Apply explicit dimensions if set
  if (comp.w && comp.w > 0) {
    wrapper.style.width = comp.w + "px";
    if (comp.type === "sidebar") wrapper.style.height = "100%";
  }
  if (comp.h && comp.h > 0) {
    wrapper.style.minHeight = comp.h + "px";
  }
  if (comp.x) wrapper.style.marginLeft = comp.x + "px";

  // Content
  const content = renderComponentContent(comp);
  if (content) wrapper.appendChild(content);

  // Selection state
  if (comp.id === appState.selectedId) {
    wrapper.classList.add("selected");
    addResizeHandles(wrapper, comp);
  }

  // Click to select
  wrapper.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("resize-handle")) return;
    if (e.target.getAttribute("data-editable") === "true") return;
    e.stopPropagation();
    selectComponent(comp.id);
  });

  // Inline editing for data-editable elements
  setupInlineEditing(wrapper, comp);

  return wrapper;
}

function renderComponentContent(comp) {
  const p = comp.props || {};
  switch (comp.type) {
    case "navbar":
      return buildNavbar(p);
    case "hero":
      return buildHero(p);
    case "features":
      return buildFeatures(p);
    case "cta":
      return buildCTA(p);
    case "footer":
      return buildFooter(p);
    case "sidebar":
      return buildSidebar(p);
    case "toolbar-app":
      return buildToolbarApp(p);
    case "data-table":
      return buildDataTable(p);
    default:
      return el("div", "comp-content", `[${comp.type}]`);
  }
}

function buildNavbar(p) {
  const c = el("div", "comp-content r-navbar");
  c.style.background = p.bg || "#fff";
  c.appendChild(makeEditable("span", "r-brand", p.brand || "Logo", "brand"));
  const links = el("div", "r-links");
  (p.links || []).forEach(l => links.appendChild(el("span", null, l)));
  c.appendChild(links);
  if (p.cta) {
    const cta = el("span", "r-cta", p.cta);
    c.appendChild(cta);
  }
  return c;
}

function buildHero(p) {
  const c = el("div", "comp-content r-hero");
  c.style.background = p.bg || "linear-gradient(135deg, #f5f3ff, #ede9fe)";
  c.appendChild(makeEditable("h1", null, p.title || "标题", "title"));
  c.appendChild(makeEditable("p", null, p.subtitle || "副标题", "subtitle"));
  if (p.button) {
    c.appendChild(makeEditable("span", "r-btn", p.button, "button"));
  }
  return c;
}

function buildFeatures(p) {
  const c = el("div", "comp-content r-features");
  c.style.background = p.bg || "#fff";
  if (p.title) {
    c.appendChild(makeEditable("h2", null, p.title, "title"));
  }
  const grid = el("div", "r-grid");
  if (appState.platform === "web-mobile" || appState.platform === "mobile-ios" || appState.platform === "mobile-android") {
    grid.style.gridTemplateColumns = "1fr";
  } else if (appState.platform === "web-tablet") {
    grid.style.gridTemplateColumns = "repeat(2, 1fr)";
  }
  (p.items || []).forEach(item => {
    const card = el("div", "r-card");
    card.appendChild(el("div", "r-card-icon", item.icon || "◆"));
    card.appendChild(el("h3", null, item.title || ""));
    card.appendChild(el("p", null, item.desc || ""));
    grid.appendChild(card);
  });
  c.appendChild(grid);
  return c;
}

function buildCTA(p) {
  const c = el("div", "comp-content r-cta-section");
  c.style.background = p.bg || "linear-gradient(135deg, #6d28d9, #3b82f6)";
  c.appendChild(makeEditable("h2", null, p.title || "准备好了吗？", "title"));
  c.appendChild(makeEditable("span", "r-btn", p.button || "开始", "button"));
  return c;
}

function buildFooter(p) {
  const c = el("div", "comp-content r-footer");
  c.style.background = p.bg || "#1a1a2e";
  const links = el("div", "r-links");
  (p.links || []).forEach(l => links.appendChild(el("span", null, l)));
  c.appendChild(links);
  c.appendChild(makeEditable("span", null, p.copyright || "© 2026", "copyright"));
  return c;
}

function buildSidebar(p) {
  const c = el("div", "comp-content r-sidebar");
  c.style.background = p.bg || "#f5f5f7";
  c.style.width = "100%";
  (p.items || []).forEach((item, i) => {
    const itemEl = el("div", "r-side-item");
    if (i === (p.active || 0)) itemEl.classList.add("active");
    itemEl.appendChild(el("span", "r-side-icon", item.icon || "◆"));
    itemEl.appendChild(el("span", null, item.name || ""));
    c.appendChild(itemEl);
  });
  return c;
}

function buildToolbarApp(p) {
  const c = el("div", "comp-content r-toolbar-app");
  c.style.background = p.bg || "#fff";
  (p.buttons || []).forEach(btn => {
    const b = el("span", "r-tb-btn", btn);
    if (btn === p.primary) b.classList.add("primary");
    c.appendChild(b);
  });
  return c;
}

function buildDataTable(p) {
  const c = el("div", "comp-content");
  c.style.background = p.bg || "#fff";
  c.style.overflow = "auto";
  const table = el("table", "r-data-table");
  const thead = el("thead");
  const headRow = el("tr");
  (p.columns || []).forEach(col => headRow.appendChild(el("th", null, col)));
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = el("tbody");
  (p.rows || []).forEach(row => {
    const tr = el("tr");
    row.forEach(cell => tr.appendChild(el("td", null, cell)));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  c.appendChild(table);
  return c;
}

function makeEditable(tag, cls, text, prop) {
  const e = el(tag, cls, text);
  e.setAttribute("data-editable", "true");
  e.setAttribute("data-prop", prop);
  return e;
}

// ===== Inline Editing =====
function setupInlineEditing(wrapper, comp) {
  const editables = wrapper.querySelectorAll("[data-editable='true']");
  editables.forEach(elm => {
    if (elm.closest(".comp-wrapper") !== wrapper) return;

    elm.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      elm.contentEditable = "true";
      elm.focus();
      const range = document.createRange();
      range.selectNodeContents(elm);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    const commit = () => {
      elm.contentEditable = "false";
      const newValue = elm.textContent.trim();
      const prop = elm.getAttribute("data-prop");
      if (prop && comp.props[prop] !== newValue) {
        comp.props[prop] = newValue;
        renderLayerPanel();
        toast(`已更新 ${prop}: ${newValue}`);
      }
    };

    elm.addEventListener("blur", commit);
    elm.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); elm.blur(); }
      else if (e.key === "Escape") { e.preventDefault(); elm.blur(); }
    });
  });
}

// ===== Selection =====
function selectComponent(compId) {
  if (appState.selectedId === compId) return;
  appState.selectedId = compId;
  renderCanvas();
  renderLayerPanel();
  renderInspector();
}

function deselectAll() {
  if (!appState.selectedId) return;
  appState.selectedId = null;
  renderCanvas();
  renderLayerPanel();
  renderInspector();
}

// ===== Resize Handles =====
function addResizeHandles(wrapper, comp) {
  const handles = ["n","s","e","w","ne","nw","se","sw"];
  handles.forEach(dir => {
    const h = el("div", `resize-handle rh-${dir}`);
    h.dataset.handle = dir;
    h.addEventListener("mousedown", (e) => startResize(e, comp, dir));
    wrapper.appendChild(h);
  });
}

function startResize(e, comp, dir) {
  e.stopPropagation();
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const origW = comp.w || 0;
  const origH = comp.h || 0;

  appState.resizeState = { compId: comp.id, dir, startX, startY, origW, origH };

  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    const c = getCurrentDesign().find(c => c.id === comp.id);
    if (!c) return;

    if (dir.includes("e")) c.w = Math.max(40, origW + dx);
    if (dir.includes("w")) c.w = Math.max(40, origW - dx);
    if (dir.includes("s")) c.h = Math.max(30, origH + dy);
    if (dir.includes("n")) c.h = Math.max(30, origH - dy);

    // Update visual directly without full re-render
    const wrapperEl = document.querySelector(`.comp-wrapper[data-id="${comp.id}"]`);
    if (wrapperEl) {
      if (c.w) wrapperEl.style.width = c.w + "px";
      if (c.h) wrapperEl.style.minHeight = c.h + "px";
    }
    renderInspector();
  };

  const onUp = () => {
    appState.resizeState = null;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    toast("已调整组件尺寸");
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

// ===== Layer Panel =====
function renderLayerPanel() {
  const list = $("layer-list");
  list.innerHTML = "";
  const components = getCurrentDesign();

  if (components.length === 0) {
    list.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:11px;text-align:center;">无图层</div>';
    return;
  }

  // Reverse order so top of canvas appears top of list
  [...components].reverse().forEach(comp => {
    const item = el("div", "layer-item");
    if (comp.id === appState.selectedId) item.classList.add("selected");

    const icon = el("span", "layer-icon", getCompIcon(comp.type));
    item.appendChild(icon);

    const name = el("span", "layer-name", comp.label || comp.type);
    item.appendChild(name);

    const vis = el("span", "layer-vis", "👁");
    vis.addEventListener("click", (e) => {
      e.stopPropagation();
      toast("图层显隐切换");
    });
    item.appendChild(vis);

    item.addEventListener("click", () => selectComponent(comp.id));

    // Drag reorder
    item.draggable = true;
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", "layer:" + comp.id); } catch(err) {}
      item.style.opacity = "0.5";
    });
    item.addEventListener("dragend", () => { item.style.opacity = ""; });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      item.style.borderTop = "2px solid var(--accent-cyan)";
    });
    item.addEventListener("dragleave", () => { item.style.borderTop = ""; });
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.style.borderTop = "";
      const data = e.dataTransfer.getData("text/plain");
      if (data.startsWith("layer:")) {
        const fromId = data.substring(6);
        reorderLayer(fromId, comp.id);
      }
    });

    list.appendChild(item);
  });
}

function getCompIcon(type) {
  const map = {
    navbar: "☰", hero: "◈", features: "✦", cta: "➤",
    footer: "▬", sidebar: "◧", "toolbar-app": "⬒", "data-table": "▦",
    card: "☐", text: "T", form: "✎", stats: "#",
  };
  return map[type] || "▪";
}

function reorderLayer(fromId, toId) {
  const comps = getCurrentDesign();
  const fromIdx = comps.findIndex(c => c.id === fromId);
  const toIdx = comps.findIndex(c => c.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

  const [moved] = comps.splice(fromIdx, 1);
  const newToIdx = comps.findIndex(c => c.id === toId);
  comps.splice(newToIdx, 0, moved);

  renderCanvas();
  renderLayerPanel();
  toast("已调整图层顺序");
}

// ===== Property Inspector =====
function renderInspector() {
  const panel = $("inspector-body");
  const comp = getSelectedComp();

  if (!comp) {
    panel.innerHTML = `
      <div class="inspector-empty">
        <div class="ie-icon">◈</div>
        <p>点击画布上的组件</p>
        <p style="margin-top:4px;font-size:11px;">查看并编辑属性</p>
        <div style="margin-top:20px;padding:12px;background:var(--surface-2);border-radius:8px;text-align:left;font-size:11px;color:var(--text-muted);">
          <strong style="color:var(--text-dim);">快捷操作</strong><br>
          • 单击组件 → 选中<br>
          • 双击文字 → 内联编辑<br>
          • 拖拽边角 → 调整大小<br>
          • 拖拽图层 → 调整顺序<br>
          • 从左侧库拖拽 → 添加组件
        </div>
      </div>`;
    return;
  }

  const propDef = COMP_PROPS[comp.type] || { layout: [], content: [], appearance: [] };
  panel.innerHTML = "";

  // Component info header
  const header = el("div", "inspector-section");
  header.innerHTML = `
    <div class="inspector-section-title">${getCompIcon(comp.type)} ${comp.label || comp.type}</div>
    <div style="font-size:11px;color:var(--text-muted);">ID: ${comp.id}</div>
  `;
  panel.appendChild(header);

  // Layout section
  if (propDef.layout && propDef.layout.length > 0) {
    const section = el("div", "inspector-section");
    section.appendChild(el("div", "inspector-section-title", "布局"));
    propDef.layout.forEach(prop => {
      section.appendChild(buildPropRow(prop, comp));
    });
    // Manual width/height inputs
    const wRow = el("div", "prop-row");
    wRow.appendChild(el("div", "prop-label", "宽度"));
    const wGroup = el("div", "prop-input-group");
    const wInput = el("input", "prop-num-input");
    wInput.type = "number";
    wInput.value = comp.w || 0;
    wInput.addEventListener("change", () => {
      comp.w = parseInt(wInput.value) || 0;
      renderCanvas();
    });
    wGroup.appendChild(wInput);
    wGroup.appendChild(el("span", null, "px"));
    wRow.appendChild(wGroup);
    section.appendChild(wRow);

    const hRow = el("div", "prop-row");
    hRow.appendChild(el("div", "prop-label", "高度"));
    const hGroup = el("div", "prop-input-group");
    const hInput = el("input", "prop-num-input");
    hInput.type = "number";
    hInput.value = comp.h || 0;
    hInput.addEventListener("change", () => {
      comp.h = parseInt(hInput.value) || 0;
      renderCanvas();
    });
    hGroup.appendChild(hInput);
    hGroup.appendChild(el("span", null, "px"));
    hRow.appendChild(hGroup);
    section.appendChild(hRow);

    panel.appendChild(section);
  }

  // Content section
  if (propDef.content && propDef.content.length > 0) {
    const section = el("div", "inspector-section");
    section.appendChild(el("div", "inspector-section-title", "内容"));
    propDef.content.forEach(prop => {
      if (prop.type === "text") {
        section.appendChild(buildTextPropRow(prop, comp));
      }
    });
    panel.appendChild(section);
  }

  // Appearance section
  if (propDef.appearance && propDef.appearance.length > 0) {
    const section = el("div", "inspector-section");
    section.appendChild(el("div", "inspector-section-title", "外观"));
    propDef.appearance.forEach(prop => {
      if (prop.type === "color") {
        section.appendChild(buildColorPropRow(prop, comp));
      }
    });
    panel.appendChild(section);
  }

  // Animation section
  const animSection = el("div", "inspector-section");
  animSection.appendChild(el("div", "inspector-section-title", "动效"));

  const animRow = el("div", "prop-row");
  animRow.appendChild(el("div", "prop-label", "入场"));
  const animSelect = el("select", "prop-select");
  animSelect.innerHTML = '<option value="">无</option>' +
    LIBRARY_ANIMATIONS.map(a => `<option value="${a.id}" ${comp.props._anim === a.id ? "selected" : ""}>${a.name}</option>`).join("");
  animSelect.addEventListener("change", () => {
    comp.props._anim = animSelect.value;
    toast(`已设置入场动画: ${animSelect.value || "无"}`);
  });
  animRow.appendChild(animSelect);
  animSection.appendChild(animRow);

  const durRow = el("div", "prop-row");
  durRow.appendChild(el("div", "prop-label", "时长"));
  const durGroup = el("div", "prop-input-group");
  const durSlider = el("input", "prop-slider");
  durSlider.type = "range";
  durSlider.min = "100"; durSlider.max = "2000"; durSlider.step = "50";
  durSlider.value = comp.props._dur || "400";
  const durInput = el("input", "prop-num-input");
  durInput.type = "number";
  durInput.value = comp.props._dur || 400;
  durSlider.addEventListener("input", () => {
    comp.props._dur = parseInt(durSlider.value);
    durInput.value = durSlider.value;
  });
  durInput.addEventListener("change", () => {
    comp.props._dur = parseInt(durInput.value) || 400;
    durSlider.value = durInput.value;
  });
  durGroup.appendChild(durSlider);
  durGroup.appendChild(durInput);
  durRow.appendChild(durGroup);
  animSection.appendChild(durRow);

  panel.appendChild(animSection);

  // Actions
  const actionSection = el("div", "inspector-section");
  const delBtn = el("button", "toolbar-btn");
  delBtn.style.cssText = "width:100%;padding:8px;background:var(--danger);color:#fff;border-radius:6px;font-size:12px;font-weight:600;";
  delBtn.textContent = "删除组件";
  delBtn.addEventListener("click", () => deleteComponent(comp.id));
  actionSection.appendChild(delBtn);
  panel.appendChild(actionSection);
}

function buildPropRow(prop, comp) {
  const row = el("div", "prop-row");
  row.appendChild(el("div", "prop-label", prop.label));

  const group = el("div", "prop-input-group");
  const slider = el("input", "prop-slider");
  slider.type = "range";
  slider.min = prop.min;
  slider.max = prop.max;
  slider.step = prop.step;
  slider.value = comp[prop.key] || prop.min;

  const input = el("input", "prop-num-input");
  input.type = "number";
  input.value = comp[prop.key] || prop.min;

  slider.addEventListener("input", () => {
    comp[prop.key] = parseInt(slider.value);
    input.value = slider.value;
    // Update canvas directly
    const wrapperEl = document.querySelector(`.comp-wrapper[data-id="${comp.id}"]`);
    if (wrapperEl) {
      if (prop.key === "w") wrapperEl.style.width = comp.w + "px";
      if (prop.key === "h") wrapperEl.style.minHeight = comp.h + "px";
    }
  });

  input.addEventListener("change", () => {
    const v = parseInt(input.value) || prop.min;
    comp[prop.key] = v;
    slider.value = v;
    renderCanvas();
  });

  group.appendChild(slider);
  group.appendChild(input);
  if (prop.unit) group.appendChild(el("span", null, prop.unit));
  row.appendChild(group);

  return row;
}

function buildTextPropRow(prop, comp) {
  const row = el("div", "prop-full-row");
  row.appendChild(el("div", "prop-label", prop.label));
  const input = el("input", "prop-num-input");
  input.style.cssText = "width:100%;text-align:left;padding:5px 8px;";
  input.value = comp.props[prop.key] || "";
  input.addEventListener("change", () => {
    comp.props[prop.key] = input.value;
    renderCanvas();
    renderLayerPanel();
  });
  row.appendChild(input);
  return row;
}

function buildColorPropRow(prop, comp) {
  const row = el("div", "prop-row");
  row.appendChild(el("div", "prop-label", prop.label));

  const group = el("div", "prop-color-row");
  group.style.flex = "1";
  const swatch = el("div", "prop-color-swatch");
  const currentColor = comp.props.bg || prop.default || "#ffffff";
  swatch.style.background = currentColor;

  const text = el("input", "prop-color-text");
  text.value = currentColor;

  swatch.addEventListener("click", () => {
    const picker = el("input");
    picker.type = "color";
    picker.value = text.value;
    picker.style.position = "absolute";
    picker.style.opacity = "0";
    document.body.appendChild(picker);
    picker.addEventListener("input", () => {
      text.value = picker.value;
      swatch.style.background = picker.value;
      comp.props.bg = picker.value;
      renderCanvas();
    });
    picker.addEventListener("change", () => {
      document.body.removeChild(picker);
    });
    picker.click();
  });

  text.addEventListener("change", () => {
    comp.props.bg = text.value;
    swatch.style.background = text.value;
    renderCanvas();
  });

  group.appendChild(swatch);
  group.appendChild(text);
  row.appendChild(group);

  return row;
}

// ===== Library Panel =====
function renderLibrary() {
  const list = $("library-list");
  list.innerHTML = "";

  // Group by category
  const categories = { layout: "布局", content: "内容", data: "数据", input: "输入" };
  Object.entries(categories).forEach(([catId, catName]) => {
    const items = LIBRARY_COMPONENTS.filter(c => c.category === catId);
    if (items.length === 0) return;

    const groupLabel = el("div", "lib-group-label");
    groupLabel.style.cssText = "font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);padding:8px 10px 4px;";
    groupLabel.textContent = catName;
    list.appendChild(groupLabel);

    items.forEach(item => {
      const elItem = el("div", "lib-item");
      elItem.draggable = true;
      elItem.dataset.libType = "component";
      elItem.dataset.itemId = item.id;

      const icon = el("span", "lib-icon", item.icon);
      elItem.appendChild(icon);

      const text = el("div", "lib-text");
      text.appendChild(el("div", "lib-name", item.name));
      text.appendChild(el("div", "lib-desc", item.desc));
      elItem.appendChild(text);

      elItem.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "copy";
        try { e.dataTransfer.setData("text/plain", JSON.stringify({ type: "library", compType: item.id })); } catch(err) {}
        elItem.classList.add("dragging");
      });
      elItem.addEventListener("dragend", () => elItem.classList.remove("dragging"));

      // Click to add
      elItem.addEventListener("click", () => addComponentFromLibrary(item.id));

      list.appendChild(elItem);
    });
  });
}

function addComponentFromLibrary(compType) {
  const comps = getCurrentDesign();
  const newComp = {
    id: "c" + Date.now(),
    type: compType,
    x: 0, y: 0, w: 0, h: 0,
    label: LIBRARY_COMPONENTS.find(c => c.id === compType)?.name || compType,
    props: getDefaultProps(compType),
  };
  comps.push(newComp);
  renderCanvas();
  renderLayerPanel();
  selectComponent(newComp.id);
  toast(`已添加 ${newComp.label}`);
}

function getDefaultProps(compType) {
  const defaults = {
    navbar: { brand: "新导航", links: ["链接1", "链接2"], cta: "按钮", bg: "#fff" },
    hero: { title: "新标题", subtitle: "副标题文字", button: "按钮", bg: "linear-gradient(135deg, #f5f3ff, #ede9fe)" },
    features: { title: "功能标题", items: [
      { icon: "◆", title: "功能1", desc: "描述文字" },
      { icon: "◈", title: "功能2", desc: "描述文字" },
      { icon: "✦", title: "功能3", desc: "描述文字" },
    ], bg: "#fff" },
    cta: { title: "准备好了吗？", button: "开始", bg: "linear-gradient(135deg, #6d28d9, #3b82f6)" },
    footer: { copyright: "© 2026", links: ["隐私"], bg: "#1a1a2e" },
    sidebar: { items: [{ icon: "◆", name: "项目1" }, { icon: "◈", name: "项目2" }], active: 0, bg: "#f5f5f7" },
    "toolbar-app": { buttons: ["新建", "导入"], primary: "新建", bg: "#fff" },
    "data-table": { columns: ["列1", "列2"], rows: [["数据1", "数据2"]], bg: "#fff" },
  };
  return defaults[compType] || {};
}

// ===== Delete Component =====
function deleteComponent(compId) {
  const comps = getCurrentDesign();
  const idx = comps.findIndex(c => c.id === compId);
  if (idx === -1) return;
  comps.splice(idx, 1);
  appState.selectedId = null;
  renderCanvas();
  renderLayerPanel();
  renderInspector();
  toast("已删除组件");
}

// ===== Global Listeners =====
function setupGlobalListeners() {
  // Click on empty canvas to deselect
  document.addEventListener("mousedown", (e) => {
    const canvas = $("canvas-scroll-wrap");
    if (!canvas) return;
    // Check if click is on canvas background (not on a component or panel)
    const onComponent = e.target.closest(".comp-wrapper");
    const onPanel = e.target.closest(".panel");
    const onInspector = e.target.closest(".inspector-section");
    const onToolbar = e.target.closest(".canvas-toolbar");
    if (!onComponent && !onPanel && !onInspector && !onToolbar) {
      deselectAll();
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.contentEditable === "true") return;

    // Delete selected
    if ((e.key === "Delete" || e.key === "Backspace") && appState.selectedId) {
      e.preventDefault();
      deleteComponent(appState.selectedId);
    }
    // Escape to deselect
    if (e.key === "Escape") deselectAll();

    // Zoom shortcuts
    if (e.key === "=" || e.key === "+") { e.preventDefault(); setZoom(appState.zoom + 10); }
    if (e.key === "-") { e.preventDefault(); setZoom(appState.zoom - 10); }
    if (e.key === "0") { e.preventDefault(); setZoom(100); }
  });

  // Canvas drop zone for library drags
  const scrollWrap = $("canvas-scroll-wrap");
  scrollWrap.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  scrollWrap.addEventListener("drop", (e) => {
    e.preventDefault();
    try {
      const data = e.dataTransfer.getData("text/plain");
      const parsed = JSON.parse(data);
      if (parsed.type === "library") {
        addComponentFromLibrary(parsed.compType);
      }
    } catch(err) {
      // Not a library drag
    }
  });

  // Zoom button handlers
  $("zoom-in").addEventListener("click", () => setZoom(appState.zoom + 10));
  $("zoom-out").addEventListener("click", () => setZoom(appState.zoom - 10));
  $("zoom-reset").addEventListener("click", () => setZoom(100));

  // Toolbar button handlers
  $("undo-btn").addEventListener("click", () => toast("撤销"));
  $("redo-btn").addEventListener("click", () => toast("重做"));
  $("import-btn").addEventListener("click", () => toast("导入项目功能 — 输入文件夹路径扫描组件"));
  $("export-btn").addEventListener("click", () => toast("导出代码 — 支持 HTML / React / Vue / Figma Tokens"));
  $("share-btn").addEventListener("click", () => toast("分享预览链接已复制到剪贴板"));
}

// ===== Zoom =====
function setZoom(z) {
  appState.zoom = Math.max(25, Math.min(200, z));
  $("zoom-value").textContent = appState.zoom + "%";
  $("canvas-scroll-wrap").style.zoom = appState.zoom / 100;
}

// ===== Meta =====
function updateMeta() {
  const meta = $("canvas-meta");
  const comps = getCurrentDesign();
  const pf = PLATFORMS[appState.platform];
  meta.textContent = `${pf.name} · ${comps.length} 个组件`;
}

// ===== Prompt Bar =====
function setupPromptBar() {
  const input = $("prompt-input");
  const send = $("prompt-send");

  const handleSend = () => {
    const text = input.value.trim();
    if (!text) return;
    toast(`AI 指令已发送: "${text}"`);
    input.value = "";

    // Simulate AI response
    setTimeout(() => {
      toast("AI 已处理指令，画布已更新");
    }, 1200);
  };

  send.addEventListener("click", handleSend);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend();
  });
}

// ===== Boot =====
document.addEventListener("DOMContentLoaded", init);
