import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { useDesignStore } from "../../stores/design";
import { api } from "../../api";
import { editComponent } from "../../collab/edits";
import { ComponentView } from "./ComponentView";
import { CommentsLayer } from "./CommentsLayer";
import { LinkLayer } from "./LinkLayer";
import { runActionFlow, type ActionFlow, type FlowEffect } from "../../lib/actionFlow";
import { snapValue } from "../../lib/snap";
import { computeAlignmentGuides, snapToGuides } from "../../lib/guides";
import { LIBRARY_COMPONENT_MIME } from "../../lib/catalog";
import { waitForComponent } from "../../lib/placement";
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
  const dragState = useDesignStore((s) => s.dragState);
  const resizeState = useDesignStore((s) => s.resizeState);

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

  /** M3 拖拽: 按住已选中组件拖动——网格吸附 + 对齐辅助线，松手单 undo 步提交 ydoc。
   * 无布局的组件（服务端 addComponent 不落布局）用回退几何，拖动即创建布局。 */
  const startDrag = (id: string, e: ReactMouseEvent): void => {
    if (playMode) return;
    const node = components.find((c) => c.id === id);
    if (!node) return;
    const origin = { x: e.clientX, y: e.clientY };
    const base = { x: node.layout?.x ?? 16, y: node.layout?.y ?? 0 };
    const w = node.layout?.w ?? 320;
    const h = node.layout?.h ?? 80;
    const others = components
      .filter((c) => c.id !== id && c.layout)
      .map((c) => ({ x: c.layout!.x ?? 0, y: c.layout!.y ?? 0, w: c.layout!.w ?? 320, h: c.layout!.h ?? 80 }));
    const move = (ev: MouseEvent): void => {
      if (Math.abs(ev.clientX - origin.x) + Math.abs(ev.clientY - origin.y) < 3) return;
      const raw = { x: base.x + ev.clientX - origin.x, y: base.y + ev.clientY - origin.y };
      const snapped = { x: snapValue(raw.x), y: snapValue(raw.y) };
      const guides = computeAlignmentGuides({ x: snapped.x, y: snapped.y, w, h }, others);
      const guided = snapToGuides(snapped.x, snapped.y, guides);
      useDesignStore.setState({ dragState: { id, x: guided.x, y: guided.y, guides } });
    };
    const up = (): void => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      const st = useDesignStore.getState().dragState;
      if (st?.id === id) {
        const final = snapToGuides(st.x, st.y, st.guides); // 提交前再吸附一次辅助线
        editComponent(id, (draft) => {
          const layout = (draft.layout as Record<string, number> | undefined) ?? {};
          draft.layout = { ...layout, x: final.x, y: final.y, w: layout.w ?? 320, h: layout.h ?? 80 };
        });
      }
      useDesignStore.setState({ dragState: null });
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  /** M4 调整大小: SE 角手柄拖动——resizeState 实时覆盖宽高（最小 32×32），
   * 松手按网格吸附 w/h 后单 undo 步提交 ydoc；与拖拽辅助线互不相关。 */
  const startResize = (id: string, e: ReactMouseEvent): void => {
    if (playMode) return;
    const node = components.find((c) => c.id === id);
    const origin = { x: e.clientX, y: e.clientY };
    const base = { x: node?.layout?.x ?? 16, y: node?.layout?.y ?? 0, w: node?.layout?.w ?? 320, h: node?.layout?.h ?? 80 };
    const move = (ev: MouseEvent): void => {
      const w = Math.max(32, base.w + ev.clientX - origin.x);
      const h = Math.max(32, base.h + ev.clientY - origin.y);
      useDesignStore.setState({ resizeState: { id, x: base.x, y: base.y, w, h } });
    };
    const up = (): void => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      const st = useDesignStore.getState().resizeState;
      if (st?.id === id) {
        editComponent(id, (draft) => {
          const layout = (draft.layout as Record<string, number> | undefined) ?? {};
          draft.layout = { ...layout, w: snapValue(st.w), h: snapValue(st.h) };
        });
      }
      useDesignStore.setState({ resizeState: null });
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  /** M4 设计库拖拽: 画布接收 HTML5 drop，加入组件、选中新节点并把落点提交为布局。 */
  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>): void => {
    if (playMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>): void => {
    if (playMode) return;
    e.preventDefault();
    const id = e.dataTransfer.getData(LIBRARY_COMPONENT_MIME);
    if (!id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = snapValue(e.clientX - rect.left);
    const y = snapValue(e.clientY - rect.top);
    void api.addLibraryComponent(id).then(async (res) => {
      const componentId = (res as { component_id?: string } | null)?.component_id;
      if (!componentId) return;
      useDesignStore.setState({ selection: [componentId] });
      // 服务端广播先于本地写路径到达：等组件投影进 ydoc 再提交布局
      await waitForComponent(componentId);
      editComponent(componentId, (draft) => {
        const layout = (draft.layout as Record<string, number> | undefined) ?? {};
        draft.layout = { ...layout, x, y, w: 320, h: 80 };
      });
    });
  };

  return (
    <div
      className="canvas-stage"
      onMouseDown={() => clearSelection()}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
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
          dragPos={dragState?.id === node.id ? { x: dragState.x, y: dragState.y } : undefined}
          onDragStart={startDrag}
          resizeHandle={selection.length === 1 && selection[0] === node.id && !playMode}
          resizeBox={resizeState?.id === node.id ? { w: resizeState.w, h: resizeState.h } : undefined}
          onResizeStart={startResize}
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
      {/* M3 对齐辅助线 */}
      {dragState?.guides.xs.map((x) => (
        <div key={`gx-${x}`} className="guide guide-v" style={{ left: x }} />
      ))}
      {dragState?.guides.ys.map((y) => (
        <div key={`gy-${y}`} className="guide guide-h" style={{ top: y }} />
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
