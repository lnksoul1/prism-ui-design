// /* === SPLIT-MODULE === */
/**
 * Prism Dashboard — Selection, inspector (component / element / page background), inline editing and reorder drag.
 *
 * Part of the split client application. All parts are global-scope scripts;
 * they must be loaded in the order declared in index.html.
 */

// ===== Selection / Inspector / Layers / Zoom =====

function getSelectedComp() {
  if (!selectedComponentId || !currentState) return null;
  return findCompDeep(getCurrentComponents(), selectedComponentId);
}

/** 子组件的父级路径（"parent → child"），用于检查器标识内部组成部分。 */
function componentParentPath(id) {
  if (!currentState) return null;
  const parts = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.id === id) {
        parts.push(node.type);
        return true;
      }
      if (node.children && node.children.length > 0) {
        parts.push(node.type);
        if (walk(node.children)) return true;
        parts.pop();
      }
    }
    return false;
  };
  if (walk(getCurrentComponents()) && parts.length > 1) {
    return "↳ " + parts.join(" / ");
  }
  return null;
}

function getSelectedComps() {
  if (!currentState || selectedIds.length === 0) return [];
  const all = getCurrentComponents();
  return selectedIds
    .map((id) => findCompDeep(all, id))
    .filter(Boolean);
}

function selectComponent(id, additive) {
  // 组件级重新选择时清除元素级选择（元素选择由 selectElement 管理）
  selectedElementPath = null;
  if (additive) {
    const idx = selectedIds.indexOf(id);
    if (idx >= 0) {
      selectedIds.splice(idx, 1);
    } else {
      selectedIds.push(id);
    }
    if (selectedIds.length === 0) {
      selectedComponentId = null;
    } else if (!selectedIds.includes(selectedComponentId)) {
      selectedComponentId = selectedIds[selectedIds.length - 1];
    }
  } else {
    selectedIds = [id];
    selectedComponentId = id;
  }
  document.querySelectorAll(".comp-wrapper.selected").forEach((w) => w.classList.remove("selected"));
  selectedIds.forEach((sid) => {
    const wrapper = document.querySelector(`.comp-wrapper[data-id="${CSS.escape(sid)}"]`);
    if (wrapper) wrapper.classList.add("selected");
  });
  renderInspector();
  renderLayerPanel();
  renderComments();
  renderSelectionToolbar();
}

// ===== 元素级编辑 P1 (inner-element selection) =====

/**
 * Select an inner element (by its prop path) of a component. The component
 * stays selected (so layout/drag still works); the element gets a distinct
 * highlight and the inspector shows an element panel (type promotion +
 * per-element behavior).
 */
function selectElement(compId, path) {
  selectedComponentId = compId;
  selectedIds = [compId];
  selectedElementPath = path || null;
  document.querySelectorAll(".comp-wrapper.selected").forEach((w) => w.classList.remove("selected"));
  const wrapper = document.querySelector(`.comp-wrapper[data-id="${CSS.escape(compId)}"]`);
  if (wrapper) wrapper.classList.add("selected");
  applyElementSelectionHighlight();
  renderInspector();
  renderLayerPanel();
  renderComments();
  renderSelectionToolbar();
}

/** Remove element-level selection, keeping the component selected. */
function clearElementSelection() {
  selectedElementPath = null;
  applyElementSelectionHighlight();
  renderInspector();
}

/** Highlight the currently selected inner element (if any). */
function applyElementSelectionHighlight() {
  document.querySelectorAll(".element-selected").forEach((w) => w.classList.remove("element-selected"));
  if (!selectedComponentId || !selectedElementPath) return;
  const wrapper = document.querySelector(`.comp-wrapper[data-id="${CSS.escape(selectedComponentId)}"]`);
  if (!wrapper) return;
  const elm = wrapper.querySelector(`[data-prop="${CSS.escape(selectedElementPath)}"]`);
  if (elm) elm.classList.add("element-selected");
}

/** Find the element-level behavior bound to the clicked inner element. */
function elementBehaviorAt(target, comp) {
  if (!comp || !comp.elementMeta) return null;
  const innerEl = target.closest("[data-element='true']");
  if (!innerEl) return null;
  const path = innerEl.getAttribute("data-prop");
  if (!path) return null;
  const meta = comp.elementMeta[path];
  return meta && meta.behavior && meta.behavior.type ? meta.behavior : null;
}

/** Dispatch an element-level behavior (same semantics as component behavior). */
function dispatchElementBehavior(behavior) {
  dispatchBehavior({ behavior });
}

function deselectAll() {
  selectedComponentId = null;
  selectedIds = [];
  selectedElementPath = null;
  document.querySelectorAll(".comp-wrapper.selected").forEach((w) => w.classList.remove("selected"));
  document.querySelectorAll(".element-selected").forEach((w) => w.classList.remove("element-selected"));
  renderInspector();
  renderLayerPanel();
  renderSelectionToolbar();
}

// ===== Selection floating toolbar (Pixso/Figma-style contextual actions) =====

const ALIGN_ACTIONS = [
  ["left", "⇤", "alignLeft"],
  ["center_x", "⇹", "alignCenterX"],
  ["right", "⇥", "alignRight"],
  ["top", "⇧", "alignTop"],
  ["center_y", "⇵", "alignCenterY"],
  ["bottom", "⇩", "alignBottom"],
  ["distribute_x", "⋮⇤⇥", "distributeX"],
  ["distribute_y", "⋮⇧⇩", "distributeY"],
];

