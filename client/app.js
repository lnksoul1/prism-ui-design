/**
 * Prism Dashboard — Client Application
 *
 * Handles WebSocket communication with the MCP server,
 * renders the real-time design canvas, and sends user
 * adjustments back to the server.
 */

// ===== Global State =====

let ws = null;
let currentState = null;
let activeTokenTab = "colors";
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;
const RECONNECT_DELAY = 3000;

// New feature state
let currentDevice = "desktop";
let draggedComponentId = null;
let currentExportFormat = "html";
let conflictCheckInterval = null;

// ===== DOM Helpers =====

function $(id) {
  return document.getElementById(id);
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ===== WebSocket Connection =====

function connect() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    reconnectAttempts = 0;
    updateStatus("connected");
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = () => {
    updateStatus("disconnected");
    if (reconnectAttempts < MAX_RECONNECT) {
      reconnectAttempts++;
      setTimeout(connect, RECONNECT_DELAY);
    }
  };

  ws.onerror = () => {
    updateStatus("disconnected");
  };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function updateStatus(status) {
  const dot = $("ws-status");
  const text = $("ws-status-text");
  if (status === "connected") {
    dot.className = "status-dot connected";
    text.textContent = "已连接";
  } else if (status === "disconnected") {
    dot.className = "status-dot disconnected";
    text.textContent = "已断开";
  } else {
    dot.className = "status-dot";
    text.textContent = "连接中";
  }
}

// ===== Message Handler =====

function handleMessage(msg) {
  switch (msg.type) {
    case "init":
      currentState = msg.state;
      renderAll();
      break;
    case "change":
      currentState = msg.state;
      handleChange(msg.change);
      break;
    case "activity":
      addActivityEntry(msg.entry);
      break;
  }
}

function handleChange(change) {
  switch (change.type) {
    case "projectName":
      $("project-name").textContent = change.value;
      break;
    case "style":
      $("style-badge").textContent = change.value;
      break;
    case "token":
      renderTokenPanel();
      applyTokensToCanvas();
      checkConflicts();
      break;
    case "tokenBatch":
      renderTokenPanel();
      applyTokensToCanvas();
      checkConflicts();
      break;
    case "addComponent":
    case "updateComponent":
    case "removeComponent":
    case "reorderComponent":
    case "reorder_component":
      renderCanvas();
      break;
    case "setAnimation":
      renderCanvas();
      break;
    case "clearAll":
      renderAll();
      break;
    // New: undo/redo
    case "undo":
    case "redo":
      updateUndoRedoButtons();
      renderCanvas();
      break;
    // New: page management
    case "addPage":
    case "switchPage":
    case "removePage":
    case "renamePage":
      renderPageSwitcher();
      renderCanvas();
      break;
    // New: theme
    case "setTheme":
      applyTheme();
      break;
    default:
      // Unknown change types: re-render canvas to be safe
      renderCanvas();
      break;
  }
  // Always refresh undo/redo availability after any change
  updateUndoRedoButtons();
}

// ===== Full Render =====

function renderAll() {
  if (!currentState) return;

  // Header
  $("project-name").textContent = currentState.projectName || "Untitled";
  $("style-badge").textContent = currentState.style || "--";

  // Pages
  renderPageSwitcher();

  // Canvas
  renderCanvas();

  // Tokens
  renderTokenPanel();

  // Activity log
  renderActivityLog();

  // Apply token CSS variables
  applyTokensToCanvas();

  // Apply theme
  applyTheme();

  // Update undo/redo buttons
  updateUndoRedoButtons();

  // Check conflicts
  checkConflicts();
}

// Helper: get current page's components (with backward compat)
function getCurrentComponents() {
  if (!currentState) return [];
  // New multi-page structure
  if (currentState.pages && Array.isArray(currentState.pages)) {
    const page = currentState.pages.find((p) => p.id === currentState.currentPageId);
    if (page) return page.components || [];
    // fallback to first page
    if (currentState.pages.length > 0) return currentState.pages[0].components || [];
    return [];
  }
  // Legacy single-page structure
  return currentState.components || [];
}

// ===== Canvas Rendering =====

function renderCanvas() {
  const canvas = $("canvas");
  const meta = $("canvas-meta");

  const components = getCurrentComponents();

  if (!currentState || components.length === 0) {
    canvas.innerHTML = `
      <div class="canvas-placeholder">
        <div class="placeholder-icon">🎨</div>
        <p>等待 AI Agent 创建设计...</p>
        <p class="placeholder-hint">AI 会通过 MCP 工具调用在此画布上构建 UI</p>
        <p class="placeholder-hint">你的调整会实时同步回 AI</p>
      </div>
    `;
    meta.textContent = "0 个组件";
    // Apply device class even on placeholder
    applyDeviceClass(canvas);
    return;
  }

  canvas.innerHTML = "";
  applyDeviceClass(canvas);
  const count = countComponents(components);
  meta.textContent = `${count} 个组件`;

  components.forEach((comp) => {
    canvas.appendChild(renderComponent(comp));
  });
}

// Apply device width class to canvas
function applyDeviceClass(canvas) {
  canvas.classList.remove("device-desktop", "device-tablet", "device-mobile");
  canvas.classList.add(`device-${currentDevice}`);
}

function countComponents(components) {
  let count = 0;
  for (const comp of components) {
    count++;
    if (comp.children) count += countComponents(comp.children);
  }
  return count;
}

function renderComponent(comp) {
  const wrapper = el("div", "comp-wrapper");
  wrapper.dataset.id = comp.id;
  // Make draggable for reorder
  wrapper.draggable = true;

  // Overlay with badge and delete button
  const overlay = el("div", "comp-overlay");
  const badge = el("span", "comp-badge", `${comp.type}${comp.variant ? "/" + comp.variant : ""}`);
  overlay.appendChild(badge);

  const deleteBtn = el("button", "comp-delete", "删除");
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleDeleteComponent(comp.id);
  });
  overlay.appendChild(deleteBtn);

  wrapper.appendChild(overlay);

  // Render the actual component
  const content = renderComponentContent(comp);
  if (content) wrapper.appendChild(content);

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

  // Attach drag & drop handlers
  attachDragHandlers(wrapper, comp.id);

  // Setup inline editing for data-editable elements
  setupInlineEditing(wrapper, comp.id);

  return wrapper;
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
      if (prop) {
        send({
          type: "update_component",
          id: compId,
          props: { [prop]: newValue },
        });
      }
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

