// client-v2/src/lib/shortcuts.ts — 画布键盘快捷键
import { useEffect } from "react";
import { api } from "../api";
import { editComponent, undo, redo } from "../collab/edits";
import { useDesignStore } from "../stores/design";

const NUDGE_STEP = 1;
const NUDGE_STEP_LARGE = 8;

/** 快捷键上下文: 生产取自 design store，测试可注入替身。 */
export interface ShortcutContext {
  selection: string[];
  playMode: boolean;
  linkMode: boolean;
  setSelection: (ids: string[]) => void;
  exitLinkMode: () => void;
}

/** 输入控件内敲键不触发快捷键（保留原生编辑行为）。画布平移/缩放键共用同一守卫。 */
export function isTypingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
  );
}

/** 微移: editComponent 布局合并（x±/y±），每次按键一个 undo 步。 */
export function nudgeComponents(ids: string[], dx: number, dy: number): void {
  for (const id of ids) {
    editComponent(id, (draft) => {
      const layout = (draft.layout as Record<string, number> | undefined) ?? {};
      draft.layout = { ...layout, x: (layout.x ?? 0) + dx, y: (layout.y ?? 0) + dy };
    });
  }
}

const ARROW_DELTAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * 纯快捷键处理器。返回是否消费了按键（调用方据此 preventDefault）。
 * 撤销/重做与顶栏按钮使用完全相同的 collab edits 处理器。
 * 预览模式下不触发（Escape 除外）。
 */
export function handleShortcut(e: KeyboardEvent, ctx: ShortcutContext): boolean {
  if (isTypingTarget(e.target)) return false;

  if (e.key === "Escape") {
    if (ctx.linkMode) ctx.exitLinkMode();
    ctx.setSelection([]);
    return true;
  }
  if (ctx.playMode) return false;

  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (mod && key === "z") {
    if (e.shiftKey) redo();
    else undo();
    return true;
  }
  if (mod && key === "y") {
    redo();
    return true;
  }
  if (mod && key === "d") {
    if (ctx.selection.length > 0) {
      void Promise.all(ctx.selection.map((id) => api.duplicateComponent(id))).then((copies) =>
        ctx.setSelection(copies.map((c) => c.id))
      );
    }
    return true;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (ctx.selection.length === 0) return false;
    for (const id of ctx.selection) void api.deleteComponent(id);
    ctx.setSelection([]);
    return true;
  }
  const delta = ARROW_DELTAS[e.key];
  if (delta) {
    if (ctx.selection.length === 0) return false;
    const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    nudgeComponents(ctx.selection, delta[0] * step, delta[1] * step);
    return true;
  }
  return false;
}

/** App 层挂载一次: document keydown → handleShortcut + preventDefault。 */
export function useCanvasShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = useDesignStore.getState();
      const handled = handleShortcut(e, {
        selection: st.selection,
        playMode: st.playMode,
        linkMode: st.linkMode,
        setSelection: (ids) => useDesignStore.setState({ selection: ids }),
        exitLinkMode: () => st.setLinkMode(false),
      });
      if (handled) e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