function renderSelectionToolbar() {
  const bar = $("selection-toolbar");
  if (!bar) return;
  bar.innerHTML = "";
  const comps = getSelectedComps();
  if (comps.length === 0) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";

  const add = (label, icon, fn, title) => {
    const btn = el("button", "sel-tool-btn", icon);
    btn.type = "button";
    btn.title = title || label;
    btn.addEventListener("click", fn);
    bar.appendChild(btn);
  };

  if (comps.length === 1) {
    const comp = comps[0];
    add(t("duplicate"), "⧉", () => duplicateSelected(comp.id), t("duplicate") + " (Ctrl+D)");
    add(t("moveUp"), "↑", () => moveSelected(comp.id, -1), t("moveUp"));
    add(t("moveDown"), "↓", () => moveSelected(comp.id, +1), t("moveDown"));
    add(t("zFront"), "⤒", () => zOrderSelected(comp.id, "front"), t("zFront"));
    add(t("zBack"), "⤓", () => zOrderSelected(comp.id, "back"), t("zBack"));
    add(t("deleteComponent"), "✕", () => {
      handleDeleteComponent(comp.id);
      deselectAll();
    }, t("deleteComponent"));
  } else {
    // Multi-select: alignment / distribution (freeform only) + bulk delete
    const ids = comps.map((c) => c.id);
    if (canvasMode === "freeform") {
      ALIGN_ACTIONS.forEach(([mode, icon, key]) => {
        add(t(key), icon, () => alignSelected(ids, mode), t(key));
      });
    }
    add(t("deleteComponent"), "✕", () => {
      ids.forEach((id) => handleDeleteComponent(id));
      deselectAll();
    }, t("deleteComponent"));
  }
}

function alignSelected(ids, mode) {
  fetch("/api/align", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, mode }),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .catch((err) => console.error("Align failed:", err));
}

