// /* === SPLIT-MODULE === */
/**
 * Prism Dashboard — Import modal, apply banner, persistence, versions, comments, search and the design library.
 *
 * Part of the split client application. All parts are global-scope scripts;
 * they must be loaded in the order declared in index.html.
 */

// ===== Import Project Modal =====

function setupImportModal() {
  const importBtn = $("import-btn");
  const modal = $("import-modal");
  const closeBtn = $("import-close");
  const goBtn = $("import-go");
  const pathInput = $("import-path");
  const clearCheckbox = $("import-clear");
  const urlInput = $("import-url");
  const htmlTextarea = $("import-html");
  const fileInput = $("import-file");
  const fileBtn = $("import-file-btn");
  const resultDiv = $("import-result");

  const resetResult = () => {
    if (resultDiv) {
      resultDiv.style.display = "none";
      resultDiv.innerHTML = "";
    }
  };
  const setResult = (html, cls) => {
    if (!resultDiv) return;
    resultDiv.style.display = "block";
    resultDiv.innerHTML = `<div class="${cls}">${html}</div>`;
  };
  const setLoading = (text) => {
    if (goBtn) {
      goBtn.disabled = true;
      goBtn.textContent = text;
    }
    setResult(`<div class="import-loading">${text}…</div>`, "");
  };
  const done = () => {
    if (goBtn) {
      goBtn.disabled = false;
      goBtn.textContent = t("importStart");
    }
  };

  // Tabs: folder / url / html / client / capture
  const tabs = document.querySelectorAll(".import-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const which = tab.dataset.importTab;
      ["folder", "url", "html", "client", "capture"].forEach((pane) => {
        const el = $("import-pane-" + pane);
        if (el) el.style.display = pane === which ? "" : "none";
      });
      resetResult();
    });
  });

  if (fileBtn && fileInput) {
    fileBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (htmlTextarea) htmlTextarea.value = String(reader.result || "");
        // Switch to the HTML pane so the user can review before importing
        tabs.forEach((t) => t.classList.toggle("active", t.dataset.importTab === "html"));
        ["folder", "url", "html", "client", "capture"].forEach((pane) => {
          const el = $("import-pane-" + pane);
          if (el) el.style.display = pane === "html" ? "" : "none";
        });
      };
      reader.readAsText(file);
    });
  }

  if (importBtn) {
    importBtn.addEventListener("click", () => {
      modal.style.display = "flex";
      resetResult();
      if (pathInput && !pathInput.value) pathInput.focus();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });
  }

  if (goBtn) {
    goBtn.addEventListener("click", async () => {
      const activeTab = document.querySelector(".import-tab.active");
      const which = activeTab ? activeTab.dataset.importTab : "folder";
      const clearExisting = clearCheckbox ? clearCheckbox.checked : false;

      // Folder import (existing flow)
      if (which === "folder") {
        const folderPath = pathInput.value.trim();
        if (!folderPath) {
          pathInput.focus();
          return;
        }
        setLoading("正在扫描项目文件夹，提取页面组件");
        try {
          const response = await fetch("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: folderPath, clear_existing: clearExisting }),
          });
          const data = await response.json();
          if (data.success) {
            const pagesHtml = data.pages
              .map(
                (p) =>
                  `<div class="import-page-item"><span class="import-page-name">${p.name}</span><span class="import-page-count">${p.componentCount} 个组件</span></div>`
              )
              .join("");
            setResult(
              `<div class="import-success-icon">✓</div>
               <div class="import-success-summary">扫描 ${data.scanned_files} 个文件，导入 ${data.pages_imported} 个页面，共 ${data.total_components} 个组件</div>
               <div class="import-page-list">${pagesHtml}</div>`,
              "import-success"
            );
            goBtn.textContent = t("importDone");
            setTimeout(() => {
              modal.style.display = "none";
              done();
            }, 2000);
            fetchInitialState();
          } else {
            setResult(data.message || data.error || t("importFailed"), "import-error");
            done();
          }
        } catch (err) {
          setResult(`请求失败: ${err.message || err}`, "import-error");
          done();
        }
        return;
      }

      // 打开客户端界面：把 Prism 自身 UI 导入画布（产品管线 ④ 来源二）
      if (which === "client") {
        setLoading("正在导入客户端界面");
        try {
          const response = await fetch("/api/import-client", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clear_existing: clearExisting }),
          });
          const data = await response.json();
          if (data.success) {
            setResult(
              `<div class="import-success-icon">✓</div>
               <div class="import-success-summary">已导入客户端界面（${data.imported || 0} 个组件），调整后可以一键应用回产物</div>`,
              "import-success"
            );
            goBtn.textContent = t("importDone");
            setTimeout(() => {
              modal.style.display = "none";
              done();
            }, 1500);
            await fetchInitialState();
            renderImportBanner();
          } else {
            setResult(data.error || data.message || t("importFailed"), "import-error");
            done();
          }
        } catch (err) {
          setResult(`请求失败: ${err.message || err}`, "import-error");
          done();
        }
        return;
      }

      // 截取实际界面：把真实运行的 Dashboard 截图放入画布（产品管线 ④ 来源三）
      if (which === "capture") {
        setLoading("正在截取实际界面");
        try {
          const response = await fetch("/api/capture-client", { method: "POST" });
          const data = await response.json();
          if (data.success) {
            setResult(
              `<div class="import-success-icon">✓</div>
               <div class="import-success-summary">已截取实际界面作为参考图（${data.file || ""}），调整后可以一键应用</div>`,
              "import-success"
            );
            goBtn.textContent = t("importDone");
            setTimeout(() => {
              modal.style.display = "none";
              done();
            }, 1500);
            await fetchInitialState();
            renderImportBanner();
          } else {
            setResult(data.error || data.message || t("importFailed"), "import-error");
            done();
          }
        } catch (err) {
          setResult(`请求失败: ${err.message || err}`, "import-error");
          done();
        }
        return;
      }

      // Product import (URL / HTML → 导入自己的产品 → 一键应用)
      const payload = which === "url" ? { url: urlInput ? urlInput.value.trim() : "" } : { html: htmlTextarea ? htmlTextarea.value : "" };
      if (which === "url" && !payload.url) {
        urlInput.focus();
        return;
      }
      if (which === "html" && !payload.html) {
        htmlTextarea.focus();
        return;
      }
      setLoading(which === "url" ? "正在抓取并解析网页" : "正在解析 HTML");
      try {
        const response = await fetch("/api/import/product", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (data.success) {
          setResult(
            `<div class="import-success-icon">✓</div>
             <div class="import-success-summary">${data.message || ""}</div>`,
            "import-success"
          );
          goBtn.textContent = t("importDone");
          setTimeout(() => {
            modal.style.display = "none";
            done();
          }, 1500);
          await fetchInitialState();
          renderImportBanner();
        } else {
          setResult(data.error || data.message || t("importFailed"), "import-error");
          done();
        }
      } catch (err) {
        setResult(`请求失败: ${err.message || err}`, "import-error");
        done();
      }
    });

    // Submit on Enter key (folder tab)
    if (pathInput) {
      pathInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") goBtn.click();
      });
    }
  }
}

// ===== 导入 → 调整 → 一键应用 banner =====

function renderImportBanner() {
  const banner = $("import-banner");
  if (!banner) return;
  const record = currentState && currentState.imports ? currentState.imports[currentState.currentPageId] : null;
  if (!record) {
    banner.style.display = "none";
    return;
  }
  banner.style.display = "flex";
  const text = $("import-banner-text");
  if (text) {
    text.textContent = t("importedBanner", { source: record.source, n: record.component_count });
  }
}

