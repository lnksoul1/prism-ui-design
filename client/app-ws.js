// /* === SPLIT-MODULE === */
/**
 * Prism Dashboard — WebSocket connection, message handling and full render.
 *
 * Part of the split client application. All parts are global-scope scripts;
 * they must be loaded in the order declared in index.html.
 */

// ===== WebSocket Connection =====

// Phase 2.4 (增量更新): component ids the latest change touched, so the
// renderer can re-render only those instead of the whole canvas.
let lastChangeAffectedIds = null;

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
    const payload = { ...msg };
    // Optimistic concurrency: attach the revision the client last saw (C5).
    if (msg.type !== "cursor" && currentState && typeof currentState.revision === "number") {
      payload.base_revision = currentState.revision;
    }
    ws.send(JSON.stringify(payload));
  }
}

function setupLiveCursors() {
  const scrollWrap = $("canvas-scroll-wrap");
  if (!scrollWrap) return;
  // Phase 2.5: pointermove covers mouse + touch; throttled to CURSOR_THROTTLE.
  const report = (e) => {
    const now = Date.now();
    if (now - lastCursorSent < CURSOR_THROTTLE) return;
    lastCursorSent = now;
    const frame = $("canvas-frame");
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    send({ type: "cursor", x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) });
  };
  scrollWrap.addEventListener("pointermove", report);
}

function renderRemoteCursors() {
  const frame = $("canvas-frame");
  if (!frame) return;
  let overlay = $("cursor-overlay");
  if (remoteCursors.size === 0) {
    if (overlay) overlay.remove();
    return;
  }
  if (!overlay) {
    overlay = el("div", "cursor-overlay");
    overlay.id = "cursor-overlay";
    frame.appendChild(overlay);
  }
  overlay.innerHTML = "";
  remoteCursors.forEach((pos, clientId) => {
    const cursor = el("div", "remote-cursor");
    cursor.style.left = pos.x + "px";
    cursor.style.top = pos.y + "px";
    cursor.appendChild(el("span", "remote-cursor-caret"));
    cursor.appendChild(el("span", "remote-cursor-label", clientId.slice(-6)));
    overlay.appendChild(cursor);
  });
}

function showConflictWarning(msg) {
  const container = $("conflict-warnings");
  if (!container) return;
  const warning = el("div", "conflict-warning");
  warning.appendChild(el("span", "warn-icon", "!"));
  const text = el("span", "warn-text", msg.message || t("conflictTitle"));
  warning.appendChild(text);
  const reload = el("button", "conflict-reload", t("reload"));
  reload.addEventListener("click", () => {
    fetchInitialState();
    warning.remove();
  });
  warning.appendChild(reload);
  container.prepend(warning);
  // Auto-resync after 8s as a safety net; the reload button is instant.
  setTimeout(() => {
    if (warning.parentNode) {
      fetchInitialState();
      warning.remove();
    }
  }, 8000);
}

function updateStatus(status) {
  const dot = $("ws-status");
  const text = $("ws-status-text");
  if (status === "connected") {
    dot.className = "status-dot connected";
    text.textContent = t("connected");
  } else if (typeof status === "number") {
    dot.className = "status-dot connected";
    text.textContent = t("online", { n: status });
  } else if (status === "disconnected") {
    dot.className = "status-dot disconnected";
    text.textContent = t("disconnected");
  } else {
    dot.className = "status-dot";
    text.textContent = t("connecting");
  }
}

// ===== Message Handler =====

