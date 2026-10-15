/**
 * Preview edit layer.
 *
 * The live-preview artifact is a plain standalone document: nothing else runs in
 * it and it makes no external requests. This module adds the one exception —
 * a self-contained editor that turns the preview into a two-way surface — and it
 * is injected by `design_preview_sync` only. `design_export` keeps producing
 * clean deliverables.
 *
 * The artifact runs inside the panel's sandboxed iframe (opaque origin), so the
 * editor cannot touch the panel directly: it talks over `postMessage` and the
 * panel answers. Messages carry `source: "prism-preview-editor"` when they come
 * from here, and the panel's own messages are handled below.
 *
 * Edits are applied locally first so the page reacts immediately; the panel
 * reports back with `applied`, and the next revision re-renders from the real
 * state either way.
 */

/** Curated token groups the editor exposes; keys are matched by prefix. */
const TOKEN_GROUPS: Array<{ category: string; prefixes: string[] }> = [
  { category: "colors", prefixes: ["color-"] },
  { category: "radii", prefixes: ["radius-"] },
  { category: "spacing", prefixes: ["space-"] },
  { category: "shadows", prefixes: ["shadow-"] },
];

/**
 * The editor, as one inline `<style>` + `<script>` block.
 *
 * Written as plain ES5-style JavaScript inside a template string: the artifact
 * has to stay readable in any browser, and template literals here would fight
 * the TypeScript string. `window.parent === window` disables everything, so
 * opening the preview file directly stays a clean read-only page.
 */
