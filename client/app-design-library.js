// /* === SPLIT-MODULE === */
/**
 * Prism Dashboard — left design-library panel (DESIGN.md v1.1 §3.3).
 *
 * Renders VibeHub styles + terms from the global `window.VIBE_HUB_TERMS`
 * snapshot. Click a style to apply token overrides; click a component term to
 * add it to the current canvas. Uses the same REST endpoints as the MCP/WS
 * channels so all entries stay in sync.
 */

function setupDesignLibraryPanel() {
  const root = $("design-library-panel");
  if (!root) return;
  const search = $("design-library-search");
  const stylesHost = $("design-library-styles");
  const componentsHost = $("design-library-components");
  if (!stylesHost || !componentsHost) return;

  const data = window.VIBE_HUB_TERMS || { grouped: {}, styles: [] };
  const grouped = data.grouped || {};
  const styles = data.styles || [];

  const allComponents = [];
  Object.entries(grouped).forEach(([category, items]) => {
    (items || []).forEach((term) => {
      allComponents.push({ category, term });
    });
  });

  function renderStyles(filter) {
    stylesHost.innerHTML = "";
    const heading = el("div", "lib-section-title", "设计风格");
    stylesHost.appendChild(heading);
    const grid = el("div", "lib-style-grid");
    const f = (filter || "").toLowerCase();
    styles
      .filter((s) => !f || s.zh.includes(filter) || s.slug.includes(f) || (s.en || "").toLowerCase().includes(f))
      .forEach((s) => {
        const card = el("button", "lib-style-card");
        card.type = "button";
        card.title = s.zh + " — " + (s.en || "");
        card.appendChild(el("div", "lib-card-title", s.zh));
        card.appendChild(el("div", "lib-card-sub", s.en || s.slug));
        card.addEventListener("click", () => applyStyle(s.slug));
        grid.appendChild(card);
      });
    stylesHost.appendChild(grid);
  }

  function renderComponents(filter) {
    componentsHost.innerHTML = "";
    const heading = el("div", "lib-section-title", "组件术语");
    componentsHost.appendChild(heading);
    const f = (filter || "").toLowerCase();
    Object.entries(grouped).forEach(([category, items]) => {
      const list = (items || []).filter(
        (term) => !f || term.zh.includes(filter) || term.slug.includes(f) || category.includes(filter)
      );
      if (list.length === 0) return;
      const group = el("div", "lib-group");
      group.appendChild(el("div", "lib-group-title", category));
      list.forEach((term) => {
        const item = el("button", "lib-item");
        item.type = "button";
        item.title = term.zh + " — " + (term.en || term.slug);
        item.appendChild(el("span", "lib-item-name", term.zh));
        if (term.variantsList && term.variantsList.length > 0) {
          item.appendChild(el("span", "lib-item-var", String(term.variantsList.length) + " 变体"));
        }
        item.addEventListener("click", () => addComponent(term.slug));
        group.appendChild(item);
      });
      componentsHost.appendChild(group);
    });
  }

  function applyStyle(styleId) {
    fetch("/api/design-library/style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style_id: styleId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data) => {
        showToastMsg(`已应用风格：${data.style_name || styleId}`);
        if (typeof fetchInitialState === "function") fetchInitialState();
      })
      .catch((err) => showToastMsg("风格应用失败：" + err.message, true));
  }

  function addComponent(componentId) {
    fetch("/api/design-library/component", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: componentId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data) => {
        showToastMsg(`已添加组件：${data.library_component_id || componentId}`);
        if (typeof fetchInitialState === "function") fetchInitialState();
      })
      .catch((err) => showToastMsg("组件添加失败：" + err.message, true));
  }

  if (search) {
    search.addEventListener("input", () => {
      const f = search.value.trim();
      renderStyles(f);
      renderComponents(f);
    });
  }

  renderStyles("");
  renderComponents("");
}

document.addEventListener("DOMContentLoaded", setupDesignLibraryPanel);