function attachDragHandlers(wrapper, compId) {
  // Don't make nested children draggable targets separately if they're inside a parent
  wrapper.addEventListener("dragstart", (e) => {
    draggedComponentId = compId;
    wrapper.classList.add("dragging");
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", compId); } catch (err) {}
  });

  wrapper.addEventListener("dragend", () => {
    wrapper.classList.remove("dragging");
    clearDragIndicators();
    draggedComponentId = null;
  });

  wrapper.addEventListener("dragover", (e) => {
    if (!draggedComponentId || draggedComponentId === compId) return;
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
    e.preventDefault();
    e.stopPropagation();
    wrapper.classList.remove("drag-over");

    if (!draggedComponentId || draggedComponentId === compId) {
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

function renderComponentContent(comp) {
  const props = comp.props || {};
  const variant = comp.variant || "";

  switch (comp.type) {
    case "hero":
      return renderHero(props, variant);
    case "navbar":
      return renderNavbar(props, variant);
    case "card_grid":
      return renderCardGrid(props, variant);
    case "card":
      return renderCard(props, variant);
    case "cta":
      return renderCta(props, variant);
    case "footer":
      return renderFooter(props);
    case "text_section":
      return renderTextSection(props);
    case "feature_list":
      return renderFeatureList(props);
    case "button":
      return renderButton(props, variant);
    case "stats":
      return renderStats(props);
    case "pricing":
      return renderPricing(props, variant);
    case "testimonial":
      return renderTestimonial(props);
    case "banner":
      return renderBanner(props);
    case "timeline":
      return renderTimeline(props);
    case "faq":
      return renderFaq(props);
    case "form":
      return renderForm(props);
    case "image":
      return renderImage(props);
    // New component types
    case "tabs":
      return renderTabs(props);
    case "accordion":
      return renderAccordion(props);
    case "carousel":
      return renderCarousel(props);
    case "modal":
      return renderModalComponent(props);
    case "sidebar":
      return renderSidebar(props);
    case "breadcrumb":
      return renderBreadcrumb(props);
    case "pagination":
      return renderPagination(props);
    case "progress":
      return renderProgress(props, variant);
    case "badge":
      return renderBadge(props, variant);
    case "avatar":
      return renderAvatar(props);
    default:
      return renderGeneric(comp);
  }
}

// ===== Component Renderers =====

// Helper: create an inline-editable text element
function editableText(tag, className, text, prop) {
  const e = el(tag, className, text);
  e.setAttribute("data-editable", "true");
  e.setAttribute("data-prop", prop);
  return e;
}

function renderHero(props, variant) {
  const div = el("div", "comp-hero");
  if (variant === "split") {
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "32px";
    div.style.textAlign = "left";
  }

  const content = el("div");
  content.style.flex = "1";

  if (props.title) {
    content.appendChild(editableText("h1", null, props.title, "title"));
  }
  if (props.subtitle) {
    content.appendChild(editableText("p", null, props.subtitle, "subtitle"));
  }
  if (props.button_text) {
    const btn = el("div", "btn", props.button_text);
    content.appendChild(btn);
  }
  div.appendChild(content);

  if (variant === "split" && props.image_url) {
    const img = el("div");
    img.style.cssText = `flex:1;height:200px;border-radius:12px;background:url('${props.image_url}') center/cover;`;
    div.appendChild(img);
  }

  return div;
}

function renderNavbar(props, variant) {
  const nav = el("div", "comp-navbar");
  const brand = editableText("span", "nav-brand", props.brand || "Logo", "brand");
  nav.appendChild(brand);

  const links = el("div", "nav-links");
  const items = props.links || ["Home", "About", "Services", "Contact"];
  if (Array.isArray(items)) {
    items.forEach((item) => {
      const link = typeof item === "string" ? item : (item.label || item.text || "");
      links.appendChild(el("span", null, link));
    });
  }
  nav.appendChild(links);

  if (variant === "with_cta" && props.cta_text) {
    const cta = el("span", "btn", props.cta_text);
    cta.style.cssText = "padding:6px 16px;font-size:13px;border-radius:6px;";
    nav.appendChild(cta);
  }

  return nav;
}

function renderCardGrid(props, variant) {
  const grid = el("div", "comp-card-grid");
  const cols = variant.includes("2") ? "cols-2" : variant.includes("4") ? "cols-4" : "cols-3";
  grid.classList.add(cols);

  const items = props.items || [];
  const count = cols === "cols-2" ? 2 : cols === "cols-4" ? 4 : 3;

  for (let i = 0; i < Math.max(items.length, count); i++) {
    const item = items[i] || {};
    const card = renderCard(item, "product");
    grid.appendChild(card);
  }

  return grid;
}

function renderCard(props, variant) {
  const card = el("div", "comp-card");

  if (props.image_url || props.image) {
    const img = el("div", "card-img");
    img.style.background = `url('${props.image_url || props.image}') center/cover`;
    card.appendChild(img);
  }

  if (props.title) {
    card.appendChild(el("div", "card-title", props.title));
  }
  if (props.description || props.desc) {
    card.appendChild(el("div", "card-desc", props.description || props.desc));
  }
  if (props.price) {
    card.appendChild(el("div", "card-price", props.price));
  }
  if (props.button_text) {
    const btn = el("div", "btn", props.button_text);
    btn.style.cssText = "padding:6px 16px;font-size:12px;border-radius:6px;margin-top:8px;display:inline-block;";
    card.appendChild(btn);
  }

  return card;
}

function renderCta(props, variant) {
  const cta = el("div", "comp-cta");
  if (props.title) cta.appendChild(editableText("h2", null, props.title, "title"));
  if (props.subtitle || props.text) cta.appendChild(editableText("p", null, props.subtitle || props.text, "subtitle"));
  if (props.button_text) {
    const btn = el("div", "btn", props.button_text);
    cta.appendChild(btn);
  }
  return cta;
}

function renderFooter(props) {
  const footer = el("div", "comp-footer");
  const text = props.text || props.copyright || "© 2024 All rights reserved.";
  footer.appendChild(el("p", null, text));
  if (props.links && Array.isArray(props.links)) {
    const linksDiv = el("div");
    linksDiv.style.cssText = "display:flex;gap:16px;justify-content:center;margin-top:8px;";
    props.links.forEach((link) => {
      linksDiv.appendChild(el("span", null, typeof link === "string" ? link : (link.label || "")));
    });
    footer.appendChild(linksDiv);
  }
  return footer;
}

function renderTextSection(props) {
  const section = el("div", "comp-text-section");
  if (props.title) section.appendChild(editableText("h2", null, props.title, "title"));
  if (props.text || props.body) section.appendChild(editableText("p", null, props.text || props.body, "text"));
  return section;
}

function renderFeatureList(props) {
  const list = el("div", "comp-feature-list");
  const items = props.items || [];
  items.forEach((item) => {
    const feature = el("div", "comp-feature-item");
    const icon = el("div", "feature-icon", item.icon || "✦");
    feature.appendChild(icon);
    const text = el("div");
    text.style.flex = "1";
    if (item.title) text.appendChild(el("div", "card-title", item.title));
    if (item.description) text.appendChild(el("div", "card-desc", item.description));
    feature.appendChild(text);
    list.appendChild(feature);
  });
  return list;
}

function renderButton(props, variant) {
  const btn = el("div", "comp-button", props.text || props.label || "Button");
  if (variant === "secondary") {
    btn.style.background = "transparent";
    btn.style.border = "2px solid currentColor";
  } else if (variant === "ghost") {
    btn.style.background = "transparent";
    btn.style.color = "currentColor";
  }
  return btn;
}

function renderStats(props) {
  const container = el("div");
  container.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;padding:24px;border-radius:10px;";
  const items = props.items || [];
  items.forEach((item) => {
    const stat = el("div");
    stat.style.cssText = "text-align:center;padding:16px;border-radius:8px;";
    stat.appendChild(el("div", null, ""));
    const num = stat.firstChild;
    num.style.cssText = "font-size:28px;font-weight:700;margin-bottom:4px;";
    num.textContent = item.value || "0";
    const label = el("div", null, item.label || "");
    label.style.cssText = "font-size:11px;opacity:0.7;";
    stat.appendChild(label);
    container.appendChild(stat);
  });
  return container;
}

function renderPricing(props, variant) {
  const grid = el("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;";
  const plans = props.plans || [];
  plans.forEach((plan) => {
    const card = el("div", "comp-card");
    if (plan.featured) {
      card.style.cssText = "border:2px solid var(--accent);position:relative;";
    }
    if (plan.name) card.appendChild(el("div", "card-title", plan.name));
    if (plan.price) {
      const price = el("div", "card-price", plan.price);
      price.style.fontSize = "24px";
      card.appendChild(price);
    }
    if (plan.features && Array.isArray(plan.features)) {
      const features = el("div");
      features.style.cssText = "margin-top:8px;";
      plan.features.forEach((f) => {
        const item = el("div", "card-desc", `✓ ${f}`);
        features.appendChild(item);
      });
      card.appendChild(features);
    }
    if (plan.button_text) {
      const btn = el("div", "btn", plan.button_text);
      btn.style.cssText = "padding:8px 20px;font-size:13px;border-radius:6px;margin-top:12px;text-align:center;";
      card.appendChild(btn);
    }
    grid.appendChild(card);
  });
  return grid;
}

function renderTestimonial(props) {
  const container = el("div");
  container.style.cssText = "padding:24px;border-radius:10px;";
  if (props.quote) {
    const quote = el("p", null, `"${props.quote}"`);
    quote.style.cssText = "font-size:15px;line-height:1.8;font-style:italic;margin-bottom:12px;";
    container.appendChild(quote);
  }
  const author = el("div");
  author.style.cssText = "display:flex;align-items:center;gap:12px;";
  if (props.avatar) {
    const avatar = el("div");
    avatar.style.cssText = `width:40px;height:40px;border-radius:50%;background:url('${props.avatar}') center/cover;`;
    author.appendChild(avatar);
  }
  const info = el("div");
  if (props.author) info.appendChild(el("div", "card-title", props.author));
  if (props.role) info.appendChild(el("div", "card-desc", props.role));
  author.appendChild(info);
  container.appendChild(author);
  return container;
}

function renderBanner(props) {
  const banner = el("div");
  banner.style.cssText = "padding:16px 24px;border-radius:8px;text-align:center;";
  if (props.text) {
    const text = el("span", null, props.text);
    text.style.fontSize = "14px";
    banner.appendChild(text);
  }
  if (props.button_text) {
    const btn = el("span", "btn", props.button_text);
    btn.style.cssText = "margin-left:12px;padding:4px 12px;font-size:12px;border-radius:4px;";
    banner.appendChild(btn);
  }
  return banner;
}

function renderTimeline(props) {
  const timeline = el("div");
  timeline.style.cssText = "padding:24px;";
  const items = props.items || [];
  items.forEach((item, i) => {
    const entry = el("div");
    entry.style.cssText = `display:flex;gap:16px;padding-bottom:16px;${i < items.length - 1 ? "border-left:2px solid var(--border);margin-left:8px;padding-left:16px;" : "padding-left:18px;"}`;
    const dot = el("div");
    dot.style.cssText = "width:12px;height:12px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:4px;margin-left:-22px;";
    entry.appendChild(dot);
    const content = el("div");
    content.style.flex = "1";
    if (item.date) {
      const date = el("div", "card-desc", item.date);
      date.style.fontFamily = "var(--mono)";
      content.appendChild(date);
    }
    if (item.title) content.appendChild(el("div", "card-title", item.title));
    if (item.description) content.appendChild(el("div", "card-desc", item.description));
    entry.appendChild(content);
    timeline.appendChild(entry);
  });
  return timeline;
}

function renderFaq(props) {
  const container = el("div");
  container.style.cssText = "padding:24px;display:flex;flex-direction:column;gap:8px;";
  const items = props.items || [];
  items.forEach((item) => {
    const qa = el("div");
    qa.style.cssText = "padding:12px;border-radius:8px;";
    if (item.question) {
      const q = el("div", "card-title", item.question);
      q.style.marginBottom = "4px";
      qa.appendChild(q);
    }
    if (item.answer) qa.appendChild(el("div", "card-desc", item.answer));
    container.appendChild(qa);
  });
  return container;
}

function renderForm(props) {
  const form = el("div");
  form.style.cssText = "padding:24px;border-radius:10px;";
  const fields = props.fields || [];
  fields.forEach((field) => {
    const wrapper = el("div");
    wrapper.style.cssText = "margin-bottom:12px;";
    if (field.label) {
      const label = el("label", null, field.label);
      label.style.cssText = "display:block;font-size:12px;margin-bottom:4px;";
      wrapper.appendChild(label);
    }
    const input = el("input");
    input.type = field.type || "text";
    input.placeholder = field.placeholder || "";
    input.style.cssText = "width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;";
    wrapper.appendChild(input);
    form.appendChild(wrapper);
  });
  if (props.button_text) {
    const btn = el("button", "btn", props.button_text);
    btn.style.cssText = "padding:10px 24px;border:none;border-radius:6px;font-weight:600;cursor:pointer;margin-top:8px;";
    form.appendChild(btn);
  }
  return form;
}

function renderImage(props) {
  const wrapper = el("div");
  wrapper.style.cssText = "border-radius:10px;overflow:hidden;";
  if (props.src || props.url) {
    const img = el("img");
    img.src = props.src || props.url;
    img.style.cssText = "width:100%;display:block;border-radius:10px;";
    img.alt = props.alt || "";
    wrapper.appendChild(img);
  }
  return wrapper;
}

// ===== New Component Renderers =====

function renderTabs(props) {
  const container = el("div", "comp-tabs");
  const items = props.items || props.tabs || [];
  const nav = el("div", "tabs-nav");
  const content = el("div", "tab-content");

  if (items.length === 0) {
    nav.appendChild(el("button", "tab-item active", "Tab 1"));
    content.textContent = "暂无内容";
  } else {
    items.forEach((item, i) => {
      const label = typeof item === "string" ? item : (item.label || item.title || `Tab ${i + 1}`);
      const tabBtn = el("button", "tab-item" + (i === 0 ? " active" : ""), label);
      const body = typeof item === "string" ? item : (item.content || item.body || "");
      tabBtn.addEventListener("click", () => {
        nav.querySelectorAll(".tab-item").forEach((t) => t.classList.remove("active"));
        tabBtn.classList.add("active");
        content.textContent = body;
      });
      nav.appendChild(tabBtn);
      if (i === 0) content.textContent = body;
    });
  }
  container.appendChild(nav);
  container.appendChild(content);
  return container;
}

function renderAccordion(props) {
  const container = el("div", "comp-accordion");
  const items = props.items || [];
  if (items.length === 0) {
    const item = el("div", "acc-item open");
    const header = el("div", "acc-header");
    header.appendChild(el("span", null, "Section 1"));
    header.appendChild(el("span", "acc-arrow", "▶"));
    const body = el("div", "acc-body", "暂无内容");
    item.appendChild(header);
    item.appendChild(body);
    container.appendChild(item);
  } else {
    items.forEach((itemData, i) => {
      const item = el("div", "acc-item" + (i === 0 ? " open" : ""));
      const header = el("div", "acc-header");
      header.appendChild(el("span", null, itemData.title || itemData.question || `Section ${i + 1}`));
      header.appendChild(el("span", "acc-arrow", "▶"));
      const body = el("div", "acc-body", itemData.content || itemData.answer || itemData.description || "");
      header.addEventListener("click", () => {
        item.classList.toggle("open");
      });
      item.appendChild(header);
      item.appendChild(body);
      container.appendChild(item);
    });
  }
  return container;
}

function renderCarousel(props) {
  const container = el("div", "comp-carousel");
  const slides = props.slides || props.items || [];
  const track = el("div", "carousel-track");
  let currentIndex = 0;

  const slideData = slides.length > 0 ? slides : [
    { title: "Slide 1", text: "第一张幻灯片" },
    { title: "Slide 2", text: "第二张幻灯片" },
    { title: "Slide 3", text: "第三张幻灯片" },
  ];

  slideData.forEach((s) => {
    const slide = el("div", "carousel-slide");
    if (s.title) slide.appendChild(el("h3", null, s.title));
    if (s.text || s.description) slide.appendChild(el("p", null, s.text || s.description));
    track.appendChild(slide);
  });
  container.appendChild(track);

  const prevBtn = el("button", "carousel-btn prev", "‹");
  const nextBtn = el("button", "carousel-btn next", "›");
  container.appendChild(prevBtn);
  container.appendChild(nextBtn);

  const dots = el("div", "carousel-dots");
  slideData.forEach((_, i) => {
    const dot = el("button", "carousel-dot" + (i === 0 ? " active" : ""));
    dot.addEventListener("click", () => goToSlide(i));
    dots.appendChild(dot);
  });
  container.appendChild(dots);

  function goToSlide(index) {
    currentIndex = index;
    track.style.transform = `translateX(-${currentIndex * 100}%)`;
    dots.querySelectorAll(".carousel-dot").forEach((d, i) => {
      d.classList.toggle("active", i === currentIndex);
    });
  }

  prevBtn.addEventListener("click", () => {
    goToSlide((currentIndex - 1 + slideData.length) % slideData.length);
  });
  nextBtn.addEventListener("click", () => {
    goToSlide((currentIndex + 1) % slideData.length);
  });

  return container;
}

function renderModalComponent(props) {
  const container = el("div", "comp-modal-preview");
  const mask = el("div", "modal-mask");
  container.appendChild(mask);

  const card = el("div", "modal-card");
  if (props.title) card.appendChild(el("h3", null, props.title));
  if (props.text || props.body || props.description) {
    card.appendChild(el("p", null, props.text || props.body || props.description));
  }
  const actions = el("div", "modal-actions");
  const cancelBtn = el("button", "btn-copy");
  cancelBtn.style.cssText = "background:var(--surface-hover);color:var(--text);";
  cancelBtn.textContent = props.cancel_text || "取消";
  const confirmBtn = el("button", "btn-copy", props.confirm_text || "确定");
  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  card.appendChild(actions);
  container.appendChild(card);

  return container;
}

function renderSidebar(props) {
  const container = el("div", "comp-sidebar");
  if (props.title) {
    container.appendChild(el("div", "sidebar-title", props.title));
  }
  const links = props.links || props.items || [
    { label: "Dashboard", icon: "📊" },
    { label: "Projects", icon: "📁" },
    { label: "Settings", icon: "⚙️" },
  ];
  links.forEach((link, i) => {
    const label = typeof link === "string" ? link : (link.label || link.text || "");
    const icon = typeof link === "string" ? "•" : (link.icon || "•");
    const linkEl = el("div", "sidebar-link" + (i === 0 ? " active" : ""));
    linkEl.appendChild(el("span", "link-icon", icon));
    linkEl.appendChild(el("span", null, label));
    linkEl.addEventListener("click", () => {
      container.querySelectorAll(".sidebar-link").forEach((l) => l.classList.remove("active"));
      linkEl.classList.add("active");
    });
    container.appendChild(linkEl);
  });
  return container;
}

function renderBreadcrumb(props) {
  const container = el("div", "comp-breadcrumb");
  const items = props.items || props.crumbs || ["Home", "Category", "Current"];
  items.forEach((item, i) => {
    const label = typeof item === "string" ? item : (item.label || item.text || "");
    const isLast = i === items.length - 1;
    const crumb = el("span", "crumb" + (isLast ? " current" : ""), label);
    container.appendChild(crumb);
    if (!isLast) {
      container.appendChild(el("span", "crumb-sep", "/"));
    }
  });
  return container;
}

function renderPagination(props) {
  const container = el("div", "comp-pagination");
  const total = props.total || props.totalPages || 5;
  const current = props.current || props.currentPage || 1;

  const prevBtn = el("button", "page-btn", "‹");
  prevBtn.disabled = current <= 1;
  container.appendChild(prevBtn);

  for (let i = 1; i <= total; i++) {
    // Show ellipsis for large page counts
    if (total > 7 && i > 3 && i < total - 1) {
      if (i === 4) container.appendChild(el("span", "page-ellipsis", "…"));
      continue;
    }
    const btn = el("button", "page-btn" + (i === current ? " active" : ""), String(i));
    btn.addEventListener("click", () => {
      container.querySelectorAll(".page-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
    container.appendChild(btn);
  }

  const nextBtn = el("button", "page-btn", "›");
  nextBtn.disabled = current >= total;
  container.appendChild(nextBtn);

  return container;
}

function renderProgress(props, variant) {
  const container = el("div", "comp-progress");
  const label = el("div", "progress-label");
  const labelText = props.label || "Progress";
  const value = props.value !== undefined ? props.value : (props.percent !== undefined ? props.percent : 50);
  label.appendChild(el("span", null, labelText));
  label.appendChild(el("span", null, value + "%"));
  container.appendChild(label);

  const track = el("div", "progress-track");
  const fill = el("div", "progress-fill");
  if (variant === "striped" || props.striped) fill.classList.add("striped");
  fill.style.width = Math.min(100, Math.max(0, value)) + "%";
  track.appendChild(fill);
  container.appendChild(track);

  return container;
}

function renderBadge(props, variant) {
  const v = variant || props.variant || "default";
  const badge = el("span", "comp-badge variant-" + v);
  if (props.icon) badge.appendChild(el("span", null, props.icon + " "));
  badge.appendChild(document.createTextNode(props.text || props.label || "Badge"));
  return badge;
}

function renderAvatar(props) {
  const container = el("div", "comp-avatar-group");
  const avatars = props.avatars || props.items || [];
  const max = props.max || 5;
  const colors = ["#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#EC4899"];

  if (avatars.length === 0) {
    // Default avatars
    const names = ["AB", "CD", "EF"];
    names.forEach((name, i) => {
      const av = el("div", "comp-avatar", name);
      av.style.background = colors[i % colors.length];
      container.appendChild(av);
    });
  } else {
    const shown = avatars.slice(0, max);
    shown.forEach((av, i) => {
      const name = typeof av === "string" ? av : (av.name || av.label || "?");
      const initials = name.substring(0, 2).toUpperCase();
      const avatarEl = el("div", "comp-avatar", initials);
      if (typeof av === "object" && av.image) {
        avatarEl.style.background = `url('${av.image}') center/cover`;
      } else {
        avatarEl.style.background = colors[i % colors.length];
      }
      container.appendChild(avatarEl);
    });
    if (avatars.length > max) {
      const more = el("div", "comp-avatar comp-avatar-more", "+" + (avatars.length - max));
      container.appendChild(more);
    }
  }
  return container;
}

function renderGeneric(comp) {
  const div = el("div");
  div.style.cssText = "padding:20px;border-radius:10px;border:1px dashed var(--border);";
  div.appendChild(el("div", "card-title", `${comp.type}`));
  const json = el("pre");
  json.style.cssText = "font-size:11px;font-family:var(--mono);white-space:pre-wrap;word-break:break-all;overflow:hidden;max-height:200px;";
  json.textContent = JSON.stringify(comp.props, null, 2);
  div.appendChild(json);
  return div;
}

// ===== Animation =====

function applyAnimation(element, anim) {
  if (!anim) return;

  const entryMap = {
    fadeUp: { name: "fadeUp", transform: "translateY(20px)" },
    fadeIn: { name: "fadeUp", transform: "none" },
    scaleIn: { name: "scaleIn", transform: "scale(0.9)" },
    slideRight: { name: "slideIn", transform: "translateX(-20px)" },
    slideLeft: { name: "slideIn", transform: "translateX(20px)" },
    slideUp: { name: "slideIn", transform: "translateY(20px)" },
    spring: { name: "scaleIn", transform: "scale(0.8)" },
  };

  if (anim.entry && entryMap[anim.entry]) {
    const config = entryMap[anim.entry];
    const duration = anim.duration || 0.3;
    const delay = anim.delay || 0;
    const curve = anim.curve || "ease-out";

    element.style.opacity = "0";
    element.style.transform = config.transform;

    requestAnimationFrame(() => {
      element.style.transition = `opacity ${duration}s ${curve} ${delay}s, transform ${duration}s ${curve} ${delay}s`;
      element.style.opacity = "1";
      element.style.transform = "none";
    });
  }

  if (anim.hover) {
    const hoverMap = {
      scaleUp: "scale(1.05)",
      lift: "translateY(-4px)",
      glow: "drop-shadow(0 0 12px var(--accent))",
    };
    const hoverTransform = hoverMap[anim.hover] || "scale(1.02)";
    element.addEventListener("mouseenter", () => {
      element.style.transform = hoverTransform;
    });
    element.addEventListener("mouseleave", () => {
      element.style.transform = "none";
    });
  }
}

// ===== Token Panel =====

function renderTokenPanel() {
  const list = $("token-list");

  if (!currentState || !currentState.tokens) {
    list.innerHTML = '<div class="token-empty">令牌将在 AI 初始化后出现</div>';
    return;
  }

  const tokens = currentState.tokens[activeTokenTab] || {};
  const keys = Object.keys(tokens);

  if (keys.length === 0) {
    list.innerHTML = '<div class="token-empty">此分类暂无令牌</div>';
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
    list.innerHTML = '<div class="activity-empty">AI Agent 操作将显示在这里</div>';
    return;
  }

  list.innerHTML = "";
  currentState.activityLog.forEach((entry) => {
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
  left.appendChild(el("span", "act-source", entry.source === "ai" ? "AI" : "用户"));
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
    // Apply font families
    const fontDisplay = currentState.tokens.typography?.["font-display"];
    if (fontDisplay) {
      root.style.setProperty("--font", fontDisplay.value + ", sans-serif");
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

// ===== Device Switcher =====

function setupDeviceSwitcher() {
  const buttons = document.querySelectorAll(".device-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentDevice = btn.dataset.device;
      const canvas = $("canvas");
      applyDeviceClass(canvas);
    });
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
    if (toggle) toggle.textContent = "☀️";
  } else {
    document.body.classList.remove("theme-dark");
    if (toggle) toggle.textContent = "🌙";
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

  currentState.pages.forEach((page) => {
    const tab = el("div", "page-tab" + (page.id === currentId ? " active" : ""));
    tab.dataset.pageId = page.id;

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

function takeScreenshot() {
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

// ===== AI Prompt Bar =====

function setupPromptBar() {
  const input = $("prompt-input");
  const sendBtn = $("prompt-send");
  if (!input || !sendBtn) return;

  const sendPrompt = () => {
    const text = input.value.trim();
    if (!text) return;
    send({ type: "prompt", prompt: text });
    input.value = "";
    // Visual feedback
    sendBtn.classList.add("sent");
    sendBtn.textContent = "已发送";
    setTimeout(() => {
      sendBtn.classList.remove("sent");
      sendBtn.textContent = "发送";
    }, 1200);
  };

  sendBtn.addEventListener("click", sendPrompt);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendPrompt();
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
  if (conflicts.length === 0) return;

  conflicts.forEach((conflict) => {
    const warning = el("div", "conflict-warning");
    const icon = el("span", "warn-icon", "⚠️");
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

// ===== Initialize =====

function init() {
  setupTabs();
  setupDeviceSwitcher();
  setupUndoRedo();
  setupThemeToggle();
  setupPageSwitcher();
  setupExportModal();
  setupScreenshot();
  setupPromptBar();
  setupConflictCheck();
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