export function previewEditorHTML(): string {
  const groups = JSON.stringify(TOKEN_GROUPS);
  return `<style>
  [data-prism-id] { position: relative; }
  .prism-ed-selected { outline: 2px solid #6c5ce7 !important; outline-offset: -2px; }
  .prism-ed-hover { outline: 1px dashed rgba(108, 92, 231, 0.6) !important; outline-offset: -1px; }
  .prism-ed-bar { position: absolute; z-index: 2147483000; display: flex; gap: 4px; align-items: center;
    padding: 4px; border-radius: 8px; background: rgba(22, 22, 34, 0.94); color: #fff;
    font: 12px/1.4 system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28); flex-wrap: wrap; max-width: 92vw; }
  .prism-ed-bar button, .prism-ed-chip { font: inherit; color: #fff; background: rgba(255, 255, 255, 0.14);
    border: 0; border-radius: 6px; padding: 3px 7px; cursor: pointer; }
  .prism-ed-bar button:hover, .prism-ed-chip:hover { background: rgba(255, 255, 255, 0.28); }
  .prism-ed-bar button.prism-ed-danger { background: rgba(214, 48, 49, 0.85); }
  .prism-ed-chip { max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .prism-ed-label { opacity: 0.7; padding: 0 2px; }
  .prism-ed-line { position: absolute; z-index: 2147482999; height: 3px; background: #6c5ce7; border-radius: 2px; pointer-events: none; }
  .prism-ed-panel { position: fixed; top: 10px; right: 10px; z-index: 2147483001; width: 216px; max-height: 80vh; overflow: auto;
    background: rgba(22, 22, 34, 0.95); color: #fff; border-radius: 10px; padding: 8px 10px;
    font: 12px/1.5 system-ui, sans-serif; box-shadow: 0 8px 26px rgba(0, 0, 0, 0.3); }
  .prism-ed-panel h4 { font-size: 12px; margin: 6px 0 2px; opacity: 0.65; font-weight: 600; letter-spacing: 0.04em; }
  .prism-ed-row { display: flex; align-items: center; gap: 6px; }
  .prism-ed-row input[type="color"] { width: 22px; height: 18px; padding: 0; border: 0; background: none; }
  .prism-ed-row input[type="text"] { flex: 1; min-width: 0; font: inherit; color: #fff;
    background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 5px; padding: 2px 5px; }
  .prism-ed-row span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.8; }
  .prism-ed-toast { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2147483002;
    background: rgba(22, 22, 34, 0.94); color: #fff; border-radius: 8px; padding: 6px 12px;
    font: 12px/1.4 system-ui, sans-serif; opacity: 0; transition: opacity 0.18s; }
  .prism-ed-toast.prism-ed-show { opacity: 1; }
  .prism-ed-hint { position: fixed; left: 10px; bottom: 10px; z-index: 2147483000; background: rgba(22, 22, 34, 0.8);
    color: #fff; border-radius: 8px; padding: 5px 9px; font: 11px/1.4 system-ui, sans-serif; }
</style>
<script>
(function () {
  if (window.parent === window) return; // a directly opened preview stays read-only
  var DOC = document;
  var GROUPS = ${groups};
  var selected = null;
  var bar = null;
  var line = null;
  var toast = null;
  var toastTimer = null;

  function post(msg) {
    msg.source = "prism-preview-editor";
    try { window.parent.postMessage(msg, "*"); } catch (e) {}
  }

  function say(text) {
    if (!toast) {
      toast = DOC.createElement("div");
      toast.className = "prism-ed-toast";
      DOC.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.className = "prism-ed-toast prism-ed-show";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.className = "prism-ed-toast"; }, 1800);
  }

  function rootOf(node) {
    while (node && node !== DOC.body) {
      if (node.getAttribute && node.getAttribute("data-prism-id")) return node;
      node = node.parentNode;
    }
    return null;
  }

  function idOf(node) {
    var root = rootOf(node);
    return root ? root.getAttribute("data-prism-id") : null;
  }

  function propsOf(root) {
    try { return JSON.parse(root.getAttribute("data-prism-props") || "{}"); } catch (e) { return {}; }
  }

  function siblingRoots(root) {
    var parent = root.parentNode;
    var out = [];
    if (!parent) return out;
    for (var i = 0; i < parent.children.length; i++) {
      var child = parent.children[i];
      if (child.getAttribute && child.getAttribute("data-prism-id")) out.push(child);
    }
    return out;
  }

  function clearBar() {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = null;
    if (line && line.parentNode) line.parentNode.removeChild(line);
    line = null;
  }

  function clearSelection() {
    if (selected) selected.className = selected.className.replace(/ ?prism-ed-selected/g, "");
    selected = null;
    clearBar();
  }

  function button(label, title, handler, danger) {
    var b = DOC.createElement("button");
    b.textContent = label;
    if (title) b.title = title;
    if (danger) b.className = "prism-ed-danger";
    b.addEventListener("click", function (ev) { ev.stopPropagation(); handler(b); });
    return b;
  }

  function placeBar(root) {
    var rect = root.getBoundingClientRect();
    bar.style.top = Math.max(4, rect.top + window.scrollY - 34) + "px";
    bar.style.left = Math.max(4, rect.left + window.scrollX) + "px";
  }

  function startTextEdit(root, prop, current) {
    var target = null;
    var nodes = root.querySelectorAll("*");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].children.length === 0 && nodes[i].textContent.trim() === String(current).trim()) { target = nodes[i]; break; }
    }
    if (!target) { say("没找到对应的文本节点"); return; }
    target.setAttribute("contenteditable", "true");
    target.focus();
    var range = DOC.createRange();
    range.selectNodeContents(target);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    var done = function (commit) {
      target.removeAttribute("contenteditable");
      target.removeEventListener("blur", onBlur);
      target.removeEventListener("keydown", onKey);
      if (!commit) { target.textContent = current; return; }
      var next = target.textContent;
      if (next.trim() === String(current).trim()) return;
      var props = {};
      props[prop] = next;
      post({ type: "edit", edit: { op: "set_props", id: root.getAttribute("data-prism-id"), props: props } });
      say("已提交文字修改，等待写回");
    };
    var onBlur = function () { done(true); };
    var onKey = function (ev) {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); target.blur(); }
      if (ev.key === "Escape") { ev.preventDefault(); done(false); }
    };
    target.addEventListener("blur", onBlur);
    target.addEventListener("keydown", onKey);
  }

  function select(root) {
    if (selected === root) return;
    clearSelection();
    selected = root;
    root.className += " prism-ed-selected";
    bar = DOC.createElement("div");
    bar.className = "prism-ed-bar";
    var id = root.getAttribute("data-prism-id");
    var type = root.getAttribute("data-prism-type") || "";
    var label = DOC.createElement("span");
    label.className = "prism-ed-label";
    label.textContent = type;
    bar.appendChild(label);

    var props = propsOf(root);
    var textKeys = [];
    for (var key in props) {
      if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
      if (typeof props[key] === "string" && props[key].trim() && textKeys.length < 4) textKeys.push(key);
    }
    textKeys.forEach(function (key) {
      var chip = DOC.createElement("button");
      chip.className = "prism-ed-chip";
      chip.textContent = "✎ " + key;
      chip.title = "编辑 " + key + "：" + props[key];
      chip.addEventListener("click", function (ev) {
        ev.stopPropagation();
        startTextEdit(root, key, props[key]);
      });
      bar.appendChild(chip);
    });

    var roots = siblingRoots(root);
    var index = roots.indexOf(root);
    if (index > 0) bar.appendChild(button("↑", "上移一层", function () {
      post({ type: "edit", edit: { op: "move", id: id, before: roots[index - 1].getAttribute("data-prism-id") } });
      say("已提交上移");
    }));
    if (index >= 0 && index < roots.length - 1) bar.appendChild(button("↓", "下移一层", function () {
      post({ type: "edit", edit: { op: "move", id: id, after: roots[index + 1].getAttribute("data-prism-id") } });
      say("已提交下移");
    }));
    bar.appendChild(button("⠿", "拖动到别处", function () { beginDrag(root); }));
    bar.appendChild(button("↶", "撤销", function () { post({ type: "edit", edit: { op: "undo" } }); say("已提交撤销"); }));
    bar.appendChild(button("↷", "重做", function () { post({ type: "edit", edit: { op: "redo" } }); say("已提交重做"); }));
    var del = button("✕", "删除", function (self) {
      if (self.textContent !== "✕") {
        post({ type: "edit", edit: { op: "remove", id: id } });
        say("已提交删除");
        return;
      }
      self.textContent = "确认删除";
      self.className = "prism-ed-danger";
      setTimeout(function () { self.textContent = "✕"; }, 2500);
    }, true);
    bar.appendChild(del);

    DOC.body.appendChild(bar);
    placeBar(root);
  }

  function dropTargetAt(x, y) {
    var hidden = [];
    if (bar) { hidden.push([bar, bar.style.display]); bar.style.display = "none"; }
    if (line) { hidden.push([line, line.style.display]); line.style.display = "none"; }
    var node = DOC.elementFromPoint(x, y);
    hidden.forEach(function (pair) { pair[0].style.display = pair[1]; });
    return rootOf(node);
  }

  function beginDrag(root) {
    var id = root.getAttribute("data-prism-id");
    if (!line) { line = DOC.createElement("div"); line.className = "prism-ed-line"; }
    say("拖动中：放到某个组件上（放到组件内部 = 移入它）");
    var move = function (ev) {
      var target = dropTargetAt(ev.clientX, ev.clientY);
      if (!target || target === root) { line.style.display = "none"; return; }
      var rect = target.getBoundingClientRect();
      var inside = ev.clientY > rect.top + rect.height * 0.3 && ev.clientY < rect.bottom - rect.height * 0.3;
      line.style.display = "block";
      line.style.left = (rect.left + window.scrollX) + "px";
      line.style.width = rect.width + "px";
      line.style.top = (inside ? rect.top + rect.height / 2 : (ev.clientY < rect.top + rect.height / 2 ? rect.top : rect.bottom) - 1.5) + window.scrollY + "px";
      line.setAttribute("data-mode", inside ? "into" : ev.clientY < rect.top + rect.height / 2 ? "before" : "after");
      line.setAttribute("data-target", target.getAttribute("data-prism-id"));
    };
    var up = function (ev) {
      DOC.removeEventListener("pointermove", move, true);
      DOC.removeEventListener("pointerup", up, true);
      var mode = line.getAttribute("data-mode");
      var targetId = line.getAttribute("data-target");
      line.style.display = "none";
      if (!mode || !targetId || targetId === id) return;
      if (mode === "into") post({ type: "edit", edit: { op: "reparent", id: id, parentId: targetId } });
      else post({ type: "edit", edit: { op: "move", id: id, before: mode === "before" ? targetId : undefined, after: mode === "after" ? targetId : undefined } });
      say(mode === "into" ? "已提交移入" : "已提交移动");
      void ev;
    };
    DOC.addEventListener("pointermove", move, true);
    DOC.addEventListener("pointerup", up, true);
  }

  function tokenPanel() {
    var panel = DOC.createElement("div");
    panel.className = "prism-ed-panel";
    var head = DOC.createElement("div");
    head.className = "prism-ed-row";
    var title = DOC.createElement("span");
    title.textContent = "设计令牌";
    var toggle = DOC.createElement("button");
    toggle.textContent = "–";
    toggle.style.marginLeft = "auto";
    head.appendChild(title);
    head.appendChild(toggle);
    panel.appendChild(head);
    var body = DOC.createElement("div");
    panel.appendChild(body);

    var computed = window.getComputedStyle(DOC.documentElement);
    GROUPS.forEach(function (group) {
      var rows = [];
      for (var i = 0; i < computed.length; i++) {
        var name = computed[i];
        if (name.indexOf("--") !== 0) continue;
        var key = name.slice(2);
        var matched = group.prefixes.some(function (prefix) { return key.indexOf(prefix) === 0; });
        if (!matched) continue;
        var value = computed.getPropertyValue(name).trim();
        if (!value) continue;
        rows.push([key, value]);
      }
      if (!rows.length) return;
      var h = DOC.createElement("h4");
      h.textContent = group.category;
      body.appendChild(h);
      rows.forEach(function (pair) {
        var row = DOC.createElement("div");
        row.className = "prism-ed-row";
        var key = pair[0];
        var value = pair[1];
        var isColor = group.category === "colors" && /^#|^rgb/.test(value);
        var input = DOC.createElement("input");
        input.type = isColor ? "color" : "text";
        input.value = isColor ? (value.charAt(0) === "#" ? value : value) : value;
        input.title = key;
        var name = DOC.createElement("span");
        name.textContent = key;
        var commit = function () {
          var next = input.value;
          DOC.documentElement.style.setProperty("--" + key, next);
          post({ type: "edit", edit: { op: "set_token", category: group.category, key: key, value: next } });
          say("已提交 " + key);
        };
        input.addEventListener("change", commit);
        if (!isColor) {
          input.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") { ev.preventDefault(); commit(); }
          });
        }
        row.appendChild(input);
        row.appendChild(name);
        body.appendChild(row);
      });
    });

    toggle.addEventListener("click", function () {
      var hidden = body.style.display === "none";
      body.style.display = hidden ? "block" : "none";
      toggle.textContent = hidden ? "–" : "+";
    });
    DOC.body.appendChild(panel);
  }

  DOC.addEventListener("click", function (ev) {
    if (bar && bar.contains(ev.target)) return;
    if (ev.target.closest && ev.target.closest(".prism-ed-panel")) return;
    var root = rootOf(ev.target);
    if (!root) { clearSelection(); return; }
    ev.preventDefault();
    select(root);
  }, true);

  DOC.addEventListener("pointerover", function (ev) {
    var root = rootOf(ev.target);
    if (!root || root === selected) return;
    root.className += " prism-ed-hover";
    setTimeout(function () { root.className = root.className.replace(/ ?prism-ed-hover/g, ""); }, 400);
  }, true);

  var scrollTimer = null;
  window.addEventListener("scroll", function () {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function () {
      scrollTimer = null;
      post({ type: "scroll", y: window.scrollY });
    }, 250);
  });

  window.addEventListener("message", function (ev) {
    var data = ev.data;
    if (!data || data.source !== "prism-panel") return;
    if (data.type === "restore-scroll" && typeof data.y === "number") window.scrollTo(0, data.y);
    if (data.type === "applied") say(data.ok ? "已写回设计状态" : "写回失败：" + (data.message || "未知错误"));
  });

  tokenPanel();
  post({ type: "ready", components: DOC.querySelectorAll("[data-prism-id]").length });
})();
</script>
<div class="prism-ed-hint">点击组件即可编辑：✎ 改文字 · ↑↓ 调顺序 · ⠿ 拖动 · ✕ 删除</div>`;
}