function zOrderSelected(id, mode) {
  fetch(`/api/component/${id}/z-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  }).catch((err) => console.error("Z-order failed:", err));
}

function duplicateSelected(id) {
  send({ type: "duplicate_component", id });
  showToastMsg(t("duplicateDone"));
}

function moveSelected(id, delta) {
  const components = getCurrentComponents();
  const idx = components.findIndex((c) => c.id === id);
  if (idx === -1) return;
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= components.length) return;
  send({
    type: "reorder_component",
    fromId: id,
    toId: components[targetIdx].id,
    position: delta < 0 ? "before" : "after",
  });
}

function isInspectorFocused() {
  const active = document.activeElement;
  return !!active && !!active.closest && !!active.closest("#inspector-body");
}

function renderInspector() {
  const panel = $("inspector-body");
  if (!panel) return;
  const comp = getSelectedComp();

  if (!comp) {
    // 未选中组件时：显示页面背景编辑面板（背景编辑 P1）
    renderPageBackgroundPanel(panel);
    return;
  }

  panel.innerHTML = "";
  const tabs = el("div", "inspector-tabs");
  const propsBtn = el("button", "inspector-tab active", t("inspectorPropsTab"));
  propsBtn.type = "button";
  const codeBtn = el("button", "inspector-tab", t("inspectorCodeTab"));
  codeBtn.type = "button";
  tabs.appendChild(propsBtn);
  tabs.appendChild(codeBtn);
  panel.appendChild(tabs);
  const content = el("div", "inspector-tab-content");
  panel.appendChild(content);
  renderInspectorProps(content, comp);

  propsBtn.addEventListener("click", () => {
    codeBtn.classList.remove("active");
    propsBtn.classList.add("active");
    renderInspectorProps(content, comp);
  });
  codeBtn.addEventListener("click", () => {
    propsBtn.classList.remove("active");
    codeBtn.classList.add("active");
    renderInspectorCode(content, comp);
  });
}

// ===== 背景编辑 P1 (page background panel) =====

/** 渲染页面背景编辑面板（未选中组件时显示在检查器中）。 */
function renderPageBackgroundPanel(panel) {
  panel.innerHTML = "";
  const bg = (currentState && currentState.pageBackground) || null;

  const header = el("div", "inspector-section");
  header.appendChild(el("div", "inspector-section-title", t("pageBackground")));
  const idLine = el("div", "inspector-id", t("pageBackgroundHint"));
  idLine.style.opacity = "0.7";
  header.appendChild(idLine);
  panel.appendChild(header);

  // 预设分类网格
  const presets = el("div", "bg-preset-grid");
  PAGE_BACKGROUND_PRESETS.forEach((preset) => {
    const item = el("div", "bg-preset" + (bg && bg.value === preset.value ? " active" : ""));
    item.dataset.bgId = preset.id;
    const swatch = el("div", "bg-preset-swatch");
    swatch.style.background = preset.value;
    if (preset.type === "animation") swatch.classList.add("bg-preset-anim");
    item.appendChild(swatch);
    item.appendChild(el("div", "bg-preset-name", preset.name));
    item.addEventListener("click", () => {
      savePageBackground({
        type: preset.type,
        value: preset.value,
        animation: preset.animation,
      });
    });
    presets.appendChild(item);
  });
  panel.appendChild(presets);

  // 自定义区
  const custom = el("div", "inspector-section");
  custom.appendChild(el("div", "inspector-section-title", t("bgCustom")));

  // 纯色输入
  const colorRow = el("div", "prop-row");
  colorRow.appendChild(el("div", "prop-label", t("bgColor")));
  const colorInput = el("input", "prop-text-input");
  colorInput.value = (bg && bg.type === "color" ? bg.value : "") || "#f8fafc";
  colorInput.spellcheck = false;
  colorInput.addEventListener("change", () => {
    const v = colorInput.value.trim();
    if (v) savePageBackground({ type: "color", value: v });
  });
  colorRow.appendChild(colorInput);
  custom.appendChild(colorRow);

  // 渐变输入
  const gradRow = el("div", "prop-row");
  gradRow.appendChild(el("div", "prop-label", t("bgGradient")));
  const gradInput = el("input", "prop-text-input");
  gradInput.value = (bg && bg.type === "gradient" ? bg.value : "") || "linear-gradient(135deg, #6366f1, #22d3ee)";
  gradInput.spellcheck = false;
  gradInput.addEventListener("change", () => {
    const v = gradInput.value.trim();
    if (v) savePageBackground({ type: "gradient", value: v });
  });
  gradRow.appendChild(gradInput);
  custom.appendChild(gradRow);

  // 图片 URL 输入
  const imgRow = el("div", "prop-row");
  imgRow.appendChild(el("div", "prop-label", t("bgImageUrl")));
  const imgInput = el("input", "prop-text-input");
  imgInput.value = (bg && bg.type === "image" ? bg.value : "") || "";
  imgInput.placeholder = "https://…/bg.jpg";
  imgInput.spellcheck = false;
  imgInput.addEventListener("change", () => {
    const v = imgInput.value.trim();
    if (v) savePageBackground({ type: "image", value: `url('${v}') center/cover no-repeat` });
  });
  imgRow.appendChild(imgInput);
  custom.appendChild(imgRow);

  // 操作按钮
  const actions = el("div", "inspector-actions");
  const applyBtn = el("button", "inspector-action-btn", t("bgApplyColor"));
  applyBtn.addEventListener("click", () => {
    savePageBackground({ type: "color", value: colorInput.value.trim() || "#f8fafc" });
  });
  actions.appendChild(applyBtn);
  const clearBtn = el("button", "inspector-delete-btn", t("bgClear"));
  clearBtn.addEventListener("click", () => {
    savePageBackground(null);
    colorInput.value = "";
  });
  actions.appendChild(clearBtn);
  custom.appendChild(actions);
  panel.appendChild(custom);

  // 提示
  const hint = el("div", "inspector-hint", t("bgCustomHint"));
  panel.appendChild(hint);
}

function renderInspectorProps(panel, comp) {
  const props = comp.props || {};

  // Header
  const header = el("div", "inspector-section");
  const title = el("div", "inspector-section-title");
  title.textContent = `${comp.type}${comp.variant ? " / " + comp.variant : ""}`;
  header.appendChild(title);
  const idLine = el("div", "inspector-id", `ID: ${comp.id}`);
  header.appendChild(idLine);
  // 子组件显示父级路径，让用户知道正在调整内部组成部分
  const parentPath = componentParentPath(comp.id);
  if (parentPath) {
    const pathLine = el("div", "inspector-id inspector-parent-path", parentPath);
    pathLine.style.opacity = "0.7";
    header.appendChild(pathLine);
  }
  panel.appendChild(header);

  // 元素级编辑 P1: 当组件内部某个元素被选中时，显示该元素的编辑面板
  // （类型提升 文本/按钮/链接 + 元素级行为绑定）。
  if (selectedElementPath && selectedComponentId === comp.id) {
    renderElementPanel(panel, comp, selectedElementPath);
  }

  // Appearance (Pixso-style fill / text / radius) — always available.
  const appearance = el("div", "inspector-section");
  appearance.appendChild(el("div", "inspector-section-title", t("appearance")));
  const addAppearanceColor = (label, key) => {
    const row = el("div", "prop-row");
    row.appendChild(el("div", "prop-label", label));
    const group = el("div", "prop-color-row");
    const swatch = el("div", "prop-color-swatch");
    swatch.style.background = props[key] || "transparent";
    const input = el("input", "prop-text-input");
    input.value = props[key] || "";
    input.spellcheck = false;
    input.placeholder = "#hex";
    input.addEventListener("input", () => {
      swatch.style.background = input.value || "transparent";
    });
    input.addEventListener("change", () => {
      sendUpdateComponent(comp.id, { [key]: input.value });
      if (input.value) swatch.style.background = input.value;
    });
    group.appendChild(swatch);
    group.appendChild(input);
    row.appendChild(group);
    appearance.appendChild(row);
  };
  addAppearanceColor(t("fill"), "bg");
  addAppearanceColor(t("textColor"), "color");
  // 组件背景增强 (背景编辑 P1): 渐变 / 图片可写入 props.bg（CSS background 值）
  const bgAdvanced = el("div", "prop-row");
  bgAdvanced.appendChild(el("div", "prop-label", t("bgAdvanced")));
  const bgAdvancedInput = el("input", "prop-text-input");
  bgAdvancedInput.value = (props.bg_gradient || props.bg_image) || "";
  bgAdvancedInput.placeholder = "linear-gradient(...) 或图片 URL";
  bgAdvancedInput.spellcheck = false;
  bgAdvancedInput.addEventListener("change", () => {
    const v = bgAdvancedInput.value.trim();
    if (!v) {
      sendUpdateComponent(comp.id, { bg_gradient: "", bg_image: "", bg: "" });
      return;
    }
    if (/^https?:\/\/|^data:|^\//i.test(v)) {
      sendUpdateComponent(comp.id, { bg_gradient: "", bg_image: v, bg: `url('${v}') center/cover no-repeat` });
    } else {
      sendUpdateComponent(comp.id, { bg_gradient: v, bg_image: "", bg: v });
    }
  });
  bgAdvanced.appendChild(bgAdvancedInput);
  appearance.appendChild(bgAdvanced);
  const radiusRow = el("div", "prop-row");
  radiusRow.appendChild(el("div", "prop-label", t("radius")));
  const radiusInput = el("input", "prop-text-input");
  radiusInput.value = props.radius || "";
  radiusInput.placeholder = "8px";
  radiusInput.spellcheck = false;
  radiusInput.addEventListener("change", () => {
    sendUpdateComponent(comp.id, { radius: radiusInput.value });
  });
  radiusRow.appendChild(radiusInput);
  appearance.appendChild(radiusRow);
  panel.appendChild(appearance);

  // Layout section (freeform mode, top-level components only — children flow
  // inside their parent container and use no canvas coordinates).
  if (canvasMode === "freeform" && !componentParentPath(comp.id)) {
    const layoutSection = el("div", "inspector-section");
  layoutSection.appendChild(el("div", "inspector-section-title", t("layout")));
    const L = comp.layout || { x: 0, y: 0, w: 0, h: 0 };
    ["x", "y", "w", "h"].forEach((key) => {
      const row = el("div", "prop-row");
  row.appendChild(el("div", "prop-label", key === "w" ? t("width") : key === "h" ? t("height") : key.toUpperCase()));
      const input = el("input", "prop-num-input");
      input.type = "number";
      input.value = String(L[key] || 0);
      input.addEventListener("change", () => {
        const value = Math.max(0, parseInt(input.value, 10) || 0);
        const next = { ...(comp.layout || { x: 0, y: 0, w: 0, h: 0 }), [key]: value };
        comp.layout = next;
        sendUpdateComponent(comp.id, {}, { [key]: value });
        renderCanvas({ silent: true });
      });
      row.appendChild(input);
      layoutSection.appendChild(row);
    });
    panel.appendChild(layoutSection);
  }

  // Content (string props)
  const contentSection = el("div", "inspector-section");
  contentSection.appendChild(el("div", "inspector-section-title", t("content")));
  let textRows = 0;
  Object.entries(props).forEach(([key, value]) => {
    if (typeof value !== "string") return;
    const row = el("div", "prop-row");
    row.appendChild(el("div", "prop-label", key));
    if (isColorValue(value)) {
      const group = el("div", "prop-color-row");
      const swatch = el("div", "prop-color-swatch");
      swatch.style.background = value;
      const input = el("input", "prop-text-input");
      input.value = value;
      input.spellcheck = false;
      input.addEventListener("change", () => sendUpdateComponent(comp.id, { [key]: input.value }));
      group.appendChild(swatch);
      group.appendChild(input);
      row.appendChild(group);
    } else {
      const input = el("input", "prop-text-input");
      input.value = value;
      input.addEventListener("change", () => sendUpdateComponent(comp.id, { [key]: input.value }));
      row.appendChild(input);
    }
    contentSection.appendChild(row);
    textRows++;
  });
  if (textRows === 0) {
    contentSection.appendChild(el("div", "inspector-hint", t("noTextProps")));
  }
  panel.appendChild(contentSection);

  // Animation
  const animSection = el("div", "inspector-section");
  animSection.appendChild(el("div", "inspector-section-title", t("animation")));
  const anim = comp.animation || {};

  const entryRow = el("div", "prop-row");
  entryRow.appendChild(el("div", "prop-label", t("entry")));
  const entrySelect = el("select", "prop-select");
  entrySelect.innerHTML = '<option value="">无</option>' +
    LIBRARY_ANIMATIONS.filter((a) => a.entry).map((a) => `<option value="${a.entry}" ${anim.entry === a.entry ? "selected" : ""}>${a.name}</option>`).join("");
  entrySelect.addEventListener("change", () => {
    sendSetAnimation(comp.id, { entry: entrySelect.value || undefined });
  });
  entryRow.appendChild(entrySelect);
  animSection.appendChild(entryRow);

  const hoverRow = el("div", "prop-row");
  hoverRow.appendChild(el("div", "prop-label", t("hover")));
  const hoverSelect = el("select", "prop-select");
  hoverSelect.innerHTML = '<option value="">无</option>' +
    LIBRARY_ANIMATIONS.filter((a) => a.hover).map((a) => `<option value="${a.hover}" ${anim.hover === a.hover ? "selected" : ""}>${a.name}</option>`).join("");
  hoverSelect.addEventListener("change", () => {
    sendSetAnimation(comp.id, { hover: hoverSelect.value || undefined });
  });
  hoverRow.appendChild(hoverSelect);
  animSection.appendChild(hoverRow);

  const durRow = el("div", "prop-row");
  durRow.appendChild(el("div", "prop-label", t("duration")));
  const durGroup = el("div", "prop-input-group");
  const durSlider = el("input", "prop-slider");
  durSlider.type = "range";
  durSlider.min = "0.1";
  durSlider.max = "2";
  durSlider.step = "0.05";
  durSlider.value = String(anim.duration || 0.4);
  const durInput = el("input", "prop-num-input");
  durInput.type = "number";
  durInput.min = "0.1";
  durInput.max = "2";
  durInput.step = "0.05";
  durInput.value = String(anim.duration || 0.4);
  const applyDuration = () => {
    const v = Math.min(2, Math.max(0.1, parseFloat(durSlider.value) || 0.4));
    sendSetAnimation(comp.id, { duration: v });
  };
  durSlider.addEventListener("change", () => {
    durInput.value = durSlider.value;
    applyDuration();
  });
  durInput.addEventListener("change", () => {
    durSlider.value = durInput.value;
    applyDuration();
  });
  durGroup.appendChild(durSlider);
  durGroup.appendChild(durInput);
  durRow.appendChild(durGroup);
  animSection.appendChild(durRow);
  panel.appendChild(animSection);

  // Behavior (行为模型 P1): bind an interaction triggered in play mode
  const behaviorSection = el("div", "inspector-section");
  behaviorSection.appendChild(el("div", "inspector-section-title", t("behavior")));
  const behavior = comp.behavior || null;
  const pages = (currentState && currentState.pages) || [];
  const otherPages = pages.filter((p) => p.id !== (currentState && currentState.currentPageId));
  const allComponents = findAllComponents(getCurrentComponents());

  const behaviorTypeSelect = el("select", "prop-select");
  const behaviorTypes = [
    ["", t("behaviorNone")],
    ["navigate", t("behaviorNavigate")],
    ["link", t("behaviorLink")],
    ["toggle", t("behaviorToggle")],
    ["toast", t("behaviorToast")],
    ["submit", t("behaviorSubmit")],
    ["prompt", t("behaviorPrompt")],
  ];
  behaviorTypeSelect.innerHTML = behaviorTypes
    .map(([value, label]) => `<option value="${value}" ${behavior && behavior.type === value ? "selected" : ""}>${label}</option>`)
    .join("");
  const behaviorTypeRow = el("div", "prop-row");
  behaviorTypeRow.appendChild(el("div", "prop-label", t("behavior")));
  behaviorTypeRow.appendChild(behaviorTypeSelect);
  behaviorSection.appendChild(behaviorTypeRow);

  // Parameter rows per type (rebuilt on type change)
  const paramsWrap = el("div", "behavior-params");
  behaviorSection.appendChild(paramsWrap);

  const saveBehavior = (next) => {
    fetch(`/api/component/${comp.id}/behavior`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ behavior: next }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then(() => {
        comp.behavior = next || undefined;
        fetchInitialState();
        renderInspector();
        renderCanvas({ silent: true });
      })
      .catch((err) => {
        console.error("Set behavior failed:", err);
        showToastMsg(t("dsError"), true);
      });
  };

  const renderParams = () => {
    paramsWrap.innerHTML = "";
    const type = behaviorTypeSelect.value;
    if (!type) return;
    if (type === "navigate") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorNavigate")));
      const select = el("select", "prop-select");
      select.innerHTML =
        `<option value="">${t("playLinkPlaceholder")}</option>` +
        otherPages
          .map((p) => `<option value="${p.id}" ${behavior && behavior.page_id === p.id ? "selected" : ""}>${p.name}</option>`)
          .join("");
      select.addEventListener("change", () => {
        saveBehavior(
          select.value
            ? { type: "navigate", page_id: select.value }
            : null
        );
      });
      row.appendChild(select);
      paramsWrap.appendChild(row);
    } else if (type === "link") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorUrl")));
      const input = el("input", "prop-text-input");
      input.value = (behavior && behavior.url) || "";
      input.placeholder = "https://…";
      input.spellcheck = false;
      input.addEventListener("change", () => {
        const url = input.value.trim();
        saveBehavior(url ? { type: "link", url, new_tab: true } : null);
      });
      row.appendChild(input);
      paramsWrap.appendChild(row);
    } else if (type === "toggle") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorTarget")));
      const select = el("select", "prop-select");
      select.innerHTML =
        `<option value="">${t("behaviorTarget")}…</option>` +
        allComponents
          .filter((c) => c.id !== comp.id)
          .map((c) => `<option value="${c.id}" ${behavior && behavior.target_component_id === c.id ? "selected" : ""}>${c.type} · ${c.id.slice(-6)}</option>`)
          .join("");
      select.addEventListener("change", () => {
        saveBehavior(select.value ? { type: "toggle", target_component_id: select.value } : null);
      });
      row.appendChild(select);
      paramsWrap.appendChild(row);
    } else if (type === "toast") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorMessage")));
      const input = el("input", "prop-text-input");
      input.value = (behavior && behavior.message) || "";
      input.placeholder = t("behaviorToastDefault");
      input.addEventListener("change", () => {
        const message = input.value.trim();
        saveBehavior(message ? { type: "toast", message } : null);
      });
      row.appendChild(input);
      paramsWrap.appendChild(row);
    } else if (type === "submit") {
      const hint = el("div", "inspector-hint", t("behaviorPlayHint") + " · " + t("behaviorSubmitted"));
      paramsWrap.appendChild(hint);
    } else if (type === "prompt") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorPromptText")));
      const input = el("input", "prop-text-input");
      input.value = (behavior && behavior.prompt) || "";
      input.placeholder = t("promptPlaceholder");
      input.addEventListener("change", () => {
        const prompt = input.value.trim();
        saveBehavior(prompt ? { type: "prompt", prompt } : null);
      });
      row.appendChild(input);
      paramsWrap.appendChild(row);
    }
  };

  behaviorTypeSelect.addEventListener("change", () => {
    const type = behaviorTypeSelect.value;
    if (!type) {
      saveBehavior(null);
      paramsWrap.innerHTML = "";
      return;
    }
    // Preserve prior params where sensible when switching types.
    const base = behavior && behavior.type === type ? behavior : { type };
    saveBehavior(base);
    renderParams();
  });
  renderParams();

  const behaviorInfo = el("div", "inspector-link-info");
  if (behavior) {
    const label = behaviorTypes.find(([v]) => v === behavior.type);
    behaviorInfo.textContent = `${label ? label[1] : behavior.type} · ${t("behaviorPlayHint")}`;
    behaviorInfo.style.display = "block";
  }
  behaviorSection.appendChild(behaviorInfo);
  panel.appendChild(behaviorSection);

  // Actions
  const actions = el("div", "inspector-actions");
  const dupBtn = el("button", "inspector-action-btn", t("duplicate"));
  dupBtn.title = t("duplicate") + " (Ctrl+D)";
  dupBtn.addEventListener("click", () => duplicateSelected(comp.id));
  actions.appendChild(dupBtn);
  const delBtn = el("button", "inspector-delete-btn", t("deleteComponent"));
  delBtn.addEventListener("click", () => {
    handleDeleteComponent(comp.id);
    deselectAll();
  });
  actions.appendChild(delBtn);
  panel.appendChild(actions);
}

// ===== 元素级编辑 P1 (element inspector panel) =====

const ELEMENT_BEHAVIOR_TYPES = [
  ["", t("behaviorNone")],
  ["navigate", t("behaviorNavigate")],
  ["link", t("behaviorLink")],
  ["toggle", t("behaviorToggle")],
  ["toast", t("behaviorToast")],
  ["submit", t("behaviorSubmit")],
  ["prompt", t("behaviorPrompt")],
];

function saveElementMeta(path, meta) {
  const comp = getSelectedComp();
  if (!comp) return;
  fetch(`/api/component/${encodeURIComponent(comp.id)}/element-meta`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, ...meta }),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .then(() => {
      comp.elementMeta = comp.elementMeta || {};
      if (meta.behavior !== undefined) {
        if (meta.behavior === null) {
          if (comp.elementMeta[path]) delete comp.elementMeta[path].behavior;
        } else {
          comp.elementMeta[path] = { ...(comp.elementMeta[path] || {}), behavior: meta.behavior };
        }
      }
      if (meta.kind !== undefined) {
        if (meta.kind === null) {
          if (comp.elementMeta[path]) delete comp.elementMeta[path].kind;
        } else {
          comp.elementMeta[path] = { ...(comp.elementMeta[path] || {}), kind: meta.kind };
        }
      }
      if (comp.elementMeta[path] && Object.keys(comp.elementMeta[path]).length === 0) {
        delete comp.elementMeta[path];
      }
      if (Object.keys(comp.elementMeta).length === 0) delete comp.elementMeta;
      fetchInitialState();
      renderInspector();
      renderCanvas({ silent: true });
    })
    .catch((err) => {
      console.error("Set element meta failed:", err);
      showToastMsg(t("dsError"), true);
    });
}

/** 元素级编辑 P1: inspector section for the selected inner element. */
function renderElementPanel(panel, comp, path) {
  const meta = (comp.elementMeta && comp.elementMeta[path]) || {};
  const section = el("div", "inspector-section el-element-section");
  const title = el("div", "el-element-title", t("elementTitle", { path }));
  title.title = t("elementTitleHint");
  section.appendChild(title);

  // 类型提升: 文本 / 按钮 / 链接
  const kindRow = el("div", "prop-row");
  kindRow.appendChild(el("div", "prop-label", t("elementKind")));
  const kindGroup = el("div", "el-kind-group");
  [["text", t("kindText")], ["button", t("kindButton")], ["link", t("kindLink")]].forEach(([kind, label]) => {
    const btn = el("button", "el-kind-option" + (meta.kind === kind ? " active" : ""), label);
    btn.type = "button";
    btn.addEventListener("click", () => {
      saveElementMeta(path, { kind: kind === "text" ? null : kind });
    });
    kindGroup.appendChild(btn);
  });
  kindRow.appendChild(kindGroup);
  section.appendChild(kindRow);

  // 元素级行为绑定（播放模式点击该元素触发）
  const behavior = meta.behavior || null;
  const pages = (currentState && currentState.pages) || [];
  const otherPages = pages.filter((p) => p.id !== (currentState && currentState.currentPageId));
  const allComponents = findAllComponents(getCurrentComponents());

  const behaviorTypeSelect = el("select", "el-prop-select");
  behaviorTypeSelect.innerHTML = ELEMENT_BEHAVIOR_TYPES
    .map(([value, label]) => `<option value="${value}" ${behavior && behavior.type === value ? "selected" : ""}>${label}</option>`)
    .join("");
  const behaviorTypeRow = el("div", "prop-row");
  behaviorTypeRow.appendChild(el("div", "prop-label", t("behavior")));
  behaviorTypeRow.appendChild(behaviorTypeSelect);
  section.appendChild(behaviorTypeRow);

  const paramsWrap = el("div", "behavior-params");
  section.appendChild(paramsWrap);

  const renderParams = () => {
    paramsWrap.innerHTML = "";
    const type = behaviorTypeSelect.value;
    if (!type) return;
    if (type === "navigate") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorNavigate")));
      const select = el("select", "el-prop-select");
      select.innerHTML =
        `<option value="">${t("playLinkPlaceholder")}</option>` +
        otherPages
          .map((p) => `<option value="${p.id}" ${behavior && behavior.page_id === p.id ? "selected" : ""}>${p.name}</option>`)
          .join("");
      select.addEventListener("change", () => {
        saveElementMeta(path, { behavior: select.value ? { type: "navigate", page_id: select.value } : null });
      });
      row.appendChild(select);
      paramsWrap.appendChild(row);
    } else if (type === "link") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorUrl")));
      const input = el("input", "el-prop-text-input");
      input.value = (behavior && behavior.url) || "";
      input.placeholder = "https://…";
      input.spellcheck = false;
      input.addEventListener("change", () => {
        const url = input.value.trim();
        saveElementMeta(path, { behavior: url ? { type: "link", url, new_tab: true } : null });
      });
      row.appendChild(input);
      paramsWrap.appendChild(row);
    } else if (type === "toggle") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorTarget")));
      const select = el("select", "el-prop-select");
      select.innerHTML =
        `<option value="">${t("behaviorTarget")}…</option>` +
        allComponents
          .filter((c) => c.id !== comp.id)
          .map((c) => `<option value="${c.id}" ${behavior && behavior.target_component_id === c.id ? "selected" : ""}>${c.type} · ${c.id.slice(-6)}</option>`)
          .join("");
      select.addEventListener("change", () => {
        saveElementMeta(path, { behavior: select.value ? { type: "toggle", target_component_id: select.value } : null });
      });
      row.appendChild(select);
      paramsWrap.appendChild(row);
    } else if (type === "toast") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorMessage")));
      const input = el("input", "el-prop-text-input");
      input.value = (behavior && behavior.message) || "";
      input.placeholder = t("behaviorToastDefault");
      input.addEventListener("change", () => {
        const message = input.value.trim();
        saveElementMeta(path, { behavior: message ? { type: "toast", message } : null });
      });
      row.appendChild(input);
      paramsWrap.appendChild(row);
    } else if (type === "submit") {
      const hint = el("div", "inspector-hint", t("behaviorPlayHint") + " · " + t("behaviorSubmitted"));
      paramsWrap.appendChild(hint);
    } else if (type === "prompt") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorPromptText")));
      const input = el("input", "el-prop-text-input");
      input.value = (behavior && behavior.prompt) || "";
      input.placeholder = t("promptPlaceholder");
      input.addEventListener("change", () => {
        const prompt = input.value.trim();
        saveElementMeta(path, { behavior: prompt ? { type: "prompt", prompt } : null });
      });
      row.appendChild(input);
      paramsWrap.appendChild(row);
    }
  };

  behaviorTypeSelect.addEventListener("change", () => {
    const type = behaviorTypeSelect.value;
    if (!type) {
      saveElementMeta(path, { behavior: null });
      paramsWrap.innerHTML = "";
      return;
    }
    const base = behavior && behavior.type === type ? behavior : { type };
    saveElementMeta(path, { behavior: base });
    renderParams();
  });
  renderParams();

  if (behavior) {
    const info = el("div", "el-link-info");
    const label = ELEMENT_BEHAVIOR_TYPES.find(([v]) => v === behavior.type);
    info.textContent = `${label ? label[1] : behavior.type} · ${t("behaviorPlayHint")}`;
    section.appendChild(info);
  }

  // 取消元素选择：回到组件级
  const backBtn = el("button", "el-clear-element", t("elementBack"));
  backBtn.type = "button";
  backBtn.addEventListener("click", () => {
    selectedElementPath = null;
    applyElementSelectionHighlight();
    renderInspector();
  });
  section.appendChild(backBtn);

  panel.appendChild(section);
}

let inspectorCodeFormat = "html";

async function renderInspectorCode(panel, comp) {
  panel.innerHTML = "";
  const toolbar = el("div", "inspector-code-toolbar");
  ["html", "react", "css"].forEach((fmt) => {
    const btn = el("button", "inspector-code-fmt" + (fmt === inspectorCodeFormat ? " active" : ""), fmt);
    btn.type = "button";
    btn.addEventListener("click", () => {
      inspectorCodeFormat = fmt;
      renderInspectorCode(panel, comp);
    });
    toolbar.appendChild(btn);
  });
  const copyBtn = el("button", "inspector-copy-btn", t("copyCode"));
  copyBtn.type = "button";
  copyBtn.disabled = true;
  toolbar.appendChild(copyBtn);
  panel.appendChild(toolbar);

  const pre = el("pre", "inspector-code");
  pre.textContent = t("codeLoading");
  panel.appendChild(pre);

  try {
    const res = await fetch(
      `/api/component/${encodeURIComponent(comp.id)}/code?format=${encodeURIComponent(inspectorCodeFormat)}`
    );
    if (!res.ok) {
      pre.textContent = t("codeEmpty");
      return;
    }
    const data = await res.json();
    pre.textContent = data.code || t("codeEmpty");
    copyBtn.disabled = false;
    copyBtn.addEventListener("click", () => {
      copyToClipboard(data.code || "");
      flashButton(copyBtn, t("codeCopied"), 1200);
    });
  } catch (err) {
    console.error("Inspect code failed:", err);
    pre.textContent = t("codeEmpty");
  }
}

function sendSetAnimation(id, patch) {
  send({ type: "set_animation", component_id: id, ...patch });
}

function renderLayerPanel() {
  const list = $("layer-tree");
  if (!list) return;
  const components = getCurrentComponents();
  if (components.length === 0) {
  list.innerHTML = `<div class="layer-empty">${t("layerEmpty")}</div>`;
    return;
  }
  list.innerHTML = "";
  // 递归渲染：子组件以缩进层级显示，也可选中/重命名/删除（自由编辑补缺）。
  const renderItem = (comp, depth) => {
    const item = el("div", "layer-item" + (selectedIds.includes(comp.id) ? " selected" : ""));
    item.dataset.id = comp.id;
    if (depth > 0) item.style.paddingLeft = `${8 + depth * 14}px`;
    item.appendChild(el("span", "layer-icon", depth > 0 ? "↳" : "◈"));
    const nameSpan = el("span", "layer-name", comp.name || `${comp.type}${comp.variant ? "/" + comp.variant : ""}`);
    nameSpan.title = t("layerRenameHint");
    item.appendChild(nameSpan);
    // 图层重命名 (精确编辑 P0): double-click the name to rename inline.
    attachLayerRenameDoubleClick(nameSpan, comp.id);
    // Drag to reorder layers (top-level stacking, 精确编辑 P0)
    item.draggable = true;
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", comp.id);
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      item.classList.add("drop-target");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drop-target"));
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drop-target");
      const fromId = e.dataTransfer.getData("text/plain");
      if (!fromId || fromId === comp.id) return;
      send({
        type: "reorder_component",
        fromId,
        toId: comp.id,
        position: "before",
      });
    });
    const del = el("button", "layer-del", "✕");
  del.title = t("deleteComponent");
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteComponent(comp.id);
      if (selectedComponentId === comp.id) deselectAll();
    });
    item.appendChild(del);
    list.appendChild(item);
    if (comp.children && comp.children.length > 0) {
      [...comp.children].reverse().forEach((child) => renderItem(child, depth + 1));
    }
  };
  [...components].reverse().forEach((comp) => renderItem(comp, 0));
}

// 图层重命名 (精确编辑 P0): double-click the name (delegated — the first click
// re-renders the layer panel, so a raw dblclick target would be destroyed).
let layerLastClickId = null;
let layerLastClickAt = 0;

function attachLayerRenameDoubleClick(nameSpan, compId) {
  nameSpan.addEventListener("click", (e) => {
    e.stopPropagation();
    const now = Date.now();
    if (layerLastClickId === compId && now - layerLastClickAt < 350) {
      layerLastClickId = null;
      startLayerRename(nameSpan, compId);
    } else {
      layerLastClickId = compId;
      layerLastClickAt = now;
      selectComponent(compId, e.shiftKey || e.ctrlKey || e.metaKey);
    }
  });
}

// 图层重命名 (精确编辑 P0): swap the name span for an input, commit on Enter/blur.
function startLayerRename(nameSpan, compId) {
  const input = el("input", "layer-rename-input");
  input.type = "text";
  input.value = nameSpan.textContent;
  input.maxLength = 60;
  input.spellcheck = false;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const name = input.value.trim();
    send({ type: "rename_component", id: compId, name });
    // Optimistic local update; full state refresh follows via WS broadcast.
    const comp = getCompById(compId);
    if (comp) {
      if (name) comp.name = name;
      else delete comp.name;
    }
    renderLayerPanel();
  };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.removeEventListener("blur", commit);
      renderLayerPanel();
    }
  });
}

function setupZoom() {
  const zoomOut = $("zoom-out");
  const zoomIn = $("zoom-in");
  const reset = $("zoom-reset");
  const fit = $("zoom-fit");
  const apply = (z) => {
    canvasZoom = Math.max(25, Math.min(200, z));
    const valueEl = $("zoom-value");
    if (valueEl) valueEl.textContent = canvasZoom + "%";
    const wrap = $("canvas-scroll-wrap");
    if (wrap) wrap.style.zoom = canvasZoom / 100;
    // 标尺刻度跟随缩放
    renderRulers();
  };
  const fitCanvas = () => {
    const wrap = $("canvas-scroll-wrap");
    const frame = $("canvas-frame") || $("canvas");
    if (!wrap || !frame) return;
    const cw = wrap.clientWidth;
    const fw = frame.scrollWidth || frame.offsetWidth || cw;
    if (cw > 0 && fw > 0) {
      apply(Math.round((cw / fw) * 100));
    }
  };
  if (zoomOut) zoomOut.addEventListener("click", () => apply(canvasZoom - 10));
  if (zoomIn) zoomIn.addEventListener("click", () => apply(canvasZoom + 10));
  if (reset) reset.addEventListener("click", () => apply(100));
  if (fit) fit.addEventListener("click", fitCanvas);
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "=" || e.key === "+") { e.preventDefault(); apply(canvasZoom + 10); }
    else if (e.key === "-") { e.preventDefault(); apply(canvasZoom - 10); }
    else if (e.key === "0" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); apply(100); }
  });
  apply(100);
}

function setupCanvasShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "SELECT" ||
      e.target.tagName === "TEXTAREA" ||
      e.target.contentEditable === "true"
    ) {
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && (selectedComponentId || selectedIds.length > 0)) {
      e.preventDefault();
      const comps = getSelectedComps();
      if (comps.length === 0) return;
      if (comps.length === 1) {
        handleDeleteComponent(comps[0].id);
      } else {
        comps.forEach((c) => handleDeleteComponent(c.id));
      }
      deselectAll();
    }
    // Ctrl+D duplicates the selected component (Pixso/Figma convention).
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selectedComponentId) {
      e.preventDefault();
      duplicateSelected(selectedComponentId);
    }
  });
}

// ===== Inline Property Editing =====

function setupInlineEditing(wrapper, compId) {
  const editables = wrapper.querySelectorAll("[data-editable='true']");
  // Only handle direct (non-nested) editable elements to avoid double-binding
  editables.forEach((elm) => {
    // Skip if this element is inside a nested comp-wrapper
    if (elm.closest(".comp-wrapper") !== wrapper) return;

    elm.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      elm.contentEditable = "true";
      elm.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(elm);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    const commitEdit = () => {
      elm.contentEditable = "false";
      const newValue = elm.textContent.trim();
      const prop = elm.getAttribute("data-prop");
      if (!prop) return;
      // 支持点路径（如 "items.0.title"）：更新嵌套数组内的字段。
      if (prop.includes(".")) {
        const comp = getCompById(compId);
        if (!comp) return;
        const parts = prop.split(".");
        let cursor = comp.props;
        for (let i = 0; i < parts.length - 1; i++) {
          const key = parts[i];
          const idx = /^\d+$/.test(key) ? parseInt(key, 10) : key;
          if (cursor == null) return;
          cursor = cursor[idx];
        }
        if (cursor == null) return;
        const leafKey = parts[parts.length - 1];
        cursor[leafKey] = newValue;
        send({
          type: "update_component",
          id: compId,
          props: JSON.parse(JSON.stringify(comp.props)),
        });
        return;
      }
      send({
        type: "update_component",
        id: compId,
        props: { [prop]: newValue },
      });
    };

    elm.addEventListener("blur", commitEdit);

    elm.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        elm.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        elm.blur();
      }
    });
  });
}

// ===== Drag & Drop for Component Reorder =====

function attachDragHandlers(wrapper, compId, dragHandle) {
  // Use drag handle for initiating drag, not the entire wrapper
  // This allows text editing (dblclick) to work on content elements
  const dragSource = dragHandle || wrapper;
  if (dragHandle) {
    dragHandle.addEventListener("dragstart", (e) => {
      draggedComponentId = compId;
      wrapper.classList.add("dragging");
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", compId); } catch (err) {}
    });

    dragHandle.addEventListener("dragend", () => {
      wrapper.classList.remove("dragging");
      clearDragIndicators();
      draggedComponentId = null;
    });
  }

  // Allow drop on this wrapper for reorder
  wrapper.addEventListener("dragover", (e) => {
    // Only handle if this is a component reorder drag (not a library drag)
    if (!draggedComponentId) return;
    if (draggedComponentId === compId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    wrapper.classList.add("drag-over");

    const rect = wrapper.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    clearDragIndicators(wrapper);
    const indicator = el("div", "drag-indicator");
    if (e.clientY < midY) {
      indicator.classList.add("top");
    } else {
      indicator.classList.add("bottom");
    }
    wrapper.appendChild(indicator);
  });

  wrapper.addEventListener("dragleave", (e) => {
    wrapper.classList.remove("drag-over");
    clearDragIndicators(wrapper);
  });

  wrapper.addEventListener("drop", (e) => {
    // Only handle component reorder, not library drags
    if (!draggedComponentId) {
      // Library drag — let it bubble to canvas
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    wrapper.classList.remove("drag-over");

    if (draggedComponentId === compId) {
      clearDragIndicators();
      return;
    }

    const rect = wrapper.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? "before" : "after";

    send({
      type: "reorder_component",
      fromId: draggedComponentId,
      toId: compId,
      position: position,
    });

    clearDragIndicators();
    draggedComponentId = null;
  });
}

function clearDragIndicators(scope) {
  const root = scope || document;
  const indicators = root.querySelectorAll(".drag-indicator");
  indicators.forEach((ind) => ind.remove());
  const over = document.querySelectorAll(".comp-wrapper.drag-over");
  over.forEach((w) => w.classList.remove("drag-over"));
}

