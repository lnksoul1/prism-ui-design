import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type { ComponentNode } from "../../types";
import { resolveStyle } from "../../lib/style";
import { isBoxModeComponent } from "../../lib/boxMode";
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
}

/** M1 渲染策略：已知类型给最小保真呈现，未知类型渲染带类型标签的占位盒。 */
export function ComponentView({ node, selected, breakpoint, onSelect, playMode, onActivate, dragPos, onDragStart }: Props) {
  const layout = node.layout;
  const cqWidth = useDesignStore((s) => s.cqWidth);
  const style: CSSProperties = {
    position: "absolute",
    left: dragPos?.x ?? layout?.x ?? 16,
    top: dragPos?.y ?? layout?.y ?? 0,
    width: layout?.w ?? 320,
    minHeight: layout?.h,
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
    </div>
  );
}

function renderContent(node: ComponentNode): ReactNode {
  const text = pickText(node.props);
  switch (node.type) {
    case "button":
      return <button className="cv-button">{text}</button>;
    case "text":
    case "heading":
      return <span className="cv-text">{text}</span>;
    case "image":
      return <div className="cv-image">{text || node.type}</div>;
    default:
      return <div className="cv-placeholder">{text || node.type}</div>;
  }
}

function pickText(props: Record<string, unknown>): string {
  for (const key of ["text", "title", "label", "button_text", "cta_text", "heading", "brand"]) {
    const v = props[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}
