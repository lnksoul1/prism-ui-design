import { useDesignStore } from "../../stores/design";
import { api } from "../../api";
import { ComponentView } from "./ComponentView";
import { CommentsLayer } from "./CommentsLayer";
import { LinkLayer } from "./LinkLayer";
import type { ComponentNode } from "../../types";

export function CanvasStage() {
  const state = useDesignStore((s) => s.state);
  const breakpoint = useDesignStore((s) => s.breakpoint);
  const selection = useDesignStore((s) => s.selection);
  const select = useDesignStore((s) => s.select);
  const clearSelection = useDesignStore((s) => s.clearSelection);
  const cqWidth = useDesignStore((s) => s.cqWidth);
  const setCqWidth = useDesignStore((s) => s.setCqWidth);
  const linkMode = useDesignStore((s) => s.linkMode);
  const setPendingLinkSource = useDesignStore((s) => s.setPendingLinkSource);

  const page = state?.pages?.find((p) => p.id === state.currentPageId) ?? state?.pages?.[0];
  const components: ComponentNode[] = page?.components ?? [];

  return (
    <div
      className="canvas-stage"
      onMouseDown={() => clearSelection()}
      style={{ width: breakpoint === "mobile" ? 390 : breakpoint === "tablet" ? 834 : 1200 }}
    >
      {components.map((node) => (
        <ComponentView
          key={node.id}
          node={node}
          selected={selection.includes(node.id)}
          breakpoint={breakpoint}
          onSelect={(id, additive) => {
            if (linkMode) {
              setPendingLinkSource(id);
              useDesignStore.setState({ selection: [id] });
              return;
            }
            if (additive) select(id);
            else useDesignStore.setState({ selection: [id] });
          }}
        />
      ))}
      {components.length === 0 && <div className="canvas-empty">从左侧设计库添加组件</div>}
      <CommentsLayer page={page} />
      {linkMode && <LinkLayer page={page} />}
      {selection.length === 1 && (
        <div className="cq-toolbar" onMouseDown={(e) => e.stopPropagation()}>
          <label className="cq-label">
            容器宽度
            <input
              data-testid="cq-slider"
              type="range" min={200} max={1200} step={10}
              value={cqWidth ?? 800}
              onChange={(e) => setCqWidth(Number(e.target.value))}
            />
            <span className="cq-value">{cqWidth === null ? "关闭" : `${cqWidth}px`}</span>
          </label>
          <button className="cq-reset" onClick={() => setCqWidth(null)}>关闭容器模拟</button>
          <button
            className="cq-reset"
            onClick={() => {
              const text = prompt("评论内容：");
              if (text) void api.addComment(selection[0], text, { x: 8, y: 8 });
            }}
          >
            添加评论
          </button>
        </div>
      )}
    </div>
  );
}
