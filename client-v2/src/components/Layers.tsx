// client-v2/src/components/Layers.tsx — 图层面板: 当前页组件按 z 序（顶→底）列表 + 拖拽排序
import { useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { useDesignStore } from "../stores/design";
import { reorderComponents } from "../collab/edits";
import type { ComponentNode } from "../types";

/** 行拖拽载荷 MIME（HTML5 dnd，jsdom 测试以 dataTransfer 桩驱动）。 */
const LAYERS_DRAG_MIME = "text/prism-layers-id";

/** 类型 → 几何字形（不使用 emoji）。 */
const TYPE_GLYPHS: Record<string, string> = {
  text: "▤", button: "▢", image: "▨", card: "■", container: "▣",
  hero: "◆", navbar: "▬", icon: "◈", avatar: "●", divider: "▭", input: "▭",
};
const glyphFor = (type: string): string => TYPE_GLYPHS[type] ?? "▪";

const rowLabel = (node: ComponentNode): string => node.name || node.type;

export function Layers() {
  const state = useDesignStore((s) => s.state);
  const selection = useDesignStore((s) => s.selection);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null); // 插入槽（显示坐标 0..n）

  const page = state?.pages?.find((p) => p.id === state.currentPageId) ?? state?.pages?.[0];
  // 数组序末位 = 最顶层 → 显示时反转（顶→底）
  const display = [...(page?.components ?? [])].reverse();

  const clearDrag = (): void => {
    setDragId(null);
    setDropIndex(null);
  };

  /** 提交落点: 悬停末行 = 插到最底（末尾），其余 = 插到悬停行之上；单事务重写根层级 index。 */
  const commitDrop = (hover: number): void => {
    const drag = dragId;
    clearDrag();
    if (!drag || !page) return;
    const ids = display.map((c) => c.id); // 显示坐标（顶→底）
    if (!ids.includes(drag) || display[hover]?.id === drag) return; // 拖到自己 = 原位
    const without = ids.filter((id) => id !== drag);
    const slot = hover === display.length - 1 ? without.length : without.indexOf(display[hover].id);
    without.splice(slot, 0, drag);
    // 显示序（顶→底）反回数组序（底→顶），ydoc 单事务重写（单 undo 步）
    reorderComponents(page.id, [...without].reverse());
  };

  return (
    <div className="layers-panel" data-testid="layers-panel">
      <h3 className="panel-title">图层</h3>
      {display.length === 0 && <div className="layers-empty">当前页暂无组件</div>}
      {display.map((node, i) => (
        <div key={node.id} className="layers-row-group">
          <div
            data-testid="layers-row"
            className={
              "layers-row" +
              (selection.includes(node.id) ? " selected" : "") +
              (dragId === node.id ? " layers-row--dragging" : "") +
              (dropIndex === i ? " layers-row--drop-above" : "") +
              (dropIndex === display.length && i === display.length - 1 ? " layers-row--drop-below" : "")
            }
            draggable
            onDragStart={(e: ReactDragEvent<HTMLDivElement>) => {
              e.dataTransfer.setData(LAYERS_DRAG_MIME, node.id);
              e.dataTransfer.effectAllowed = "move";
              setDragId(node.id);
              setDropIndex(null);
            }}
            onDragOver={(e: ReactDragEvent<HTMLDivElement>) => {
              if (!dragId) return; // 无拖拽源时不放行 drop
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropIndex(i === display.length - 1 ? display.length : i);
            }}
            onDrop={(e: ReactDragEvent<HTMLDivElement>) => {
              e.preventDefault();
              commitDrop(i);
            }}
            onDragEnd={clearDrag}
            onClick={() => useDesignStore.setState({ selection: [node.id] })}
          >
            <span className="layers-glyph">{glyphFor(node.type)}</span>
            <span className="layers-name">{rowLabel(node)}</span>
            {node.variant && <span className="layers-variant">{node.variant}</span>}
          </div>
          {/* v1: 子组件仅展示（缩进一级、不可拖拽、不作为落点），更深后代不展开；z 序拖拽仅支持根层级 */}
          {[...(node.children ?? [])].reverse().map((child) => (
            <div
              key={child.id}
              data-testid="layers-row"
              className={"layers-row layers-row--child" + (selection.includes(child.id) ? " selected" : "")}
              onClick={() => useDesignStore.setState({ selection: [child.id] })}
            >
              <span className="layers-glyph">{glyphFor(child.type)}</span>
              <span className="layers-name">{rowLabel(child)}</span>
              {child.variant && <span className="layers-variant">{child.variant}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
