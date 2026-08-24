import { useDesignStore } from "../../stores/design";
import { ComponentView } from "./ComponentView";
import type { ComponentNode } from "../../types";

export function CanvasStage() {
  const state = useDesignStore((s) => s.state);
  const breakpoint = useDesignStore((s) => s.breakpoint);
  const selection = useDesignStore((s) => s.selection);
  const select = useDesignStore((s) => s.select);
  const clearSelection = useDesignStore((s) => s.clearSelection);

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
          onSelect={(id, additive) => (additive ? select(id) : useDesignStore.setState({ selection: [id] }))}
        />
      ))}
      {components.length === 0 && <div className="canvas-empty">从左侧设计库添加组件</div>}
    </div>
  );
}
