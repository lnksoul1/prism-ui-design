import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type { ComponentNode } from "../../types";
import { resolveStyle } from "../../lib/style";
import { isBoxModeComponent } from "../../lib/boxMode";
import { renderLibraryContent } from "./LibraryView";
import { useDesignStore } from "../../stores/design";

interface Props {
  node: ComponentNode;
  selected: boolean;
  breakpoint: "desktop" | "tablet" | "mobile";
  onSelect: (id: string, additive: boolean) => void;
  playMode?: boolean;
  onActivate?: (id: string) => void;
  /** M3 拖拽: 拖动期间的实时位置覆盖（仅根组件）。 */
  dragPos?: { x: number; y: number };
  onDragStart?: (id: string, e: ReactMouseEvent) => void;
  /** M4 调整大小: 单选根组件渲染 SE 角手柄；调整期间实时覆盖宽高（最小 32×32）。 */
  resizeHandle?: boolean;
  resizeBox?: { w: number; h: number };
  onResizeStart?: (id: string, e: ReactMouseEvent) => void;
}

/** M1 渲染策略：已知类型给最小保真呈现，未知类型渲染带类型标签的占位盒。 */
export function ComponentView({ node, selected, breakpoint, onSelect, playMode, onActivate, dragPos, onDragStart, resizeHandle, resizeBox, onResizeStart }: Props) {
  const layout = node.layout;
  const cqWidth = useDesignStore((s) => s.cqWidth);
  const style: CSSProperties = {
    position: "absolute",
    left: dragPos?.x ?? layout?.x ?? 16,
    top: dragPos?.y ?? layout?.y ?? 0,
    width: resizeBox?.w ?? layout?.w ?? 320,
    minHeight: resizeBox?.h ?? layout?.h,
    ...(resolveStyle(node, breakpoint) as CSSProperties),
    ...(selected && cqWidth !== null
      ? { containerType: "inline-size" as const, width: cqWidth }
      : {}),
  };

  const boxModeOn = isBoxModeComponent(node);
  const content = boxModeOn ? (
    <div className="box-mode-placeholder">
      <span className="box-mode-icon">▣</span>
      <span className="box-mode-label">{node.type}</span>
      <span className="box-mode-hint">盒子模式 · 预览时挂载实例</span>
    </div>
  ) : (
    renderContent(node)
  );

  return (
    <div
      data-prism-oid={node.id}
      className={`comp-wrapper ${selected ? "selected" : ""}`}
      style={style}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (playMode) {
          onActivate?.(node.id);
          return;
        }
        onSelect(node.id, e.shiftKey);
        onDragStart?.(node.id, e);
      }}
    >
      {content}
      {!boxModeOn && node.children?.map((child) => (
        <ComponentView
          key={child.id}
          node={child}
          selected={false}
          breakpoint={breakpoint}
          onSelect={onSelect}
          playMode={playMode}
          onActivate={onActivate}
        />
      ))}
      {resizeHandle && (
        <div
          className="resize-handle"
          data-testid="resize-handle"
          onMouseDown={(e) => {
            e.stopPropagation();
            onResizeStart?.(node.id, e);
          }}
        />
      )}
    </div>
  );
}

/** M2 渲染策略：button/text/heading/image 旧类型保持原样，其余派发给
 * LibraryView 的设计库渲染器；未知类型由其回退到 .cv-placeholder。 */
function renderContent(node: ComponentNode): ReactNode {
  return renderLibraryContent(node);
}