function setupApplyBanner() {
  const applyBtn = $("apply-btn");
  const rollbackBtn = $("apply-rollback-btn");
  const closeBtn = $("import-banner-close");
  const banner = $("import-banner");
  const resultModal = $("apply-result-modal");
  const resultClose = $("apply-result-close");
  const resultRollback = $("apply-result-rollback");
  const resultDone = $("apply-result-done");
  const resultList = $("apply-result-list");

  const closeResult = () => {
    if (resultModal) resultModal.style.display = "none";
  };
  if (resultClose) resultClose.addEventListener("click", closeResult);
  if (resultDone) resultDone.addEventListener("click", closeResult);
  if (resultModal) {
    resultModal.addEventListener("click", (e) => {
      if (e.target === resultModal) closeResult();
    });
  }

  const doRollback = async (btn) => {
    if (btn) btn.disabled = true;
    try {
      const res = await fetch("/api/apply/rollback", { method: "POST" });
      const data = await res.json();
      showToastMsg(data.success ? t("rolledBack", { file: data.restored ? data.restored.split(/[\\/]/).pop() : "" }) : (data.message || t("rollbackNone")));
      if (data.success) closeResult();
    } catch (err) {
      showToastMsg(t("appliedError") + ": " + err.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  if (applyBtn) {
    applyBtn.addEventListener("click", async () => {
      applyBtn.disabled = true;
      try {
        const res = await fetch("/api/apply", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || String(res.status));
        showToastMsg(t("appliedResult", { n: data.files.length, backup: data.backup ? data.backup.split(/[\\/]/).pop() : "—" }));
        // 展示产物路径：调整写到哪里 + 如何引入 CSS
        if (resultModal && resultList) {
          const html = data.files
            .map((f) => {
              const name = f.file.split(/[\\/]/).pop();
              const cssHint = name && name.endsWith(".css")
                ? `<div class="apply-result-hint">在你的产品 HTML 中加入：<code>&lt;link rel="stylesheet" href="${name}"&gt;</code></div>`
                : "";
              return `<div class="apply-result-item"><span class="apply-result-name">${name}</span><code class="apply-result-path">${f.file}</code>${cssHint}</div>`;
            })
            .join("");
          resultList.innerHTML = html;
          resultModal.style.display = "flex";
        }
      } catch (err) {
        showToastMsg(t("appliedError") + ": " + err.message, true);
      } finally {
        applyBtn.disabled = false;
      }
    });
  }
  if (rollbackBtn) {
    rollbackBtn.addEventListener("click", () => doRollback(rollbackBtn));
  }
  if (resultRollback) {
    resultRollback.addEventListener("click", () => doRollback(resultRollback));
  }
  if (closeBtn && banner) {
    closeBtn.addEventListener("click", () => {
      banner.style.display = "none";
    });
  }
}

// ===== Project Persistence (save / load) =====

function flashButton(btn, text, duration = 1500) {
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = text;
  btn.classList.add("sent");
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("sent");
  }, duration);
}

function setupProjectPersistence() {
  const projectBtn = $("project-btn");
  const modal = $("project-modal");
  const closeBtn = $("project-close");
  const saveBtn = $("project-save-btn");
  if (!projectBtn || !modal) return;

  projectBtn.addEventListener("click", () => {
    modal.style.display = "flex";
    renderProjectList();
  });
  if (closeBtn) closeBtn.addEventListener("click", () => { modal.style.display = "none"; });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display === "flex") modal.style.display = "none";
  });

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const name = currentState && currentState.projectName ? currentState.projectName : "Untitled Project";
      saveBtn.disabled = true;
      try {
        const response = await fetch("/api/project/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        flashButton(saveBtn, response.ok ? "已保存 ✓" : "保存失败 ✕");
        if (response.ok) renderProjectList();
      } catch (err) {
        console.error("Save failed:", err);
        flashButton(saveBtn, "保存失败 ✕");
      } finally {
        saveBtn.disabled = false;
      }
    });
  }
}

function setupWriteback() {
  const btn = $("writeback-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (!window.confirm(t("writebackConfirm"))) return;
    btn.disabled = true;
    try {
      const response = await fetch("/api/writeback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });
      if (response.ok) {
        const data = await response.json();
        alert(
          t("writebackDone", {
            count: Object.keys(data.token_map || {}).length,
            files: (data.files || []).join(", "),
            backup: data.backup || "—",
          })
        );
      } else {
        const data = await response.json().catch(() => ({}));
        alert(`${t("writebackError")}: ${data.error || response.status}`);
      }
    } catch (err) {
      console.error("Write-back failed:", err);
      alert(t("writebackError"));
    } finally {
      btn.disabled = false;
    }
  });
}

async function renderProjectList() {
  const list = $("project-list");
  if (!list) return;
  try {
    const res = await fetch("/api/projects");
    const data = await res.json();
    const projects = data.projects || [];
    list.innerHTML = "";
    if (projects.length === 0) {
      list.innerHTML = `<div class="tool-empty">${t("projectEmpty")}</div>`;
      return;
    }
    projects.forEach((p) => {
      const item = el("div", "project-item");
      const meta = el("div", "project-item-meta");
      meta.appendChild(el("div", "project-item-name", p.name));
      meta.appendChild(el("div", "project-item-desc", `${p.component_count} 组件 · ${p.updatedAt ? new Date(p.updatedAt).toLocaleString() : ""}`));
      item.appendChild(meta);
      const load = el("button", "project-item-load", t("load"));
      load.addEventListener("click", async () => {
        const res = await fetch("/api/project/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: p.file }),
        });
        if (res.ok) {
          modalClose("project-modal");
          await fetchInitialState();
        }
      });
      item.appendChild(load);
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<div class="tool-empty">${t("projectEmpty")}</div>`;
  }
}

function modalClose(id) {
  const modal = $(id);
  if (modal) modal.style.display = "none";
}

// ===== Tool tabs: Library / Versions / Comments =====

function setupToolTabs() {
  const tabs = document.querySelectorAll(".tool-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentToolTab = tab.dataset.tool;
      document.querySelectorAll(".tool-pane").forEach((pane) => pane.classList.remove("active"));
      const pane = $("pane-" + currentToolTab);
      if (pane) pane.classList.add("active");
      if (currentToolTab === "versions") renderVersions();
      if (currentToolTab === "comments") renderComments();
    });
  });
}

// ===== Versions panel =====

async function renderVersions() {
  const list = $("version-list");
  if (!list) return;
  try {
    const res = await fetch("/api/versions");
    const data = await res.json();
    const versions = data.versions || [];
    list.innerHTML = "";
    if (versions.length === 0) {
      list.innerHTML = `<div class="tool-empty">${t("versionEmpty")}</div>`;
      return;
    }
    const latestId = versions[0].id;
    versions.forEach((v) => {
      const item = el("div", "version-item");
      const meta = el("div", "version-item-meta");
      meta.appendChild(el("div", "version-item-name", v.name));
      meta.appendChild(el("div", "version-item-desc", `${v.component_count} 组件 · ${new Date(v.createdAt).toLocaleString()}`));
      item.appendChild(meta);
      const actions = el("div", "version-item-actions");
      const restore = el("button", "toolbar-btn", t("restoreVersion"));
      restore.addEventListener("click", async () => {
        const res = await fetch(`/api/version/${v.id}/restore`, { method: "POST" });
        if (res.ok) {
          await fetchInitialState();
          renderVersions();
        }
      });
      actions.appendChild(restore);
      if (v.id !== latestId) {
        const diff = el("button", "toolbar-btn", t("diffLatest"));
        diff.addEventListener("click", async () => {
          const res = await fetch("/api/version/diff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from_id: v.id, to_id: latestId }),
          });
          if (res.ok) {
            const d = await res.json();
            alert((d.summary || []).join("\n") || "无差异");
          }
        });
        actions.appendChild(diff);
      }
      item.appendChild(actions);
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<div class="tool-empty">${t("versionEmpty")}</div>`;
  }
}

function setupVersionsPanel() {
  const create = $("version-create-btn");
  if (!create) return;
  create.addEventListener("click", async () => {
    const name = window.prompt(t("saveTemplatePrompt")) || undefined;
    const res = await fetch("/api/version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || undefined }),
    });
    if (res.ok) renderVersions();
  });
}

// ===== Comments panel =====

