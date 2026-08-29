import { useDesignStore } from "../../stores/design";
import { api } from "../../api";
import { ComponentView } from "./ComponentView";
import { CommentsLayer } from "./CommentsLayer";
import { LinkLayer } from "./LinkLayer";
import { runActionFlow, type ActionFlow, type FlowEffect } from "../../lib/actionFlow";
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
  const playMode = useDesignStore((s) => s.playMode);
  const previewPageId = useDesignStore((s) => s.previewPageId);
  const hiddenIds = useDesignStore((s) => s.hiddenIds);
  const toastMsg = useDesignStore((s) => s.toastMsg);

  const page = state?.pages?.find((p) => p.id === (playMode ? (previewPageId ?? state.currentPageId) : state.currentPageId)) ?? state?.pages?.[0];
  const components: ComponentNode[] = (page?.components ?? []).filter((c) => !hiddenIds.includes(c.id));

  const applyEffect = (eff: FlowEffect): void => {
    const st = useDesignStore.getState();
    if (eff.type === "navigate") st.setPreviewPage(eff.pageId);
    else if (eff.type === "toast") st.showToast(eff.message);
    else if (eff.type === "toggle") st.toggleHidden(eff.componentId);
    else if (eff.type === "openUrl") window.open(eff.url, "_blank");
    // delay: M3 预览忽略
  };

  // M3 play mode 激活链: actionFlow > pageLink > behavior
  const activate = (componentId: string): void => {
    const st = useDesignStore.getState();
    const s = st.state;
    if (!s || !page) return;
    const allComponents: ComponentNode[] = [];
    const collect = (nodes: ComponentNode[]): void => {
      for (const n of nodes) { allComponents.push(n); collect(n.children ?? []); }
    };
    s.pages.forEach((p) => collect(p.components));
    const findAny = (id: string): ComponentNode | undefined => allComponents.find((n) => n.id === id);

    const flows = Object.values(s.actionFlows ?? {}).filter(
      (f) => f.componentId === componentId && f.enabled
    );
    if (flows.length > 0) {
      const ctx = {
        hasPage: (id: string) => s.pages.some((p) => p.id === id),
        hasComponent: (id: string) => !!findAny(id),
      };
      for (const f of flows) {
        for (const eff of runActionFlow(f as ActionFlow, ctx).effects) applyEffect(eff);
      }
      return;
    }

    const link = (s.pageLinks ?? []).find(
      (l) => l.source_component_id === componentId && l.from_page_id === page.id
    );
    if (link) { st.setPreviewPage(link.to_page_id); return; }

    const behavior = findAny(componentId)?.behavior as
      | { type: string; page_id?: string; message?: string; target_component_id?: string; url?: string }
      | undefined;
    if (behavior?.type === "navigate" && behavior.page_id) st.setPreviewPage(behavior.page_id);
    else if (behavior?.type === "toast" && behavior.message) st.showToast(behavior.message);
    else if (behavior?.type === "toggle" && behavior.target_component_id) st.toggleHidden(behavior.target_component_id);
    else if (behavior?.type === "link" && behavior.url) window.open(behavior.url, "_blank");
  };

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
          playMode={playMode}
          onActivate={activate}
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
      {!playMode && <CommentsLayer page={page} />}
      {linkMode && !playMode && <LinkLayer page={page} />}
      {!playMode && selection.length === 1 && (
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
      {toastMsg && <div className="play-toast" data-testid="play-toast">{toastMsg}</div>}
    </div>
  );
}
