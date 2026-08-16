// /* === SPLIT-MODULE === */
/**
 * Prism Dashboard — Component renderers and animation helpers.
 *
 * Part of the split client application. All parts are global-scope scripts;
 * they must be loaded in the order declared in index.html.
 */

// ===== 元素级编辑 P1 (element styles) =====

/**
 * Apply per-element metadata (type promotion + play-mode affordance) to the
 * rendered inner elements of a component. `comp.elementMeta` is keyed by the
 * element's prop path (e.g. "title", "items.0.title").
 */
function applyElementMetaStyles(content, comp) {
  if (!content || !comp) return;
  // 归一化：所有可内联编辑的文字元素同时也是可单独选中的元素。
  content.querySelectorAll("[data-editable='true']").forEach((elm) => {
    if (!elm.hasAttribute("data-element")) elm.setAttribute("data-element", "true");
  });
  if (!comp.elementMeta) return;
  const els = content.querySelectorAll("[data-element='true']");
  els.forEach((elm) => {
    const path = elm.getAttribute("data-prop");
    if (!path) return;
    const meta = comp.elementMeta[path];
    if (!meta) return;
    if (meta.kind === "button") {
      elm.classList.add("el-kind-btn");
    } else if (meta.kind === "link") {
      elm.classList.add("el-kind-link");
    }
    if (meta.behavior && meta.behavior.type) {
      elm.classList.add("el-play-linked");
      elm.title = t("behaviorPlayHint");
    }
  });
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
    // Canvas-first fidelity types (created by shapesToComponents)
    case "text":
      return renderText(props);
    case "section":
      return renderSection(props);
    case "container":
      return renderContainer(props);
    // 画布绘制 (第一步): 预览画布直接绘制的形状组件
    case "rect":
      return renderShapeRect(props);
    case "ellipse":
      return renderShapeEllipse(props);
    case "arrow":
      return renderShapeArrow(props);
    case "line":
      return renderShapeLine(props);
    case "note":
      return renderShapeNote(props);
    case "connector":
      return renderShapeConnector(props);
    // 忠实显示：导入的原始 HTML 片段（Shadow DOM + 原 CSS 驱动）
    case "html_fragment":
      return renderHtmlFragment(props);
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
    // Spec 3.4 — new component types
    case "input":
      return renderInput(props);
    case "grid":
      return renderGrid(props, variant);
    case "table":
      return renderTable(props);
    case "alert":
      return renderAlert(props, variant);
    case "tooltip":
      return renderTooltip(props);
    case "bento_grid":
      return renderBentoGrid(props);
    case "skeleton":
      return renderSkeleton(props);
    case "command_palette":
      return renderCommandPalette(props);
    case "glass_card":
      return renderGlassCard(props);
    case "fab":
      return renderFab(props);
    case "marquee":
      return renderMarquee(props);
    case "feature_grid":
      return renderFeatureGrid(props, variant);
    case "cookie_banner":
      return renderCookieBanner(props);
    case "toggle":
      return renderToggle(props);
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
  e.setAttribute("data-element", "true"); // 元素级编辑 P1: 内部元素可单独选中
  e.draggable = false; // Prevent drag interference with editing
  return e;
}

// 元素级编辑 P1: 标记一个内部元素为可单独选中（按钮/链接等非文本元素）。
function markElement(e, prop) {
  if (!e) return e;
  if (prop) {
    e.setAttribute("data-prop", prop);
    e.setAttribute("data-element", "true");
  }
  e.draggable = false;
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
    const btn = editableText("div", "btn", props.button_text, "button_text");
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
    items.forEach((item, i) => {
      const link = typeof item === "string" ? item : (item.label || item.text || "");
      links.appendChild(editableText("span", null, link, `links.${i}`));
    });
  }
  nav.appendChild(links);

  if (variant === "with_cta" && props.cta_text) {
    const cta = editableText("span", "btn", props.cta_text, "cta_text");
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
    // 卡片网格内每个 item 的文字可独立编辑（路径指向 items[i]）。
    const t = card.querySelector(".card-title");
    if (t) { t.setAttribute("data-editable", "true"); t.setAttribute("data-prop", `items.${i}.title`); }
    const d = card.querySelector(".card-desc");
    if (d) { d.setAttribute("data-editable", "true"); d.setAttribute("data-prop", `items.${i}.description`); }
    const p = card.querySelector(".card-price");
    if (p) { p.setAttribute("data-editable", "true"); p.setAttribute("data-prop", `items.${i}.price`); }
    grid.appendChild(card);
  }

  return grid;
}