async function renderComments() {
  const list = $("comment-list");
  if (!list) return;
  try {
    const res = await fetch("/api/comments");
    const data = await res.json();
    const comments = data.comments || [];
    list.innerHTML = "";
    if (comments.length === 0) {
      list.innerHTML = `<div class="tool-empty">${t("commentEmpty")}</div>`;
      return;
    }
    comments.forEach((c) => {
      const item = el("div", "comment-item");
      const head = el("div", "comment-item-head");
      head.appendChild(el("span", "comment-item-author", c.author));
      head.appendChild(el("span", "comment-item-time", new Date(c.createdAt).toLocaleTimeString()));
      item.appendChild(head);
      item.appendChild(el("div", "comment-item-text", c.text));
      const del = el("button", "comment-item-del", "✕");
      del.title = "删除";
      del.addEventListener("click", async () => {
        await fetch(`/api/comment/${c.id}`, { method: "DELETE" });
        renderComments();
      });
      item.appendChild(del);
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<div class="tool-empty">${t("commentEmpty")}</div>`;
  }
}

function setupCommentsPanel() {
  const addBtn = $("comment-add-btn");
  const input = $("comment-input");
  if (!addBtn || !input) return;
  addBtn.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;
    if (!selectedComponentId) {
      input.placeholder = t("commentPlaceholder");
      return;
    }
    const res = await fetch("/api/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: selectedComponentId, text, author: "user" }),
    });
    if (res.ok) {
      input.value = "";
      renderComments();
    }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBtn.click();
  });
}

// ===== Local search / filter (P1-5) =====

function setupLibrarySearch() {
  const input = $("library-search");
  if (!input) return;
  input.addEventListener("input", () => {
    librarySearchQuery = input.value.trim().toLowerCase();
    document.querySelectorAll("#library-list .lib-item").forEach((item) => {
      const haystack = (item.textContent || "").toLowerCase();
      item.style.display = haystack.includes(librarySearchQuery) ? "" : "none";
    });
  });
}

function setupTokenSearch() {
  const input = $("token-search");
  if (!input) return;
  input.addEventListener("input", () => {
    tokenSearchQuery = input.value.trim().toLowerCase();
    renderTokenPanel();
  });
}

function setupActivityFilter() {
  const input = $("activity-search");
  const source = $("activity-source");
  if (input) {
    input.addEventListener("input", () => {
      activitySearchQuery = input.value.trim().toLowerCase();
      renderActivityLog();
    });
  }
  if (source) {
    source.addEventListener("change", () => {
      activitySourceFilter = source.value;
      renderActivityLog();
    });
  }
}

// ===== Design Library =====

// Animation presets
const LIBRARY_ANIMATIONS = [
  { id: "fadeUp", name: "淡入上移", desc: "从下方淡入", icon: "↑", entry: "fadeUp", duration: 0.4 },
  { id: "fadeIn", name: "淡入", desc: "纯透明度淡入", icon: "◐", entry: "fadeIn", duration: 0.3 },
  { id: "scaleIn", name: "缩放进入", desc: "从小到大缩放", icon: "⊙", entry: "scaleIn", duration: 0.35 },
  { id: "slideRight", name: "右滑入场", desc: "从左侧滑入", icon: "→", entry: "slideRight", duration: 0.4 },
  { id: "slideLeft", name: "左滑入场", desc: "从右侧滑入", icon: "←", entry: "slideLeft", duration: 0.4 },
  { id: "slideUp", name: "上滑入场", desc: "从底部滑入", icon: "↑", entry: "slideUp", duration: 0.4 },
  { id: "spring", name: "弹性弹出", desc: "带回弹的缩放", icon: "◆", entry: "spring", duration: 0.6 },
  { id: "bounceIn", name: "Q 弹跳入", desc: "弹性跳跳进入", icon: "◉", entry: "bounceIn", duration: 0.6 },
  { id: "flipIn", name: "3D 翻转进入", desc: "绕 X 轴翻转进入", icon: "⇅", entry: "flipIn", duration: 0.5 },
  { id: "cinematic", name: "电影级入场", desc: "缩放上浮 + 模糊", icon: "▷", entry: "cinematic", duration: 0.7 },
  { id: "shimmer", name: "微光闪烁", desc: "骨架屏微光扫过", icon: "✦", entry: "shimmer", duration: 1.2 },
  { id: "glitch", name: "故障色差", desc: "故障抖动色差", icon: "⇡", entry: "glitch", duration: 0.5 },
  { id: "morphBlob", name: "流体变形", desc: "圆角形态变形进入", icon: "◒", entry: "morphBlob", duration: 0.8 },
  { id: "liftHover", name: "悬停浮起", desc: "鼠标悬停上浮", icon: "⇡", hover: "lift" },
  { id: "scaleHover", name: "悬停放大", desc: "鼠标悬停放大", icon: "⊕", hover: "scaleUp" },
  { id: "glowHover", name: "悬停发光", desc: "鼠标悬停发光", icon: "✧", hover: "glow" },
  { id: "rippleHover", name: "涟漪波纹", desc: "点击/悬停波纹扩散", icon: "≋", hover: "ripple" },
  { id: "spotlightHover", name: "聚光效果", desc: "径向聚光照亮", icon: "◎", hover: "spotlight" },
  { id: "magneticHover", name: "磁吸偏移", desc: "元素跟随光标偏移", icon: "◉", hover: "magnetic" },
  { id: "tiltHover", name: "3D 倾斜", desc: "跟随光标 3D 倾斜", icon: "◩", hover: "tilt" },
];

// Component presets
const LIBRARY_COMPONENTS = [
  { id: "hero", name: "Hero", desc: "英雄区域", icon: "◈", variant: "centered", defaultProps: { title: "用 AI 重新定义设计", subtitle: "从灵感到上线，只需一次对话", button_text: "立即开始" } },
  { id: "hero", name: "Hero 分屏", desc: "左右分栏英雄区", icon: "◈", variant: "split", defaultProps: { title: "产品标题", subtitle: "产品描述文字", button_text: "了解更多" } },
  { id: "navbar", name: "导航栏", desc: "顶部导航", icon: "☰", variant: "", defaultProps: { brand: "Logo", links: ["首页", "功能", "定价", "关于"] } },
  { id: "navbar", name: "导航栏 + CTA", desc: "带行动按钮", icon: "☰", variant: "with_cta", defaultProps: { brand: "Brand", links: ["首页", "功能"], cta_text: "开始使用" } },
  { id: "card_grid", name: "卡片网格 2列", desc: "两列卡片", icon: "▦", variant: "2col", defaultProps: { items: [{ title: "卡片1", description: "描述" }, { title: "卡片2", description: "描述" }] } },
  { id: "card_grid", name: "卡片网格 3列", desc: "三列卡片", icon: "▦", variant: "3col", defaultProps: { items: [{ title: "卡片1" }, { title: "卡片2" }, { title: "卡片3" }] } },
  { id: "card", name: "卡片", desc: "单个卡片", icon: "□", variant: "", defaultProps: { title: "卡片标题", description: "卡片描述内容" } },
  { id: "cta", name: "CTA 行动号召", desc: "转化引导", icon: "➤", variant: "", defaultProps: { title: "准备好开始了吗？", subtitle: "立即体验，开启全新设计旅程", button_text: "免费试用" } },
  { id: "button", name: "按钮", desc: "主按钮", icon: "▢", variant: "", defaultProps: { text: "点击按钮" } },
  { id: "button", name: "次级按钮", desc: "描边按钮", icon: "▢", variant: "secondary", defaultProps: { text: "次要操作" } },
  { id: "footer", name: "页脚", desc: "底部信息", icon: "▭", variant: "", defaultProps: { text: "© 2024 版权所有", links: ["隐私", "条款", "联系"] } },
  { id: "text_section", name: "文本段落", desc: "标题+正文", icon: "¶", variant: "", defaultProps: { title: "章节标题", text: "这里是正文内容区域。" } },
  { id: "feature_list", name: "功能列表", desc: "图标+文字", icon: "✦", variant: "", defaultProps: { items: [{ icon: "✦", title: "功能1", description: "描述" }, { icon: "✦", title: "功能2", description: "描述" }] } },
  { id: "stats", name: "数据统计", desc: "数字展示", icon: "#", variant: "", defaultProps: { items: [{ value: "100+", label: "用户" }, { value: "99%", label: "满意度" }] } },
  { id: "pricing", name: "定价方案", desc: "价格卡片", icon: "$", variant: "", defaultProps: { plans: [{ name: "基础版", price: "¥0", features: ["功能A", "功能B"], button_text: "免费开始" }] } },
  { id: "testimonial", name: "用户评价", desc: "客户见证", icon: '"', variant: "", defaultProps: { quote: "这个产品真的太棒了！", author: "张三", role: "产品经理" } },
  { id: "timeline", name: "时间线", desc: "时间轴", icon: "◷", variant: "", defaultProps: { items: [{ date: "2024-01", title: "里程碑1", description: "描述" }] } },
  { id: "faq", name: "FAQ", desc: "常见问题", icon: "?", variant: "", defaultProps: { items: [{ question: "问题1？", answer: "回答内容" }] } },
  { id: "form", name: "表单", desc: "输入表单", icon: "✎", variant: "", defaultProps: { fields: [{ label: "姓名", type: "text", placeholder: "请输入" }], button_text: "提交" } },
  { id: "image", name: "图片", desc: "图片组件", icon: "▣", variant: "", defaultProps: { src: "", alt: "图片" } },
  { id: "banner", name: "横幅", desc: "通知条", icon: "▬", variant: "", defaultProps: { text: "限时优惠！", button_text: "查看" } },
  { id: "tabs", name: "标签页", desc: "选项卡", icon: "⊟", variant: "", defaultProps: { items: [{ label: "标签1", content: "内容1" }, { label: "标签2", content: "内容2" }] } },
  { id: "accordion", name: "手风琴", desc: "折叠面板", icon: "≡", variant: "", defaultProps: { items: [{ title: "面板1", content: "内容1" }] } },
  { id: "carousel", name: "轮播图", desc: "图片轮播", icon: "◀", variant: "", defaultProps: { slides: [{ title: "幻灯片1", text: "内容" }] } },
  { id: "sidebar", name: "侧边栏", desc: "导航侧栏", icon: "☰", variant: "", defaultProps: { title: "菜单", links: [{ label: "首页", icon: "▣" }] } },
  { id: "breadcrumb", name: "面包屑", desc: "路径导航", icon: "›", variant: "", defaultProps: { items: ["首页", "分类", "当前"] } },
  { id: "pagination", name: "分页", desc: "页码导航", icon: "···", variant: "", defaultProps: { total: 5, current: 1 } },
  { id: "progress", name: "进度条", desc: "进度展示", icon: "━", variant: "", defaultProps: { label: "进度", value: 60 } },
  { id: "badge", name: "徽章", desc: "标签徽章", icon: "●", variant: "default", defaultProps: { text: "新功能" } },
  { id: "avatar", name: "头像组", desc: "用户头像", icon: "◐", variant: "", defaultProps: { avatars: [{ name: "AB" }, { name: "CD" }] } },
  { id: "input", name: "输入框", desc: "单行输入", icon: "⌨", variant: "", defaultProps: { label: "邮箱", placeholder: "请输入邮箱", type: "email" } },
  { id: "grid", name: "网格布局", desc: "通用网格容器", icon: "▦", variant: "3col", defaultProps: { items: [{ title: "单元格 1" }, { title: "单元格 2" }, { title: "单元格 3" }] } },
  { id: "table", name: "数据表格", desc: "表格数据展示", icon: "⊞", variant: "", defaultProps: { columns: ["名称", "状态", "更新时间"], rows: [["项目 A", "进行中", "2 小时前"], ["项目 B", "已完成", "昨天"]] } },
  { id: "alert", name: "提示框", desc: "信息/警告提示", icon: "!", variant: "info", defaultProps: { title: "提示", text: "这是一条提示信息", type: "info" } },
  { id: "tooltip", name: "工具提示", desc: "悬停气泡提示", icon: "◌", variant: "", defaultProps: { trigger: "悬停查看", text: "这里是提示内容" } },
  { id: "bento_grid", name: "便当盒网格", desc: "非对称卡片网格", icon: "▤", variant: "", defaultProps: { items: [{ title: "主卡片", size: "large" }, { title: "小卡片", size: "small" }, { title: "中卡片", size: "medium" }] } },
  { id: "skeleton", name: "骨架屏", desc: "加载占位", icon: "▭", variant: "", defaultProps: { rows: 3 } },
  { id: "command_palette", name: "命令面板", desc: "Cmd+K 搜索", icon: "⌘", variant: "", defaultProps: { placeholder: "搜索或输入命令…", items: ["新建页面", "切换主题", "导出代码"] } },
  { id: "glass_card", name: "玻璃卡片", desc: "毛玻璃质感卡片", icon: "❖", variant: "", defaultProps: { title: "Glass Card", text: "半透明毛玻璃卡片，用于分层内容展示。" } },
  { id: "fab", name: "浮动按钮", desc: "悬浮操作按钮", icon: "⊕", variant: "", defaultProps: { label: "+", hint: "新建" } },
  { id: "marquee", name: "跑马灯", desc: "滚动文字条", icon: "≫", variant: "", defaultProps: { items: ["特性一", "特性二", "特性三", "特性四"] } },
  { id: "feature_grid", name: "功能图标网格", desc: "图标 + 文字网格", icon: "✦", variant: "3col", defaultProps: { items: [{ icon: "✦", title: "功能 1", description: "描述" }, { icon: "◈", title: "功能 2", description: "描述" }, { icon: "◆", title: "功能 3", description: "描述" }] } },
  { id: "cookie_banner", name: "Cookie 横幅", desc: "隐私同意横幅", icon: "◉", variant: "", defaultProps: { text: "我们使用 Cookie 提升体验", accept_text: "接受", decline_text: "拒绝" } },
  { id: "toggle", name: "开关", desc: "切换开关", icon: "◉", variant: "", defaultProps: { label: "通知", checked: true } },
];

// ===== 模板快速变更 (v3.2 支柱⑦ P0) =====
// 组件模板 (COMPONENT_TEMPLATES, mirrors src/template-catalog.ts): ready-made
// blocks — click to add, or with 替换选中 on + a selection, replace in place.
const LIBRARY_BLOCKS = [
  { id: "hero_split_cta", name: "Hero 分屏 + CTA", desc: "左右分栏：标题 + 说明 + 行动按钮", icon: "◈", isBlock: true },
  { id: "navbar_cta", name: "导航栏 + 行动按钮", desc: "Logo + 菜单 + 右上角 CTA", icon: "☰", isBlock: true },
  { id: "pricing_3col", name: "定价三档", desc: "基础 / 专业 / 企业三列定价卡", icon: "$", isBlock: true },
  { id: "signup_form", name: "注册表单", desc: "姓名 + 邮箱 + 密码，提交弹出成功提示", icon: "✎", isBlock: true },
  { id: "testimonial_grid", name: "用户评价墙", desc: "3 条客户见证 + 头像", icon: '"', isBlock: true },
  { id: "stats_bar", name: "数据统计条", desc: "3 个核心指标数字", icon: "#", isBlock: true },
  { id: "faq_accordion", name: "FAQ 手风琴", desc: "常见问题折叠面板", icon: "≡", isBlock: true },
  { id: "cta_banner", name: "CTA 转化横幅", desc: "大标题 + 副标题 + 双按钮，点击打开链接", icon: "➤", isBlock: true },
  { id: "cookie_consent", name: "Cookie 同意横幅", desc: "隐私提示 + 接受/拒绝", icon: "◉", isBlock: true },
  { id: "bento_features", name: "便当盒功能网格", desc: "非对称大小卡片展示功能", icon: "▤", isBlock: true },
];

// 交互模板 (BEHAVIOR_TEMPLATES, mirrors src/template-catalog.ts): one-click
// interaction presets applied to the selected component.
const LIBRARY_INTERACTIONS = [
  { id: "open_link_new_tab", name: "打开链接（新标签页）", desc: "点击后在新标签页打开网址", icon: "↗" },
  { id: "toast_feedback", name: "点击提示", desc: "点击后弹出提示气泡", icon: "◌" },
  { id: "navigate_home", name: "跳转首页", desc: "点击后跳转到项目首页", icon: "⌂" },
  { id: "toggle_self", name: "显隐切换（自身）", desc: "点击显示/隐藏自身", icon: "◐" },
  { id: "submit_feedback", name: "表单提交反馈", desc: "提交表单并提示成功", icon: "✔" },
  { id: "ai_enhance", name: "AI 联动指令", desc: "点击触发一条 AI 优化指令", icon: "✦" },
];

// 替换选中 mode (components tab): when on and a component is selected,
// clicking a library item replaces it in place instead of adding.
let libraryReplaceMode = false;

// Built-in page templates (mirror server-side applyPageTemplate)
const LIBRARY_TEMPLATES = [
  { id: "saas_landing", name: "SaaS 落地页", desc: "导航 + Hero + 功能 + 定价 + CTA", icon: "◈", builtin: true },
  { id: "ecommerce_home", name: "电商首页", desc: "导航 + 促销 Hero + 商品网格", icon: "▣", builtin: true },
  { id: "blog_post", name: "博客文章", desc: "标题 + 正文 + 配图", icon: "✎", builtin: true },
  { id: "portfolio", name: "作品集", desc: "Hero + 4 列卡片 + 关于", icon: "◫", builtin: true },
  { id: "dashboard", name: "数据看板", desc: "导航 + 指标 + 卡片网格", icon: "▦", builtin: true },
];

let currentLibraryTab = "components";

function setupDesignLibrary() {
  setupTopLibrary();
  setupCanvasDropZone();
}

// ===== 顶部设计库 (P1): 13 知识分类 tab + 悬停展开气泡卡片 =====

/** 设计风格 tab = 外观 + 动画 + 鼠标（VibeHub 设计风格 24）。 */
const TOP_STYLE_GROUPS = ["外观", "动画", "鼠标"];

let topLibraryActive = null;

function setupTopLibrary() {
  const tabs = document.querySelectorAll(".top-lib-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      topLibraryActive = tab.dataset.lib;
      renderTopLibraryStrip(topLibraryActive);
    });
  });
  // 默认激活第一个 tab
  if (tabs.length > 0) {
    tabs[0].classList.add("active");
    topLibraryActive = tabs[0].dataset.lib;
    renderTopLibraryStrip(topLibraryActive);
  }
}

/** 渲染顶部库的分类术语卡片条（横向滚动）。 */
function renderTopLibraryStrip(category) {
  const strip = $("top-lib-strip");
  if (!strip) return;
  strip.innerHTML = "";
  const data = window.VIBE_HUB_TERMS;
  if (!data || !data.grouped) {
    strip.innerHTML = `<div class="library-empty">${t("dsError")}</div>`;
    return;
  }
  const groups = category === "设计风格" ? TOP_STYLE_GROUPS : [category];
  groups.forEach((groupName) => {
    const terms = data.grouped[groupName] || [];
    if (terms.length === 0) return;
    const header = el("div", "top-lib-group", groupName);
    strip.appendChild(header);
    const row = el("div", "top-lib-row");
    terms.forEach((term) => row.appendChild(buildTopLibCard(term)));
    strip.appendChild(row);
  });
}

/** 构建单个术语卡片：悬停向下展开气泡（用法 + 图片示例 + 应用）。 */
function buildTopLibCard(term) {
  const card = el("div", "top-lib-card");
  const iconEl = el("span", "vh-icon", term.zh.slice(0, 1));
  const nameBox = el("div", "top-lib-name-box");
  nameBox.appendChild(el("div", "top-lib-name", term.zh));
  nameBox.appendChild(el("div", "top-lib-slug", term.slug));
  card.appendChild(iconEl);
  card.appendChild(nameBox);

  // 气泡层（向下展开）：定义 + 用法 + 图片示例 + 应用按钮
  const bubble = el("div", "top-lib-bubble");
  if (term.youSay) bubble.appendChild(el("div", "vh-yousay", `“${term.youSay}”`));
  if (term.definition) bubble.appendChild(el("div", "vh-def", term.definition));
  const example = el("div", "top-lib-example");
  example.appendChild(buildTermExample(term));
  bubble.appendChild(example);
  // 变种卡组：与原版术语分开展示（悬停展开各自的气泡详情）
  if (term.variantsList && term.variantsList.length > 0) {
    const vGroup = el("div", "top-lib-variants");
    vGroup.appendChild(el("div", "vh-section-label", "变种"));
    const vRow = el("div", "top-lib-vrow");
    term.variantsList.forEach((v) => vRow.appendChild(buildVariantCard(term, v)));
    vGroup.appendChild(vRow);
    bubble.appendChild(vGroup);
  }
  if (term.usage) {
    const u = el("div", "vh-usage");
    u.appendChild(el("div", "vh-section-label", "什么时候用"));
    u.appendChild(el("div", "vh-text", term.usage));
    bubble.appendChild(u);
  }
  if (term.avoid) {
    const av = el("div", "vh-avoid");
    av.appendChild(el("div", "vh-section-label", "什么时候不用"));
    av.appendChild(el("div", "vh-text", term.avoid));
    bubble.appendChild(av);
  }
  if (term.aiPrompt) {
    const ai = el("div", "vh-ai");
    ai.appendChild(el("div", "vh-section-label", "告诉 AI"));
    ai.appendChild(el("div", "vh-text", term.aiPrompt));
    bubble.appendChild(ai);
  }
  const action = vibeTermAction(term);
  if (action) {
    const applyBtn = el("button", "vh-apply", "＋ 添加到画布");
    applyBtn.type = "button";
    applyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      addComponentViaAPI(action);
    });
    bubble.appendChild(applyBtn);
  }
  card.appendChild(bubble);
  return card;
}

/**
 * 变种卡：展示某个术语的具体变体（如毛玻璃的 浅色/深色/强模糊）。
 * 悬停时向上弹出自己的详情气泡（描述 + 该变种的迷你示例）。
 */
function buildVariantCard(parentTerm, variant) {
  const card = el("div", "top-lib-vcard");
  const nameLine = el("div", "top-lib-vname", variant.name);
  if (variant.en) {
    const en = el("span", "top-lib-ven", variant.en);
    nameLine.appendChild(en);
  }
  card.appendChild(nameLine);
  // 迷你示例（基于父术语 + 变种名着色/变体）
  const ex = el("div", "tl-example-box tl-example-mini");
  ex.appendChild(buildVariantExample(parentTerm, variant));
  card.appendChild(ex);
  if (variant.desc) card.appendChild(el("div", "top-lib-vdesc", variant.desc));

  // 变种详情气泡（向上展开，避免与主气泡重叠）
  const vb = el("div", "top-lib-vbubble");
  const info = el("div", "vh-def");
  info.textContent = `${variant.name}${variant.en ? " · " + variant.en : ""}${variant.desc ? " — " + variant.desc : ""}`;
  vb.appendChild(info);
  const action = vibeTermAction(parentTerm);
  if (action) {
    const applyBtn = el("button", "vh-apply", "＋ 添加到画布");
    applyBtn.type = "button";
    applyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      addComponentViaAPI(action);
    });
    vb.appendChild(applyBtn);
  }
  card.appendChild(vb);
  return card;
}

/**
 * 变种的迷你示例：在父术语示例基础上，按变种名做简单变体着色，
 * 让每个变种卡看起来不同。
 */
function buildVariantExample(parentTerm, variant) {
  const base = buildTermExample(parentTerm);
  const name = variant.name || "";
  // 根据变种名调整颜色/样式，产生视觉差异
  const hueMap = [
    ["浅", "Light", "#93c5fd", "#60a5fa"],
    ["深", "Dark", "#1e293b", "#334155"],
    ["强", "Strong", "#f59e0b", "#f97316"],
    ["圆", "Circle", "#34d399", "#10b981"],
    ["胶囊", "Pill", "#a78bfa", "#8b5cf6"],
    ["危险", "Danger", "#f87171", "#ef4444"],
    ["次要", "Outline", "#e2e8f0", "#94a3b8"],
    ["主要", "Primary", "#6366f1", "#4f46e5"],
    ["文字", "Text", "#cbd5e1", "#64748b"],
    ["线性", "Linear", "#6366f1", "#3b82f6"],
    ["径向", "Radial", "#06b6d4", "#0ea5e9"],
    ["双色", "Duotone", "#ec4899", "#f97316"],
    ["同色", "Tonal", "#a5b4fc", "#818cf8"],
    ["中", "Medium", "#818cf8", "#6366f1"],
    ["大", "Large", "#7c3aed", "#6d28d9"],
    ["小", "Small", "#94a3b8", "#64748b"],
  ];
  let hit = null;
  for (const [key, enKey, c1, c2] of hueMap) {
    if (name.includes(key) || (variant.en || "").includes(enKey)) { hit = [c1, c2]; break; }
  }
  if (hit) {
    const [c1, c2] = hit;
    const s = base.style.cssText || "";
    if (s.includes("linear-gradient")) {
      base.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
    } else if (s.includes("background:")) {
      base.style.background = c1;
    } else {
      base.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
    }
    base.style.border = "1px solid transparent";
    base.style.color = "#fff";
  }
  return base;
}

/**
 * 迷你视觉示例：按术语 slug 渲染一个可交互的 CSS 小样，
 * 直观展示该术语长什么样（图片示例的轻量替代）。
 */
function buildTermExample(term) {
  const box = el("div", "tl-example-box");
  const s = term.slug;
  if (s === "gradient") {
    box.style.cssText = "height:54px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#ec4899,#22d3ee);";
  } else if (s === "border-radius" || s === "corner-feel") {
    box.style.cssText = "height:54px;border-radius:14px;background:var(--accent-bg,rgba(124,58,237,.14));display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--accent);";
    box.textContent = "圆角 14px";
  } else if (s === "shadow") {
    box.style.cssText = "height:54px;border-radius:8px;background:var(--surface);box-shadow:0 10px 24px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;font-size:11px;";
    box.textContent = "阴影层级";
  } else if (s === "backdrop-blur") {
    box.style.cssText = "height:54px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#06b6d4);display:flex;align-items:center;justify-content:center;";
    const glass = el("div");
    glass.style.cssText = "width:70%;height:26px;border-radius:6px;background:rgba(255,255,255,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);";
    box.appendChild(glass);
  } else if (s === "opacity") {
    box.style.cssText = "height:54px;border-radius:8px;background:var(--accent);opacity:.45;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;";
    box.textContent = "45% 透明度";
  } else if (s === "dark-mode") {
    box.style.cssText = "height:54px;border-radius:8px;background:#0f1115;color:#f4f4f5;display:flex;align-items:center;justify-content:center;font-size:11px;";
    box.textContent = "深色模式";
  } else if (s === "divider") {
    box.style.cssText = "height:54px;display:flex;align-items:center;gap:10px;";
    box.appendChild(el("span", null, "左"));
    const line = el("span");
    line.style.cssText = "flex:1;height:1px;background:var(--border-strong);";
    box.appendChild(line);
    box.appendChild(el("span", null, "右"));
  } else if (s === "design-token") {
    box.style.cssText = "height:54px;border-radius:8px;background:var(--surface);display:flex;align-items:center;justify-content:center;gap:6px;font-size:10px;";
    ["--primary", "--radius", "--space"].forEach((tk) => {
      const chip = el("span");
      chip.style.cssText = "padding:2px 6px;border:1px solid var(--border);border-radius:4px;font-family:var(--mono);";
      chip.textContent = tk;
      box.appendChild(chip);
    });
  } else if (s === "flex") {
    box.style.cssText = "height:54px;display:flex;align-items:center;justify-content:center;gap:6px;";
    [1, 2, 3].forEach(() => {
      const b = el("span");
      b.style.cssText = "width:22px;height:22px;border-radius:5px;background:var(--accent);";
      box.appendChild(b);
    });
  } else if (s === "grid") {
    box.style.cssText = "height:54px;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;";
    [1, 2, 3, 4, 5, 6].forEach(() => {
      const b = el("span");
      b.style.cssText = "border-radius:4px;background:var(--accent-bg,rgba(124,58,237,.16));";
      box.appendChild(b);
    });
  } else if (s === "space" || s === "margin" || s === "padding") {
    box.style.cssText = "height:54px;display:flex;align-items:center;justify-content:center;";
    const inner = el("div");
    inner.style.cssText = "width:70%;height:34px;border:2px dashed var(--accent);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;";
    inner.textContent = s;
    box.appendChild(inner);
  } else if (s === "animation" || s === "transition" || s === "easing" || s === "spring") {
    box.style.cssText = "height:54px;display:flex;align-items:center;justify-content:center;";
    const ball = el("span");
    ball.style.cssText = "width:26px;height:26px;border-radius:50%;background:var(--accent);animation:tlBounce 1.2s ease-in-out infinite;";
    box.appendChild(ball);
  } else if (s === "hover") {
    box.style.cssText = "height:54px;display:flex;align-items:center;justify-content:center;";
    const btn = el("span");
    btn.style.cssText = "padding:6px 14px;border-radius:6px;background:var(--accent);color:#fff;font-size:11px;transition:transform .15s,box-shadow .15s;";
    btn.textContent = "悬停我";
    btn.addEventListener("mouseenter", () => { btn.style.transform = "translateY(-2px)"; btn.style.boxShadow = "0 6px 14px rgba(99,102,241,.4)"; });
    btn.addEventListener("mouseleave", () => { btn.style.transform = ""; btn.style.boxShadow = ""; });
    box.appendChild(btn);
  } else if (s === "focus") {
    box.style.cssText = "height:54px;display:flex;align-items:center;justify-content:center;";
    const inp = el("span");
    inp.style.cssText = "padding:5px 10px;border:2px solid var(--border);border-radius:6px;font-size:11px;";
    inp.textContent = "聚焦状态";
    inp.addEventListener("mouseenter", () => { inp.style.borderColor = "var(--accent)"; inp.style.boxShadow = "0 0 0 3px var(--accent-bg,rgba(124,58,237,.2))"; });
    inp.addEventListener("mouseleave", () => { inp.style.borderColor = ""; inp.style.boxShadow = ""; });
    box.appendChild(inp);
  } else if (["button", "link", "input", "card", "tag", "badge", "avatar", "table", "list", "alert", "tooltip", "modal", "progress", "skeleton", "switch", "checkbox", "radio", "slider", "select", "tabs", "collapse", "timeline", "carousel", "breadcrumb", "pagination", "steps", "dropdown", "navbar", "footer", "hero", "cta", "pricing", "faq", "search", "menu", "statistic", "empty", "image", "icon", "quote", "spinner", "drawer", "toast", "notification", "form", "upload", "tree", "popover", "popconfirm", "anchor", "back-top", "descriptions", "segmented", "file", "video", "chat-ui", "filter", "chart", "result", "user-voice", "header", "banner", "social-proof", "typography", "serif-sans", "text-truncate"].includes(s)) {
    box.style.cssText = "height:54px;border-radius:8px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;gap:8px;";
    const icon = el("span");
    icon.style.cssText = "width:24px;height:24px;border-radius:6px;background:linear-gradient(135deg,var(--accent),#a78bfa);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;";
    icon.textContent = term.zh.slice(0, 1);
    box.appendChild(icon);
    box.appendChild(el("span", null, term.zh));
  } else {
    box.style.cssText = "height:54px;border-radius:8px;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text-muted);";
    box.textContent = term.zh;
  }
  return box;
}

// 兼容旧引用：renderLibraryList 不再使用（顶部库替代），保留空实现避免调用报错。
function renderLibraryList() {
  const strip = $("top-lib-strip");
  if (strip && topLibraryActive) renderTopLibraryStrip(topLibraryActive);
}


// ===== 重建设计库 (P1): VibeHub 知识卡片 =====

/**
 * VibeHub 分类 → 设计库 tab 的映射。每类术语按 vibe-hub 的 12 个知识分类
 * 分组展示；卡片悬停展开 结构(Anatomy) + 用法 + AI 提示词，并可应用到设计。
 */
const VIBE_TAB_GROUPS = {
  components: ["按钮与链接", "表单", "内容展示", "弹窗与提示", "导航", "官网区块"],
  layout: ["CSS 布局", "页面布局"],
  appearance: ["外观", "文字"],
  animation: ["动画", "鼠标"],
  styles: ["外观", "动画"],
};

/** 术语 slug → Prism 可应用动作（组件类型 / 样式 / 动效）。 */
function vibeTermAction(term) {
  const COMPONENT_MAP = {
    button: { type: "button", props: { text: "按钮" } },
    link: { type: "button", props: { text: "链接 →" }, variant: "ghost" },
    input: { type: "input", props: { label: "输入框", placeholder: "请输入" } },
    textarea: { type: "text_section", props: { text: "多行文本" } },
    checkbox: { type: "form", props: { fields: [{ label: "勾选项", type: "checkbox" }] } },
    switch: { type: "toggle", props: { label: "开关" } },
    slider: { type: "progress", props: { label: "进度", value: 60 } },
    select: { type: "form", props: { fields: [{ label: "下拉", type: "select" }] } },
    form: { type: "form", props: {} },
    table: { type: "table", props: { headers: ["列1", "列2"], rows: [["A", "1"], ["B", "2"]] } },
    list: { type: "feature_list", props: {} },
    card: { type: "card", props: { title: "卡片标题", description: "卡片描述" } },
    tag: { type: "badge", props: { text: "标签" } },
    badge: { type: "badge", props: { text: "徽标" } },
    avatar: { type: "avatar", props: { name: "用户" } },
    statistic: { type: "stats", props: { items: [{ value: "100+", label: "用户" }] } },
    tabs: { type: "tabs", props: {} },
    collapse: { type: "accordion", props: {} },
    timeline: { type: "timeline", props: {} },
    carousel: { type: "carousel", props: {} },
    empty: { type: "banner", props: { text: "暂无内容" } },
    image: { type: "image", props: {} },
    icon: { type: "banner", props: { text: "✦" } },
    quote: { type: "testimonial", props: {} },
    alert: { type: "alert", props: { text: "提示信息" } },
    toast: { type: "alert", props: { text: "轻提示" } },
    modal: { type: "modal", props: { title: "对话框" } },
    drawer: { type: "sidebar", props: { title: "抽屉" } },
    tooltip: { type: "tooltip", props: { text: "提示" } },
    progress: { type: "progress", props: { label: "进度", value: 70 } },
    skeleton: { type: "skeleton", props: {} },
    spinner: { type: "progress", props: { label: "加载中", value: 40 } },
    menu: { type: "sidebar", props: {} },
    breadcrumb: { type: "breadcrumb", props: {} },
    pagination: { type: "pagination", props: {} },
    steps: { type: "progress", props: { label: "步骤 1/3", value: 33 } },
    dropdown: { type: "navbar", props: { brand: "下拉菜单" } },
    search: { type: "input", props: { label: "搜索", placeholder: "搜索…" } },
    hero: { type: "hero", props: { title: "主标题", subtitle: "副标题", button_text: "开始" } },
    cta: { type: "cta", props: { title: "行动号召", button_text: "立即行动" } },
    header: { type: "navbar", props: { brand: "Logo" } },
    navbar: { type: "navbar", props: { brand: "Logo", links: ["首页", "功能"] } },
    footer: { type: "footer", props: {} },
    faq: { type: "faq", props: {} },
    pricing: { type: "pricing", props: {} },
    banner: { type: "banner", props: { text: "公告横幅" } },
  };
  return COMPONENT_MAP[term.slug] || null;
}

/** 渲染 vibe-hub 知识库卡片（悬停展开 结构/用法/AI 提示词）。 */
function renderVibeHubLibrary(tab, opts) {
  const list = $("library-list");
  if (!list) return;
  const appendMode = !!(opts && opts.afterFirst);
  if (!appendMode) list.innerHTML = "";
  const data = window.VIBE_HUB_TERMS;
  if (!data || !data.grouped) {
    if (!appendMode) list.innerHTML = `<div class="library-empty">${t("dsError")}</div>`;
    return;
  }
  // 组件 tab 在可拖拽列表后追加知识卡；其他 tab 全量渲染。
  if (appendMode) {
    const sep = el("div", "lib-group-header", "组件知识（VibeHub）");
    list.appendChild(sep);
  }
  const groups = VIBE_TAB_GROUPS[tab] || [];
  groups.forEach((groupName) => {
    const terms = (data.grouped[groupName] || []);
    if (terms.length === 0) return;
    const header = el("div", "lib-group-header", groupName);
    header.appendChild(el("span", "lib-group-count", `${terms.length}`));
    list.appendChild(header);
    terms.forEach((term) => {
      const card = el("div", "vh-card");
      const top = el("div", "vh-card-top");
      const iconEl = el("span", "vh-icon", term.zh.slice(0, 1));
      top.appendChild(iconEl);
      const nameBox = el("div", "vh-name-box");
      nameBox.appendChild(el("div", "vh-name", term.zh));
      nameBox.appendChild(el("div", "vh-slug", term.slug));
      top.appendChild(nameBox);
      card.appendChild(top);

      // 大白话
      if (term.youSay) card.appendChild(el("div", "vh-yousay", `“${term.youSay}”`));

      // Hover 展开层：定义 + 结构 + 用法 + AI 提示词 + 应用
      const detail = el("div", "vh-detail");
      if (term.definition) detail.appendChild(el("div", "vh-def", term.definition));
      if (term.anatomy) {
        const a = el("div", "vh-anatomy");
        a.appendChild(el("div", "vh-section-label", "组成结构 · Anatomy"));
        a.appendChild(el("div", "vh-text", term.anatomy));
        detail.appendChild(a);
      }
      if (term.variants) {
        const v = el("div", "vh-variants");
        v.appendChild(el("div", "vh-section-label", "常见变体 · Variants"));
        v.appendChild(el("div", "vh-text", term.variants));
        detail.appendChild(v);
      }
      if (term.usage) {
        const u = el("div", "vh-usage");
        u.appendChild(el("div", "vh-section-label", "什么时候用"));
        u.appendChild(el("div", "vh-text", term.usage));
        detail.appendChild(u);
      }
      if (term.avoid) {
        const av = el("div", "vh-avoid");
        av.appendChild(el("div", "vh-section-label", "什么时候不用"));
        av.appendChild(el("div", "vh-text", term.avoid));
        detail.appendChild(av);
      }
      if (term.aiPrompt) {
        const ai = el("div", "vh-ai");
        ai.appendChild(el("div", "vh-section-label", "告诉 AI"));
        ai.appendChild(el("div", "vh-text", term.aiPrompt));
        detail.appendChild(ai);
      }
      const action = vibeTermAction(term);
      if (action) {
        const applyBtn = el("button", "vh-apply", "＋ 添加到画布");
        applyBtn.type = "button";
        applyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          addComponentViaAPI(action);
        });
        detail.appendChild(applyBtn);
      }
      card.appendChild(detail);
      list.appendChild(card);
    });
  });
}

async function renderDesignSystems() {
  const list = $("library-list");
  if (!list) return;
  list.innerHTML = `<div class="library-empty">${t("libraryLoading")}</div>`;
  let systems;
  try {
    const res = await fetch("/api/design-systems");
    const data = await res.json();
    systems = data.systems || [];
  } catch (err) {
    console.error("Load design systems failed:", err);
    list.innerHTML = `<div class="library-empty">${t("dsError")}</div>`;
    return;
  }
  list.innerHTML = "";
  systems.forEach((sys) => {
    const card = el("div", "ds-card");
    const preview = el("div", "ds-preview");
    const p = sys.preview || {};
    preview.style.background = p.bg || "#0B0A0F";
    const chipRow = el("div", "ds-preview-chips");
    [
      ["--surface", p.surface || "#18181B"],
      ["--text", p.text || "#FAFAFA"],
      ["--primary", p.primary || "#8B5CF6"],
    ].forEach(([, color]) => {
      const chip = el("span", "ds-chip");
      chip.style.background = color;
      chipRow.appendChild(chip);
    });
    preview.appendChild(chipRow);
    card.appendChild(preview);

    const text = el("div", "ds-text");
    text.appendChild(el("div", "ds-name", sys.name));
    text.appendChild(el("div", "ds-desc", sys.description || ""));
    card.appendChild(text);

    const applyBtn = el("button", "ds-apply", t("dsApply"));
    applyBtn.type = "button";
    applyBtn.addEventListener("click", async () => {
      applyBtn.disabled = true;
      try {
        const res = await fetch("/api/design-system/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: sys.id }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        showToastMsg(t("dsApplied", { name: sys.name }));
        await fetchInitialState();
      } catch (err) {
        console.error("Apply design system failed:", err);
        showToastMsg(t("dsError"), true);
      } finally {
        applyBtn.disabled = false;
      }
    });
    card.appendChild(applyBtn);
    list.appendChild(card);
  });
  if (systems.length === 0) {
    list.innerHTML = `<div class="library-empty">${t("dsError")}</div>`;
  }
}

async function saveCurrentAsTemplate() {
  const name = window.prompt(t("saveTemplatePrompt"));
  if (!name) return;
  const res = await fetch("/api/template/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.ok) renderLibraryList();
}

async function renderSavedTemplates() {
  const list = $("library-list");
  if (!list) return;
  try {
    const res = await fetch("/api/templates");
    const data = await res.json();
    const templates = data.templates || [];
    if (templates.length === 0) return;
    const sep = el("div", "lib-group-label", t("savedTemplates"));
    list.appendChild(sep);
    templates.forEach((tpl) => {
      const item = el("div", "lib-item");
      const icon = el("span", "lib-item-icon", "▤");
      icon.style.color = "var(--accent)";
      item.appendChild(icon);
      const text = el("div", "lib-item-text");
      text.appendChild(el("div", "lib-item-name", tpl.name));
      text.appendChild(el("div", "lib-item-desc", `${tpl.component_count} 组件`));
      item.appendChild(text);
      item.addEventListener("click", async () => {
        const loadRes = await fetch("/api/template/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: tpl.file }),
        });
        if (loadRes.ok) await fetchInitialState();
      });
      list.appendChild(item);
    });
  } catch (err) {
    // ignore: saved templates unavailable
  }
}

function handleLibraryItemClick(item) {
  if (currentLibraryTab === "components") {
    if (item.isBlock) {
      // 组件模板 (curated block): replace selected in place, or add.
      applyComponentTemplateViaAPI(item, libraryReplaceMode && selectedComponentId ? selectedComponentId : null);
    } else if (libraryReplaceMode && selectedComponentId) {
      replaceComponentViaAPI(selectedComponentId, item);
    } else {
      // Use HTTP API for reliability (WebSocket may have timing issues)
      addComponentViaAPI(item);
    }
  } else if (currentLibraryTab === "interactions") {
    // 交互模板: bind the preset interaction to the selected component.
    if (!selectedComponentId) {
      showToastMsg(t("noSelectionForInteraction"), true);
      return;
    }
    applyBehaviorTemplateViaAPI(selectedComponentId, item.id);
  } else if (currentLibraryTab === "templates") {
    applyTemplateViaAPI(item);
  } else if (currentLibraryTab === "animations") {
    const components = getCurrentComponents();
    if (components.length === 0) {
      const hint = $("canvas-drop-hint");
      if (hint) {
        hint.textContent = t("addComponentAnimFirst");
        hint.style.display = "block";
        setTimeout(() => { hint.style.display = "none"; hint.textContent = "释放以添加到画布"; }, 2000);
      }
      return;
    }
    const target = getAnimationTarget(components);
    if (!target) return;
    send({
      type: "set_animation",
      component_id: target.id,
      entry: item.entry,
      hover: item.hover,
      duration: item.duration,
    });
  }
}

// Apply a component template (组件模板): replace target_id in place, or add.
async function applyComponentTemplateViaAPI(item, targetId) {
  try {
    const response = await fetch("/api/templates/component", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: item.id,
        ...(targetId ? { target_id: targetId } : {}),
      }),
    });
    if (!response.ok) {
      console.error("Failed to apply component template:", response.status);
      showToastMsg("模板应用失败", true);
      return;
    }
    const data = await response.json();
    if (data.mode === "replaced") showToastMsg(t("templateReplaced"));
    else showToastMsg(t("templateAdded"));
  } catch (err) {
    console.error("Failed to apply component template:", err);
    showToastMsg(t("dsError"), true);
  }
}

// Replace a component's definition in place (raw palette path).
async function replaceComponentViaAPI(id, item) {
  try {
    const response = await fetch(`/api/component/${encodeURIComponent(id)}/replace`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: item.id,
        variant: item.variant || undefined,
        props: item.defaultProps || {},
      }),
    });
    if (!response.ok) {
      console.error("Failed to replace component:", response.status);
      showToastMsg(t("dsError"), true);
    } else {
      showToastMsg(t("templateReplaceDone"));
    }
  } catch (err) {
    console.error("Failed to replace component:", err);
    showToastMsg("替换失败", true);
  }
}

// Apply a behavior template (交互模板) to a component.
async function applyBehaviorTemplateViaAPI(componentId, templateId) {
  try {
    const response = await fetch("/api/templates/behavior", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: componentId, template_id: templateId }),
    });
    if (!response.ok) {
      console.error("Failed to apply behavior template:", response.status);
      showToastMsg("交互模板应用失败", true);
      return;
    }
    showToastMsg("交互已绑定（播放模式点击触发）");
  } catch (err) {
    console.error("Failed to apply behavior template:", err);
    showToastMsg("交互模板应用失败", true);
  }
}

async function applyTemplateViaAPI(item) {
  if (item.builtin) {
    const response = await fetch("/api/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: item.id }),
    });
    if (response.ok) await fetchInitialState();
  } else if (item.file) {
    const response = await fetch("/api/template/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: item.file }),
    });
    if (response.ok) await fetchInitialState();
  }
}

// Add component via HTTP API (more reliable than WebSocket for one-shot actions)
async function addComponentViaAPI(item) {
  try {
    const response = await fetch("/api/component", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: item.id,
        variant: item.variant || undefined,
        props: item.defaultProps || {},
      }),
    });
    if (!response.ok) {
      console.error("Failed to add component:", response.status);
    }
  } catch (err) {
    console.error("Failed to add component:", err);
  }
}

function showLibraryPreview(itemEl, item) {
  const popup = $("lib-preview-popup");
  if (!popup) return;

  // Build preview content based on type
  let html = "";
  if (currentLibraryTab === "animations") {
    html = buildAnimationPreview(item);
  } else if (currentLibraryTab === "components") {
    html = buildComponentPreview(item);
  }

  popup.innerHTML = html;
  popup.style.display = "block";

  // Position next to the item
  const rect = itemEl.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  let left = rect.right + 8;
  let top = rect.top;

  // If popup would go off right edge, show on left
  if (left + popupRect.width > window.innerWidth - 16) {
    left = rect.left - popupRect.width - 8;
  }
  // If popup would go off bottom, adjust
  if (top + popupRect.height > window.innerHeight - 16) {
    top = window.innerHeight - popupRect.height - 16;
  }

  popup.style.left = left + "px";
  popup.style.top = Math.max(8, top) + "px";
}

function hideLibraryPreview() {
  const popup = $("lib-preview-popup");
  if (popup) popup.style.display = "none";
}

function buildAnimationPreview(item) {
  return `
    <div class="lib-preview-content">
      <div class="lib-preview-title">${item.name}</div>
      <div class="lib-preview-desc">${item.desc}</div>
      <div class="lib-preview-anim-demo" style="text-align:center;padding:16px;">
        <div class="anim-demo-box" style="display:inline-block;width:40px;height:40px;border-radius:8px;background:var(--accent);animation:demo-${item.id || item.entry || item.hover} 1.5s ${item.duration || 0.4}s ease-in-out infinite;">${item.icon || "◆"}</div>
      </div>
      <div class="lib-preview-hint">点击应用到最近组件</div>
    </div>
    <style>
      @keyframes demo-fadeUp { 0%,100% { opacity:0.3; transform:translateY(12px); } 50% { opacity:1; transform:translateY(0); } }
      @keyframes demo-fadeIn { 0%,100% { opacity:0.2; } 50% { opacity:1; } }
      @keyframes demo-scaleIn { 0%,100% { opacity:0.3; transform:scale(0.7); } 50% { opacity:1; transform:scale(1); } }
      @keyframes demo-slideRight { 0%,100% { opacity:0.3; transform:translateX(-16px); } 50% { opacity:1; transform:translateX(0); } }
      @keyframes demo-slideLeft { 0%,100% { opacity:0.3; transform:translateX(16px); } 50% { opacity:1; transform:translateX(0); } }
      @keyframes demo-slideUp { 0%,100% { opacity:0.3; transform:translateY(16px); } 50% { opacity:1; transform:translateY(0); } }
      @keyframes demo-spring { 0%,100% { opacity:0.3; transform:scale(0.6); } 40% { opacity:1; transform:scale(1.1); } 60% { transform:scale(0.95); } 80% { transform:scale(1); } }
      @keyframes demo-liftHover { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); box-shadow:0 8px 16px rgba(139,92,246,0.3); } }
      @keyframes demo-scaleHover { 0%,100% { transform:scale(1); } 50% { transform:scale(1.15); } }
      @keyframes demo-glowHover { 0%,100% { filter:drop-shadow(0 0 0 var(--accent)); } 50% { filter:drop-shadow(0 0 12px var(--accent)); } }
      @keyframes demo-bounceIn { 0% { opacity:0; transform:scale(0.3); } 50% { opacity:1; transform:scale(1.08); } 70% { transform:scale(0.96); } 100% { transform:scale(1); } }
      @keyframes demo-flipIn { 0% { opacity:0; transform:perspective(500px) rotateX(80deg); } 100% { opacity:1; transform:perspective(500px) rotateX(0); } }
      @keyframes demo-cinematic { 0% { opacity:0; transform:scale(1.25); filter:blur(6px); } 100% { opacity:1; transform:scale(1); filter:blur(0); } }
      @keyframes demo-shimmer { 0% { opacity:0.5; background-position:-200% 0; } 100% { opacity:1; background-position:200% 0; } }
      @keyframes demo-glitch { 0%,100% { transform:translate(0); text-shadow:none; } 20% { transform:translate(-2px,1px); text-shadow:2px 0 #ff00c8,-2px 0 #00f0ff; } 40% { transform:translate(2px,-1px); } 60% { transform:translate(-1px,2px); text-shadow:-2px 0 #ff00c8,2px 0 #00f0ff; } 80% { transform:translate(1px,-2px); } }
      @keyframes demo-morphBlob { 0% { opacity:0; border-radius:60% 40% 55% 45% / 50% 60% 40% 50%; transform:scale(0.7) rotate(8deg); } 100% { opacity:1; border-radius:8px; transform:scale(1) rotate(0); } }
      @keyframes demo-rippleHover { 0% { box-shadow:0 0 0 0 rgba(139,92,246,0.35); } 100% { box-shadow:0 0 0 14px rgba(139,92,246,0); } }
      @keyframes demo-spotlightHover { 0% { background:radial-gradient(circle at 30% 30%, rgba(139,92,246,0.25), transparent 60%); } 50% { background:radial-gradient(circle at 70% 70%, rgba(139,92,246,0.35), transparent 60%); } 100% { background:radial-gradient(circle at 30% 30%, rgba(139,92,246,0.25), transparent 60%); } }
      @keyframes demo-magneticHover { 0%,100% { transform:translate(0,0); } 50% { transform:translate(6px,-4px); } }
      @keyframes demo-tiltHover { 0%,100% { transform:perspective(500px) rotateX(0) rotateY(0); } 50% { transform:perspective(500px) rotateX(6deg) rotateY(-8deg); } }
    </style>
  `;
}

function buildComponentPreview(item) {
  return `
    <div class="lib-preview-content">
      <div class="lib-preview-title">${item.name}</div>
      <div class="lib-preview-desc">${item.desc}</div>
      <div class="lib-preview-comp-demo">
        <span style="font-size:28px;color:var(--accent);">${item.icon || "□"}</span>
        <span style="font-family:var(--mono);font-size:11px;color:var(--text-muted);margin-left:8px;">${item.id}${item.variant ? "/" + item.variant : ""}</span>
      </div>
      <div class="lib-preview-hint">点击添加 · 拖到画布</div>
    </div>
  `;
}

function setupCanvasDropZone() {
  const canvas = $("canvas");
  const hint = $("canvas-drop-hint");
  if (!canvas || !hint) return;

  canvas.addEventListener("dragover", (e) => {
    // Only handle library drags, not component reorders
    if (e.dataTransfer.types.includes("text/plain")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      hint.style.display = "block";
      hint.style.left = (e.clientX - 50) + "px";
      hint.style.top = (e.clientY - 20) + "px";
    }
  });

  canvas.addEventListener("dragleave", (e) => {
    // Only hide if leaving the canvas entirely
    if (!canvas.contains(e.relatedTarget)) {
      hint.style.display = "none";
    }
  });

  canvas.addEventListener("drop", (e) => {
    e.preventDefault();
    hint.style.display = "none";

    try {
      const raw = e.dataTransfer.getData("text/plain");
      // If it's a JSON object from the library, handle it
      if (raw.startsWith("{")) {
        const data = JSON.parse(raw);
        if (data.libType && data.item) {
          handleLibraryDrop(data.item, data.libType);
        }
      }
      // If it's a plain component ID (from reorder), ignore — handled by attachDragHandlers
    } catch (err) {
      // Ignore parse errors
    }
  });
}

function handleLibraryDrop(item, libType) {
  if (libType === "blocks") {
    // 组件模板 dropped on the canvas: add the block (drop never replaces)
    applyComponentTemplateViaAPI(item, null);
  } else if (libType === "components") {
    addComponentViaAPI(item);
  } else if (libType === "animations") {
    const components = getCurrentComponents();
    if (components.length === 0) return;
    const target = getAnimationTarget(components);
    if (!target) return;
    send({
      type: "set_animation",
      component_id: target.id,
      entry: item.entry,
      hover: item.hover,
      duration: item.duration,
    });
  }
}

// Prefer the user-selected component; fall back to the most recent one.
function getAnimationTarget(components) {
  if (selectedComponentId) {
    const selected = components.find((c) => c.id === selectedComponentId);
    if (selected) return selected;
  }
  return components[components.length - 1] || null;
}

