import type { CSSProperties, ReactNode } from "react";
import type { ComponentNode } from "../../types";
import { resolveStyle } from "../../lib/style";

interface Props {
  node: ComponentNode;
  selected: boolean;
  breakpoint: "desktop" | "tablet" | "mobile";
  onSelect: (id: string, additive: boolean) => void;
}

/** M1 渲染策略：已知类型给最小保真呈现，未知类型渲染带类型标签的占位盒。 */
export function ComponentView({ node, selected, breakpoint, onSelect }: Props) {
  const layout = node.layout;
  const style: CSSProperties = {
    position: "absolute",
    left: layout?.x ?? 16,
    top: layout?.y ?? 0,
    width: layout?.w ?? 320,
    minHeight: layout?.h,
    ...(resolveStyle(node, breakpoint) as CSSProperties),
  };

  const content = renderContent(node);

  return (
    <div
      data-prism-oid={node.id}
      className={`comp-wrapper ${selected ? "selected" : ""}`}
      style={style}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(node.id, e.shiftKey);
      }}
    >
      {content}
      {node.children?.map((child) => (
        <ComponentView
          key={child.id}
          node={child}
          selected={false}
          breakpoint={breakpoint}
          onSelect={onSelect}
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