function renderCard(props, variant) {
  const card = el("div", "comp-card");
  if (variant === "elevated") {
    card.style.boxShadow = "0 12px 28px rgba(0,0,0,0.14)";
    card.style.transform = "translateY(-2px)";
  } else if (variant === "outlined") {
    card.style.background = "transparent";
    card.style.border = "2px solid var(--border-strong)";
    card.style.boxShadow = "none";
  }

  if (props.image_url || props.image) {
    const img = el("div", "card-img");
    img.style.background = `url('${props.image_url || props.image}') center/cover`;
    card.appendChild(img);
  }

  if (props.title) {
    card.appendChild(markElement(el("div", "card-title", props.title), "title"));
  }
  if (props.description || props.desc) {
    card.appendChild(markElement(el("div", "card-desc", props.description || props.desc), "description"));
  }
  if (props.price) {
    card.appendChild(markElement(el("div", "card-price", props.price), "price"));
  }
  if (props.button_text) {
    const btn = editableText("div", "btn", props.button_text, "button_text");
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
    const btn = editableText("div", "btn", props.button_text, "button_text");
    cta.appendChild(btn);
  }
  return cta;
}

function renderFooter(props) {
  const footer = el("div", "comp-footer");
  const text = props.text || props.copyright || "© 2024 All rights reserved.";
  footer.appendChild(markElement(el("p", null, text), "text"));
  if (props.links && Array.isArray(props.links)) {
    const linksDiv = el("div");
    linksDiv.style.cssText = "display:flex;gap:16px;justify-content:center;margin-top:8px;";
    props.links.forEach((link, i) => {
      linksDiv.appendChild(markElement(el("span", null, typeof link === "string" ? link : (link.label || "")), `links.${i}`));
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
  items.forEach((item, i) => {
    const feature = el("div", "comp-feature-item");
    const icon = el("div", "feature-icon", item.icon || "✦");
    feature.appendChild(icon);
    const text = el("div");
    text.style.flex = "1";
    if (item.title) text.appendChild(editableText("div", "card-title", item.title, `items.${i}.title`));
    if (item.description) text.appendChild(editableText("div", "card-desc", item.description, `items.${i}.description`));
    feature.appendChild(text);
    list.appendChild(feature);
  });
  return list;
}

function renderButton(props, variant) {
  const btn = editableText("div", "comp-button", props.text || props.label || "Button", "text");
  if (variant === "secondary") {
    btn.style.background = "transparent";
    btn.style.border = "2px solid currentColor";
  } else if (variant === "ghost") {
    btn.style.background = "transparent";
    btn.style.color = "currentColor";
  } else if (variant === "danger") {
    btn.style.background = "var(--danger, #EF4444)";
    btn.style.borderColor = "transparent";
  }
  return btn;
}

function renderStats(props) {
  const container = el("div", "comp-stats");
  container.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;padding:24px;border-radius:10px;";
  const items = props.items || [];
  items.forEach((item, i) => {
    const stat = el("div");
    stat.style.cssText = "text-align:center;padding:16px;border-radius:8px;";
    stat.appendChild(el("div", null, ""));
    const num = stat.firstChild;
    num.style.cssText = "font-size:28px;font-weight:700;margin-bottom:4px;";
    num.textContent = item.value || "0";
    num.setAttribute("data-editable", "true");
    num.setAttribute("data-prop", `items.${i}.value`);
    num.draggable = false;
    const label = el("div", null, item.label || "");
    label.style.cssText = "font-size:11px;opacity:0.7;";
    label.setAttribute("data-editable", "true");
    label.setAttribute("data-prop", `items.${i}.label`);
    label.draggable = false;
    stat.appendChild(label);
    container.appendChild(stat);
  });
  return container;
}

function renderPricing(props, variant) {
  const grid = el("div", "comp-pricing");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;";
  const plans = props.plans || [];
  plans.forEach((plan, i) => {
    const card = el("div", "comp-card");
    if (plan.featured) {
      card.style.cssText = "border:2px solid var(--accent);position:relative;";
    }
    if (plan.name) card.appendChild(editableText("div", "card-title", plan.name, `plans.${i}.name`));
    if (plan.price) {
      const price = editableText("div", "card-price", plan.price, `plans.${i}.price`);
      price.style.fontSize = "24px";
      card.appendChild(price);
    }
    if (plan.features && Array.isArray(plan.features)) {
      const features = el("div");
      features.style.cssText = "margin-top:8px;";
      plan.features.forEach((f, fi) => {
        features.appendChild(editableText("div", "card-desc", `✓ ${f}`, `plans.${i}.features.${fi}`));
      });
      card.appendChild(features);
    }
    if (plan.button_text) {
      const btn = editableText("div", "btn", plan.button_text, `plans.${i}.button_text`);
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
  if (props.author) info.appendChild(markElement(el("div", "card-title", props.author), "author"));
  if (props.role) info.appendChild(markElement(el("div", "card-desc", props.role), "role"));
  author.appendChild(info);
  container.appendChild(author);
  return container;
}

function renderBanner(props) {
  const banner = el("div");
  banner.style.cssText = "padding:16px 24px;border-radius:8px;text-align:center;";
  if (props.text) {
    const text = markElement(el("span", null, props.text), "text");
    text.style.fontSize = "14px";
    banner.appendChild(text);
  }
  if (props.button_text) {
    const btn = editableText("span", "btn", props.button_text, "button_text");
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
      const date = markElement(el("div", "card-desc", item.date), `items.${i}.date`);
      date.style.fontFamily = "var(--mono)";
      content.appendChild(date);
    }
    if (item.title) content.appendChild(markElement(el("div", "card-title", item.title), `items.${i}.title`));
    if (item.description) content.appendChild(markElement(el("div", "card-desc", item.description), `items.${i}.description`));
    entry.appendChild(content);
    timeline.appendChild(entry);
  });
  return timeline;
}

function renderFaq(props) {
  const container = el("div");
  container.style.cssText = "padding:24px;display:flex;flex-direction:column;gap:8px;";
  const items = props.items || [];
  items.forEach((item, i) => {
    const qa = el("div");
    qa.style.cssText = "padding:12px;border-radius:8px;";
    if (item.question) {
      const q = markElement(el("div", "card-title", item.question), `items.${i}.question`);
      q.style.marginBottom = "4px";
      qa.appendChild(q);
    }
    if (item.answer) qa.appendChild(markElement(el("div", "card-desc", item.answer), `items.${i}.answer`));
    container.appendChild(qa);
  });
  return container;
}

function renderForm(props) {
  const form = el("div");
  form.style.cssText = "padding:24px;border-radius:10px;";
  const fields = props.fields || [];
  fields.forEach((field, i) => {
    const wrapper = el("div");
    wrapper.style.cssText = "margin-bottom:12px;";
    if (field.label) {
      const label = markElement(el("label", null, field.label), `fields.${i}.label`);
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
      const tabBtn = markElement(el("button", "tab-item" + (i === 0 ? " active" : ""), label), `items.${i}.label`);
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
    { label: "Dashboard", icon: "▣" },
    { label: "Projects", icon: "▤" },
    { label: "Settings", icon: "○" },
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

// ===== Spec 3.4 — New Component Renderers =====

function renderInput(props) {
  const wrap = el("div", "comp-input");
  if (props.label) wrap.appendChild(el("label", "input-label", props.label));
  const input = el("input", "input-field");
  input.type = props.type || "text";
  input.placeholder = props.placeholder || "";
  input.value = props.value || "";
  input.readOnly = true;
  wrap.appendChild(input);
  if (props.hint) wrap.appendChild(el("div", "input-hint", props.hint));
  return wrap;
}

function renderGrid(props, variant) {
  const grid = el("div", "comp-grid");
  const cols = variant.includes("2") ? "2" : variant.includes("4") ? "4" : "3";
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  const items = props.items || Array.from({ length: parseInt(cols, 10) }, (_, i) => ({ title: `单元格 ${i + 1}` }));
  items.forEach((item) => {
    const cell = el("div", "grid-cell");
    cell.appendChild(el("div", "grid-cell-title", typeof item === "string" ? item : (item.title || "单元格")));
    if (item && item.description) cell.appendChild(el("div", "grid-cell-desc", item.description));
    grid.appendChild(cell);
  });
  return grid;
}

function renderTable(props) {
  const container = el("div", "comp-table-wrap");
  const table = el("table", "comp-table");
  const columns = props.columns || ["列 1", "列 2"];
  const rows = props.rows || [];
  const thead = el("thead");
  const headRow = el("tr");
  columns.forEach((c) => headRow.appendChild(el("th", null, c)));
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = el("tbody");
  rows.forEach((row) => {
    const tr = el("tr");
    (Array.isArray(row) ? row : []).forEach((cell) => tr.appendChild(el("td", null, String(cell))));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
  return container;
}

function renderAlert(props, variant) {
  const type = variant || props.type || "info";
  const alert = el("div", `comp-alert alert-${type}`);
  const icons = { info: "i", success: "OK", warning: "!", error: "×" };
  alert.appendChild(el("span", `alert-icon alert-icon-${type}`, icons[type] || "i"));
  const body = el("div", "alert-body");
  if (props.title) body.appendChild(el("div", "alert-title", props.title));
  if (props.text) body.appendChild(el("div", "alert-text", props.text));
  alert.appendChild(body);
  return alert;
}

function renderTooltip(props) {
  const wrap = el("div", "comp-tooltip");
  const trigger = el("span", "tooltip-trigger", props.trigger || "悬停查看");
  const bubble = el("div", "tooltip-bubble", props.text || "");
  wrap.appendChild(trigger);
  wrap.appendChild(bubble);
  return wrap;
}

function renderBentoGrid(props) {
  const grid = el("div", "comp-bento");
  const items = props.items || [{ title: "主卡片", size: "large" }, { title: "小卡片", size: "small" }];
  items.forEach((item) => {
    const tile = el("div", `bento-tile bento-${item.size || "medium"}`);
    if (item.title) tile.appendChild(el("div", "bento-title", item.title));
    if (item.text) tile.appendChild(el("div", "bento-text", item.text));
    grid.appendChild(tile);
  });
  return grid;
}

function renderSkeleton(props) {
  const wrap = el("div", "comp-skeleton");
  const rows = props.rows || 3;
  wrap.appendChild(el("div", "skel-line skel-avatar"));
  for (let i = 0; i < rows; i++) {
    const line = el("div", "skel-line");
    line.style.width = `${92 - i * 14}%`;
    wrap.appendChild(line);
  }
  return wrap;
}

function renderCommandPalette(props) {
  const wrap = el("div", "comp-command");
  const search = el("div", "command-search");
  search.appendChild(el("span", null, "⌘"));
  search.appendChild(el("span", null, props.placeholder || "搜索或输入命令…"));
  wrap.appendChild(search);
  const items = props.items || ["新建页面", "切换主题", "导出代码"];
  items.forEach((item) => {
    const row = el("div", "command-item");
    row.appendChild(el("span", null, typeof item === "string" ? item : item.label));
    if (typeof item === "object" && item.shortcut) row.appendChild(el("span", "command-kbd", item.shortcut));
    wrap.appendChild(row);
  });
  return wrap;
}

function renderGlassCard(props) {
  const card = el("div", "comp-glass-card");
  if (props.title) card.appendChild(el("div", "glass-title", props.title));
  if (props.text) card.appendChild(el("div", "glass-text", props.text));
  if (props.button_text) card.appendChild(el("div", "btn", props.button_text));
  return card;
}

function renderFab(props) {
  const wrap = el("div", "comp-fab-wrap");
  const fab = el("button", "comp-fab", props.label || "+");
  fab.title = props.hint || "浮动操作";
  wrap.appendChild(fab);
  return wrap;
}

function renderMarquee(props) {
  const wrap = el("div", "comp-marquee");
  const track = el("div", "marquee-track");
  const items = props.items || ["特性一", "特性二", "特性三"];
  const doubled = [...items, ...items];
  doubled.forEach((item) => {
    const span = el("span", "marquee-item", typeof item === "string" ? item : item.title);
    track.appendChild(span);
  });
  wrap.appendChild(track);
  return wrap;
}

function renderFeatureGrid(props, variant) {
  const grid = el("div", "comp-feature-grid");
  const cols = variant.includes("2") ? "2" : variant.includes("4") ? "4" : "3";
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  const items = props.items || [];
  items.forEach((item) => {
    const cell = el("div", "fg-cell");
    cell.appendChild(el("div", "fg-icon", item.icon || "✦"));
    if (item.title) cell.appendChild(el("div", "fg-title", item.title));
    if (item.description) cell.appendChild(el("div", "fg-desc", item.description));
    grid.appendChild(cell);
  });
  return grid;
}

function renderCookieBanner(props) {
  const banner = el("div", "comp-cookie");
  banner.appendChild(el("span", "cookie-icon", "◉"));
  banner.appendChild(el("span", "cookie-text", props.text || "我们使用 Cookie 提升体验"));
  const actions = el("div", "cookie-actions");
  if (props.decline_text) actions.appendChild(el("span", "btn btn-ghost", props.decline_text));
  if (props.accept_text) actions.appendChild(el("span", "btn", props.accept_text));
  banner.appendChild(actions);
  return banner;
}

function renderToggle(props) {
  const wrap = el("label", "comp-toggle");
  const track = el("span", "toggle-track" + (props.checked ? " on" : ""));
  track.appendChild(el("span", "toggle-thumb"));
  wrap.appendChild(track);
  if (props.label) wrap.appendChild(el("span", "toggle-label", props.label));
  return wrap;
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

function renderText(props) {
  const p = el("div", "comp-text");
  p.textContent = props.text || "";
  if (props.fontSize) p.style.fontSize = String(props.fontSize).replace(/px$/, "") + "px";
  if (props.fontFamily) p.style.fontFamily = String(props.fontFamily);
  if (props.align) p.style.textAlign = String(props.align);
  return p;
}

function renderSection(props) {
  const p = el("div", "comp-section");
  if (props.title) p.appendChild(el("div", "section-title", props.title));
  return p;
}

function renderContainer(props) {
  const p = el("div", "comp-container");
  if (props.text) p.appendChild(el("div", "container-label", props.text));
  return p;
}

// ===== 画布绘制 (第一步: 预览画布直接绘制，统一坐标系) =====

// ===== HTML 片段渲染 (v2: Shadow DOM 隔离 + 原 CSS 驱动，忠实显示用户 UI) =====

/**
 * CSS 选择器改写：body/html/:root → :host，让用户 CSS 在 shadow root 内生效
 * （shadow 没有 body/html 元素，:host 即片段根）。按规则拆分（括号配平，
 * 忽略字符串/注释），@media/@keyframes 整块保留。
 */
function rewriteShadowCss(css) {
  if (!css) return "";
  const out = [
    ":host { all: initial; display: block; width: 100%; min-height: 100%; box-sizing: border-box; }",
  ];
  const n = css.length;
  let i = 0;
  let buf = "";
  const rules = [];
  while (i < n) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch;
      let j = i + 1;
      while (j < n && css[j] !== q) {
        if (css[j] === "\\") j++;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (ch === "{") {
      let depth = 1;
      let j = i + 1;
      while (j < n && depth > 0) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") depth--;
        else if (css[j] === '"' || css[j] === "'") {
          const q = css[j];
          let k = j + 1;
          while (k < n && css[k] !== q) {
            if (css[k] === "\\") k++;
            k++;
          }
          j = k;
          continue;
        }
        j++;
      }
      rules.push({ sel: buf.trim(), body: css.slice(i + 1, j - 1) });
      buf = "";
      i = j;
      continue;
    }
    buf += ch;
    i++;
  }
  for (const r of rules) {
    const sel = r.sel
      .replace(/(^|[,>+~\s])body(?=[\s.#:[\],>+~]|$)/g, "$1:host")
      .replace(/(^|[,>+~\s])html(?=[\s.#:[\],>+~]|$)/g, "$1:host")
      .replace(/(^|[,>+~\s]):root(?=[\s.#:[\],>+~]|$)/g, "$1:host");
    out.push(`${sel} { ${r.body} }`);
  }
  return out.join("\n");
}

/** 标记片段内文本叶子节点为可双击编辑。 */
function markEditableInShadow(root) {
  const selector = "p, h1, h2, h3, h4, h5, h6, span, a, button, input, textarea, select, option, img, video, audio, li, label, td, th, div";
  root.querySelectorAll(selector).forEach((el) => {
    const path = fragElementPath(root, el);
    if (path) el.setAttribute("data-prism-path", "frag:" + path.join("."));
    if (el.childElementCount === 0 && (el.textContent || "").trim()) {
      el.setAttribute("data-editable", "true");
    }
  });
}

/** Shadow root 内联编辑：双击编辑 → 失焦提交（序列化整个片段回写 props.html）。 */
function setupShadowInlineEditing(host, shadow) {
  const root = shadow.querySelector(".prism-fragment-root");
  if (!root) return;

  root.addEventListener("dblclick", (e) => {
      if (playMode) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (!t.closest("[data-editable='true']")) return;
    e.stopPropagation();
    t.setAttribute("data-prism-editing", "1");
    t.contentEditable = "true";
    t.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(t);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (err) {
      /* ignore */
    }
  });

  root.addEventListener(
    "blur",
    (e) => {
      const t = e.target;
      if (!(t instanceof Element) || t.getAttribute("data-prism-editing") !== "1") return;
      t.removeAttribute("data-prism-editing");
      t.contentEditable = "false";
      const wrapper = host.closest(".comp-wrapper");
      const compId = wrapper ? wrapper.dataset.id : null;
      if (!compId) return;
      const comp = getCompById(compId);
      if (!comp) return;
      const updated = cleanFragmentHtml(root.innerHTML);
      if (updated === comp.props.html) return;
      fetch(`/api/component/${encodeURIComponent(compId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ props: { html: updated } }),
      }).catch((err) => console.error("Fragment edit commit failed:", err));
    },
    true
  );
}


/** 把 comp.elementMeta（key 为 "frag:<path>"）应用到 shadow 内元素。 */
function applyFragmentElementMeta(root, comp) {
  if (!root || !comp || !comp.elementMeta) return;
  root.querySelectorAll("[data-prism-path^='frag:']").forEach((el) => {
    const path = el.getAttribute("data-prism-path");
    if (!path) return;
    const meta = comp.elementMeta[path];
    if (!meta) return;
    if (meta.kind === "button") {
      el.classList.add("el-kind-btn");
    } else if (meta.kind === "link") {
      el.classList.add("el-kind-link");
    }
    if (meta.behavior && meta.behavior.type) {
      el.classList.add("el-play-linked");
      el.title = t("behaviorPlayHint");
    }
  });
}

/** 播放模式下，shadow 内元素点击触发 elementMeta 中绑定的行为。 */
function setupFragmentPlayBehavior(host, shadow) {
  const root = shadow.querySelector(".prism-fragment-root");
  if (!root) return;
  root.addEventListener("click", (e) => {
    if (!playMode) return;
    const target = e.target instanceof Element ? e.target.closest("[data-prism-path^='frag:']") : null;
    if (!target) return;
    const wrapper = host.closest(".comp-wrapper");
    const compId = wrapper ? wrapper.dataset.id : null;
    if (!compId) return;
    const comp = getCompById(compId);
    const path = target.getAttribute("data-prism-path");
    const meta = comp && comp.elementMeta ? comp.elementMeta[path] : null;
    if (!meta || !meta.behavior || !meta.behavior.type) return;
    e.preventDefault();
    e.stopPropagation();
    dispatchBehavior({ behavior: meta.behavior });
  });
}

function renderHtmlFragment(props) {
  const host = el("div", "prism-fragment");
  const shadow = host.attachShadow({ mode: "open" });
  const css = rewriteShadowCss(props.css || "");
  const frag = String(props.html || "");
  shadow.innerHTML = `<style>${css}</style><div class="prism-fragment-root">${frag}</div>`;
  const root = shadow.querySelector(".prism-fragment-root");
  if (root) {
    markEditableInShadow(root);
      // elementMeta 在 host 挂载到 .comp-wrapper 后于下方 setTimeout 补水
      // (elementMeta 补水已移到下方 setTimeout)
    setupShadowInlineEditing(host, shadow);
    setupFragmentElementSelection(host, root);
      setupFragmentPlayBehavior(host, shadow);
  }
  // 重绘后恢复元素选中高亮
  const wrapperId = host.closest(".comp-wrapper")?.dataset?.id;
  if (wrapperId && prismFragElementSel && prismFragElementSel.compId === wrapperId) {
    const el = fragElementByPath(root, prismFragElementSel.path);
    if (el) {
      el.style.outline = "2px dashed var(--accent, #2383E2)";
      el.style.outlineOffset = "2px";
    }
  }
    // host 此刻可能尚未挂载；等本轮 DOM 插入完成后再补 elementMeta 和选中高亮。
    setTimeout(() => {
      const hydratedWrapperId = host.closest(".comp-wrapper")?.dataset?.id;
      const hydratedComp = hydratedWrapperId ? getCompById(hydratedWrapperId) : null;
      if (root && hydratedComp) applyFragmentElementMeta(root, hydratedComp);
      if (root && hydratedWrapperId && prismFragElementSel && prismFragElementSel.compId === hydratedWrapperId) {
        const hydratedEl = fragElementByPath(root, prismFragElementSel.path);
        if (hydratedEl) {
          hydratedEl.style.outline = "2px dashed var(--accent, #2383E2)";
          hydratedEl.style.outlineOffset = "2px";
        }
      }
    }, 0);
  return host;
}

// ===== 片段元素级编辑 (v2): 内层元素可选中并调整样式 =====

let prismFragElementSel = null; // { compId, path: number[] }

/** 计算元素在片段根下的路径（子索引链）。 */
function fragElementPath(root, el) {
  const path = [];
  let cur = el;
  while (cur && cur !== root) {
    const parent = cur.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, cur));
    cur = parent;
  }
  return path.length ? path : null;
}

/** 按路径取回元素（重绘后仍可定位）。 */
function fragElementByPath(root, path) {
  let cur = root;
  for (const idx of path || []) {
    if (!cur || !cur.children || idx >= cur.children.length) return null;
    cur = cur.children[idx];
  }
  return cur;
}

function clearPrismFragElementHighlight() {
  if (prismFragElementSel) {
    document.querySelectorAll(".prism-fragment").forEach((h) => {
      const root = h.shadowRoot && h.shadowRoot.querySelector(".prism-fragment-root");
      if (root) {
        const el = fragElementByPath(root, prismFragElementSel.path);
        if (el) el.style.outline = "";
      }
    });
    prismFragElementSel = null;
  }
}

function clearPrismFragElementSelection() {
  clearPrismFragElementHighlight();
  if (selectedElementPath && selectedElementPath.startsWith("frag:")) {
    selectedElementPath = null;
  }
  if (typeof renderInspector === "function") renderInspector();
}

function selectPrismFragElement(compId, el, root) {
  clearPrismFragElementHighlight();
  const path = fragElementPath(root, el);
  if (!path) return;
  prismFragElementSel = { compId, path };
  selectedComponentId = compId;
  selectedIds = [compId];
  selectedElementPath = "frag:" + path.join(".");
  if (typeof applyElementSelectionHighlight === "function") applyElementSelectionHighlight();
  el.style.outline = "2px dashed var(--accent, #2383E2)";
  el.style.outlineOffset = "2px";
  document.querySelectorAll(".comp-wrapper.selected").forEach((w) => w.classList.remove("selected"));
  const wrapper = document.querySelector(`.comp-wrapper[data-id="${CSS.escape(compId)}"]`);
  if (wrapper) wrapper.classList.add("selected");
  if (typeof renderLayerPanel === "function") renderLayerPanel();
  if (typeof renderInspector === "function") renderInspector();
}

/** 片段根点击：内层元素 → 选中（高亮 + 检查器样式面板）；空白 → 取消元素选中。 */
function setupFragmentElementSelection(host, root) {
  const wrapperId = () => host.closest(".comp-wrapper")?.dataset?.id || null;
  root.addEventListener("click", (e) => {
      if (playMode) return; // 播放模式点击只触发行为，不进入元素编辑选择
    const compId = wrapperId();
    if (!compId) return;
    const t = e.target;
    if (!(t instanceof Element) || t === root) {
      if (prismFragElementSel && prismFragElementSel.compId === compId) {
        clearPrismFragElementSelection();
        if (typeof renderInspector === "function") renderInspector();
      }
      return;
    }
    if (t.contentEditable === "true") return;
    selectPrismFragElement(compId, t, root);
  });
}

/** 序列化前剥离编辑器注入的属性（data-editable/contenteditable），保持源码干净。 */
function cleanFragmentHtml(html) {
  return String(html)
    .replace(/\s+data-editable="true"/g, "")
    .replace(/\s+contenteditable="(?:true|false)"/g, "")
    .replace(/\s+data-prism-editing="1"/g, "")
    .replace(/\s+data-prism-path="frag:[\d.]+"/g, "");
}

/** 把片段当前 HTML 序列化回组件（元素样式/文字改动提交）。
 *  走 REST 而非 WS：WS 的乐观并发（base_revision）在导入等批量变更后
 *  客户端修订号可能过期导致更新被拒；片段编辑无需并发检查。 */
function commitFragmentHtml(compId) {
  const host = document.querySelector(`.comp-wrapper[data-id="${CSS.escape(compId)}"] .prism-fragment`);
  const root = host && host.shadowRoot ? host.shadowRoot.querySelector(".prism-fragment-root") : null;
  if (!root) return;
  const comp = getCompById(compId);
  if (!comp) return;
  const updated = cleanFragmentHtml(root.innerHTML);
  if (updated === comp.props.html) return;
  // 只提交 html（服务端 merge 保留 css/region），避免 130KB css 超 body 限制
  fetch(`/api/component/${encodeURIComponent(compId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ props: { html: updated } }),
  }).catch((err) => console.error("Fragment commit failed:", err));
}

// ===== 画布绘制 (第一步: 预览画布直接绘制，统一坐标系) =====

function renderShapeRect(props) {
  const p = el("div", "comp-shape comp-rect");
  p.style.cssText = `background:${props.fill || "var(--accent-bg, rgba(35,131,226,.12))"};border:1.5px solid ${props.stroke || "var(--accent, #2383E2)"};border-radius:${props.radius || 4}px;`;
  return p;
}

function renderShapeEllipse(props) {
  const p = el("div", "comp-shape comp-ellipse");
  p.style.cssText = `background:${props.fill || "var(--accent-bg, rgba(35,131,226,.12))"};border:1.5px solid ${props.stroke || "var(--accent, #2383E2)"};border-radius:50%;`;
  return p;
}

function renderShapeArrow(props) {
  const color = props.stroke || "var(--accent, #2383E2)";
  const w = 100, h = 24;
  const p = el("div", "comp-shape comp-arrow");
  p.style.cssText = "width:100%;height:100%;display:flex;align-items:center;";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", "2"); line.setAttribute("y1", String(h / 2));
  line.setAttribute("x2", String(w - 14)); line.setAttribute("y2", String(h / 2));
  line.setAttribute("stroke", color); line.setAttribute("stroke-width", "2.5");
  const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  head.setAttribute("points", `${w - 14},${h / 2 - 8} ${w - 2},${h / 2} ${w - 14},${h / 2 + 8}`);
  head.setAttribute("fill", color);
  svg.appendChild(line); svg.appendChild(head);
  p.appendChild(svg);
  return p;
}

function renderShapeLine(props) {
  const color = props.stroke || "var(--accent, #2383E2)";
  const p = el("div", "comp-shape comp-line");
  p.style.cssText = "width:100%;height:100%;display:flex;align-items:center;";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "none");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", "0"); line.setAttribute("y1", "50%");
  line.setAttribute("x2", "100%"); line.setAttribute("y2", "50%");
  line.setAttribute("stroke", color); line.setAttribute("stroke-width", "2");
  svg.appendChild(line);
  p.appendChild(svg);
  return p;
}

function renderShapeNote(props) {
  const p = el("div", "comp-shape comp-note");
  p.style.cssText = "width:100%;height:100%;background:#FFF6D6;border:1px solid #E8DCA8;border-radius:4px;padding:8px;font-size:12px;color:#7A6A2F;overflow:hidden;display:flex;align-items:flex-start;";
  p.appendChild(el("div", "", String(props.text || "便签")));
  return p;
}

function renderShapeConnector(props) {
  const color = props.stroke || "var(--accent, #2383E2)";
  const p = el("div", "comp-shape comp-connector");
  p.style.cssText = "width:100%;height:100%;pointer-events:none;";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "none");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(props.x1 ?? 0)); line.setAttribute("y1", String(props.y1 ?? 0));
  line.setAttribute("x2", String(props.x2 ?? 100)); line.setAttribute("y2", String(props.y2 ?? 0));
  line.setAttribute("stroke", color); line.setAttribute("stroke-width", "2");
  line.setAttribute("stroke-dasharray", "5 3");
  svg.appendChild(line);
  p.appendChild(svg);
  return p;
}

// ===== Animation =====

function applyAnimation(element, anim) {
  if (!anim) return;
  const duration = anim.duration || 0.3;
  const delay = anim.delay || 0;
  const curve = anim.curve || "ease-out";
  const stagger = anim.stagger || 0;

  const entryMap = {
    fadeUp: "translateY(20px)",
    fadeIn: "none",
    scaleIn: "scale(0.9)",
    slideRight: "translateX(-20px)",
    slideLeft: "translateX(20px)",
    slideUp: "translateY(20px)",
    spring: "scale(0.8)",
  };

  if (anim.entry && entryMap[anim.entry]) {
    element.style.opacity = "0";
    element.style.transform = entryMap[anim.entry];

    requestAnimationFrame(() => {
      element.style.transition = `opacity ${duration}s ${curve} ${delay}s, transform ${duration}s ${curve} ${delay}s`;
      element.style.opacity = "1";
      element.style.transform = "none";
    });
  } else if (anim.entry) {
    // CSS keyframe entry animations (bounceIn, flipIn, cinematic, shimmer, glitch, morphBlob)
    element.classList.add(`anim-${anim.entry}`);
    element.style.animationDuration = `${duration}s`;
    element.style.animationDelay = `${delay}s`;
    element.style.animationTimingFunction = curve === "spring" ? "cubic-bezier(0.34, 1.56, 0.64, 1)" : curve;
  }

  // Child stagger: offset each direct child's transition/animations
  if (stagger > 0) {
    const kids = element.querySelectorAll(":scope > *");
    kids.forEach((kid, i) => {
      kid.style.animationDelay = `${(i + 1) * stagger}s`;
      kid.style.transitionDelay = `${(i + 1) * stagger}s`;
    });
  }

  if (anim.hover) {
    const hoverMap = {
      scaleUp: "scale(1.05)",
      lift: "translateY(-4px)",
      glow: "drop-shadow(0 0 12px var(--accent))",
    };
    if (hoverMap[anim.hover]) {
      element.addEventListener("mouseenter", () => {
        element.style.transform = hoverMap[anim.hover];
      });
      element.addEventListener("mouseleave", () => {
        element.style.transform = "none";
      });
    } else if (anim.hover === "magnetic") {
      element.classList.add("anim-hover-magnetic");
      element.addEventListener("mousemove", (e) => {
        const r = element.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * 0.2;
        const dy = (e.clientY - (r.top + r.height / 2)) * 0.2;
        element.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      });
      element.addEventListener("mouseleave", () => {
        element.style.transform = "";
      });
    } else if (anim.hover === "tilt") {
      element.classList.add("anim-hover-tilt");
      element.addEventListener("mousemove", (e) => {
        const r = element.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        element.style.transform = `perspective(600px) rotateY(${(px * 8).toFixed(1)}deg) rotateX(${(-py * 8).toFixed(1)}deg)`;
      });
      element.addEventListener("mouseleave", () => {
        element.style.transform = "";
      });
    } else {
      // ripple / spotlight via CSS classes
      element.classList.add(`anim-hover-${anim.hover}`);
    }
  }
}