function handleMessage(msg) {
  switch (msg.type) {
    case "init":
      myClientId = msg.clientId || null;
      currentState = msg.state;
      renderAll();
      break;
    case "change":
      currentState = msg.state;
      lastChangeAffectedIds = Array.isArray(msg.affected_ids) ? msg.affected_ids : null;
      handleChange(msg.change);
      break;
    case "activity":
      addActivityEntry(msg.entry);
      break;
    case "presence":
      updateStatus(typeof msg.count === "number" ? msg.count : "connected");
      break;
    case "cursor":
      if (!msg.client_id || msg.client_id === myClientId) return;
      remoteCursors.set(msg.client_id, { x: msg.x, y: msg.y });
      renderRemoteCursors();
      break;
    case "cursor_leave":
      if (msg.client_id) remoteCursors.delete(msg.client_id);
      renderRemoteCursors();
      break;
    case "conflict":
      showConflictWarning(msg);
      break;
    case "prompt_accepted":
      setPromptStatus(t("promptAccepted"), "accepted");
      break;
    case "prompt_executed":
      setPromptStatus(t("promptExecuted", { summary: msg.summary || "" }), "accepted");
      showToastMsg(t("promptExecuted", { summary: msg.summary || "" }));
      break;
    case "prompt_result":
      // Executed prompts already arrived as prompt_executed above; here we
      // surface the engine's example instructions when it could not act.
      if (msg.llm === "generating") {
        setPromptStatus(t("llmGenerating"), "queued");
        showToastMsg(t("llmGenerating"));
        break;
      }
      if (!msg.executed) {
        setPromptStatus(t("promptQueued"), "queued");
        if (Array.isArray(msg.suggestions) && msg.suggestions.length > 0) {
          showPromptSuggestions(msg.suggestions);
        }
      }
      break;
    case "llm_error":
      setPromptStatus(t("llmFailed", { error: msg.summary || "" }), "queued");
      showToastMsg(t("llmFailed", { error: msg.summary || "" }), true);
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
    case "setBehavior":
    case "reparentComponent":
    case "groupComponents":
    case "ungroupComponents":
    case "moveToPage":
      // 细粒度变更：优先增量重绘受影响组件（Phase 2.4），兜底静默全量。
      if (lastChangeAffectedIds && lastChangeAffectedIds.length > 0) {
        renderCanvas({ silent: true, onlyIds: lastChangeAffectedIds });
      } else {
        renderCanvas({ silent: true });
      }
      renderLayerPanel();
      break;
    case "duplicateComponent":
    case "reorderComponent":
    case "reorder_component":
      // 这些变更改变 DOM 顺序/插入位置，增量替换无法正确重排 → 全量静默。
      renderCanvas({ silent: true });
      renderLayerPanel();
      break;
    case "setAnimation":
      if (lastChangeAffectedIds && lastChangeAffectedIds.length > 0) {
        renderCanvas({ silent: true, onlyIds: lastChangeAffectedIds });
      } else {
        renderCanvas({ silent: true });
      }
      break;
    case "clearAll":
      renderAll();
      break;
    // New: undo/redo
    case "undo":
    case "redo":
      updateUndoRedoButtons();
      renderCanvas({ silent: true });
      break;
    // New: page management
    case "addPage":
    case "switchPage":
    case "removePage":
    case "renamePage":
      renderPageSwitcher();
      renderCanvas();
      break;
    case "canvasSave":
    case "canvasDraw":
    case "canvasDrawsCleared":
      // 画布绘制已并入组件模型（第一步：预览画布直接绘制）；tldraw 快照
      // 类变更不再影响预览画布，统一走组件渲染。
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
  perfTime("renderAll", () => renderAllImpl());
}

function renderAllImpl() {
  if (!currentState) return;

  // Keep the canvas platform in sync with the server state (C2 seed)
  syncPlatformFromState();

  // Header
  $("project-name").textContent = currentState.projectName || "Untitled";
  $("style-badge").textContent = currentState.style || "--";

  // Pages
  renderPageSwitcher();

  // Canvas
  renderCanvas();
  applyCanvasMode($("canvas"));

  // Layers + inspector (skip inspector rebuild while the user is editing it)
  renderLayerPanel();
  if (!isInspectorFocused()) {
    renderInspector();
  }

  // Comments reflect design-state changes
  renderComments();

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

  // 导入 → 一键应用 banner
  renderImportBanner();
}

function syncPlatformFromState() {
  if (!currentState || typeof currentState.activePlatform !== "string") return;
  if (currentState.activePlatform === currentPlatform) return;
  currentPlatform = currentState.activePlatform;
  const select = $("platform-select");
  if (select && select.value !== currentPlatform) select.value = currentPlatform;
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

