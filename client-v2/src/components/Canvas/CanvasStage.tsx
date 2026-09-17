import { useEffect, useRef, useState } from "react";
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
import { isTypingTarget } from "../../lib/shortcuts";
import { screenToContent } from "../../lib/viewport";
import type { ComponentNode } from "../../types";

/** 键盘 / HUD 按钮每次缩放的倍率；滚轮用 exp(-deltaY * 灵敏度) 平滑缩放。 */
const KEY_ZOOM_FACTOR = 1.2;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

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
  const previewTransition = useDesignStore((s) => s.previewTransition);
  const hiddenIds = useDesignStore((s) => s.hiddenIds);
  const toastMsg = useDesignStore((s) => s.toastMsg);
  const dragState = useDesignStore((s) => s.dragState);
  const resizeState = useDesignStore((s) => s.resizeState);
  const view = useDesignStore((s) => s.view);

  const viewportRef = useRef<HTMLDivElement>(null);
  /** 空格键手型模式（纯 UI 瞬态，不进 store）。 */
  const spaceRef = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);

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
    if (link) { st.setPreviewPage(link.to_page_id, link.transition ?? "fade"); return; }

    const behavior = findAny(componentId)?.behavior as
      | { type: string; page_id?: string; message?: string; target_component_id?: string; url?: string }
      | undefined;
    if (behavior?.type === "navigate" && behavior.page_id) st.setPreviewPage(behavior.page_id, "fade");
    else if (behavior?.type === "toast" && behavior.message) st.showToast(behavior.message);
    else if (behavior?.type === "toggle" && behavior.target_component_id) st.toggleHidden(behavior.target_component_id);
    else if (behavior?.type === "link" && behavior.url) window.open(behavior.url, "_blank");
  };

  /** 以视口中心为锚点缩放（键盘 / HUD 按钮共用）。 */
  const zoomCenter = (factor: number): void => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    useDesignStore.getState().zoomAt(rect.width / 2, rect.height / 2, factor);
  };

  /** 无限画布: 滚轮平移 / ctrl(或 meta)+滚轮以光标为锚点缩放。
   * 原生监听（passive: false）才能 preventDefault 浏览器双指缩放。 */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const st = useDesignStore.getState();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        st.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY));
      } else {
        st.panBy(-e.deltaX, -e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /** 空格手型平移 + 缩放快捷键: +/= 放大，-/_ 缩小，0 或 Ctrl+0 复位；与编辑快捷键共用输入焦点守卫。 */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target)) return;
      if (e.code === "Space") {
        if (!spaceRef.current) {
          spaceRef.current = true;
          setSpaceHeld(true);
        }
        e.preventDefault(); // 阻止页面滚动
        return;
      }
      const el = viewportRef.current;
      if (!el) return;
      const st = useDesignStore.getState();
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomCenter(KEY_ZOOM_FACTOR);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomCenter(1 / KEY_ZOOM_FACTOR);
      } else if (e.key === "0") {
        e.preventDefault();
        st.resetView();
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === "Space") {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };
    const onBlur = (): void => {
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoomCenter 只读 ref 与 getState，无陈旧闭包
  }, []);

  /** 手型平移: 空格+左键 或 中键拖动（视口位移按屏幕像素计，不除以 z）。 */
  const startPan = (e: { clientX: number; clientY: number }): void => {
    const origin = { x: e.clientX, y: e.clientY };
    const base = { ...useDesignStore.getState().view };
    setPanning(true);
    const move = (ev: MouseEvent): void => {
      useDesignStore.getState().setView({
        x: base.x + ev.clientX - origin.x,
        y: base.y + ev.clientY - origin.y,
        z: base.z,
      });
    };
    const up = (): void => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      setPanning(false);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  /** 捕获阶段拦截手型平移，避免落在组件上时先触发组件拖拽/选中。 */
  const onViewportMouseDownCapture = (e: ReactMouseEvent<HTMLDivElement>): void => {
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e);
    }
  };

  /** M3 拖拽: 按住已选中组件拖动——网格吸附 + 对齐辅助线，松手单 undo 步提交 ydoc。
   * 无布局的组件（服务端 addComponent 不落布局）用回退几何，拖动即创建布局。
   * 指针位移除以 view.z 换算为内容位移，任意缩放下拖拽保持 1:1 跟手。 */
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
      const z = useDesignStore.getState().view.z;
      const raw = { x: base.x + (ev.clientX - origin.x) / z, y: base.y + (ev.clientY - origin.y) / z };
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
   * 松手按网格吸附 w/h 后单 undo 步提交 ydoc；与拖拽辅助线互不相关。
   * 指针位移同样除以 view.z，缩放下调整保持 1:1 跟手。 */
  const startResize = (id: string, e: ReactMouseEvent): void => {
    if (playMode) return;
    const node = components.find((c) => c.id === id);
    const origin = { x: e.clientX, y: e.clientY };
    const base = { x: node?.layout?.x ?? 16, y: node?.layout?.y ?? 0, w: node?.layout?.w ?? 320, h: node?.layout?.h ?? 80 };
    const move = (ev: MouseEvent): void => {
      const z = useDesignStore.getState().view.z;
      const w = Math.max(32, base.w + (ev.clientX - origin.x) / z);
      const h = Math.max(32, base.h + (ev.clientY - origin.y) / z);
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
    // currentTarget = 视口容器: 先减 rect.left/top 得视口坐标，再经 screenToContent 反解内容坐标
    const rect = e.currentTarget.getBoundingClientRect();
    const v = useDesignStore.getState().view;
    const pt = screenToContent(v, e.clientX - rect.left, e.clientY - rect.top);
    const x = snapValue(pt.x);
    const y = snapValue(pt.y);
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

  const componentNodes = components.map((node) => (
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
  ));

  return (
    <div
      ref={viewportRef}
      className={`canvas-viewport${spaceHeld ? " space-pan" : ""}${panning ? " panning" : ""}`}
      onMouseDownCapture={onViewportMouseDownCapture}
      onMouseDown={() => clearSelection()}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 无限画布内容层: transform 由 view 驱动（translate + scale, origin 0 0）。
          组件 / 辅助线 / 评论 / 连线都在内容坐标系内，随缩放平移一起变换。 */}
      <div
        className="canvas-stage"
        style={{
          width: breakpoint === "mobile" ? 390 : breakpoint === "tablet" ? 834 : 1200,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
          transformOrigin: "0 0",
        }}
      >
        {/* M4 转场: play mode 下当前页组件挂在 preview-page 容器内，key 跟随
            previewPageId —— 跳页即重挂载，CSS 入场动画（pt-*）随之重放。 */}
        {playMode ? (
          <div
            key={previewPageId ?? "current"}
            data-testid="preview-page"
            className={`preview-page pt-${previewTransition ?? "fade"}`}
          >
            {componentNodes}
          </div>
        ) : (
          componentNodes
        )}
        {/* M3 对齐辅助线（内容坐标渲染，随视口变换） */}
        {dragState?.guides.xs.map((x) => (
          <div key={`gx-${x}`} className="guide guide-v" style={{ left: x }} />
        ))}
        {dragState?.guides.ys.map((y) => (
          <div key={`gy-${y}`} className="guide guide-h" style={{ top: y }} />
        ))}
        {components.length === 0 && <div className="canvas-empty">从左侧设计库添加组件</div>}
        {!playMode && <CommentsLayer page={page} />}
        {linkMode && !playMode && <LinkLayer page={page} />}
      </div>
      {/* 以下为视口覆盖层: 不随缩放平移变换，保证任意缩放下可用 */}
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
      <div className="zoom-hud" onMouseDown={(e) => e.stopPropagation()}>
        <button className="zoom-btn" data-testid="zoom-out" aria-label="缩小" onClick={() => zoomCenter(1 / KEY_ZOOM_FACTOR)}>-</button>
        <span className="zoom-pct" data-testid="zoom-pct">{Math.round(view.z * 100)}%</span>
        <button className="zoom-btn" data-testid="zoom-in" aria-label="放大" onClick={() => zoomCenter(KEY_ZOOM_FACTOR)}>+</button>
        <button className="zoom-btn zoom-reset-btn" data-testid="zoom-reset" onClick={() => useDesignStore.getState().resetView()}>复位</button>
      </div>
      {toastMsg && <div className="play-toast" data-testid="play-toast">{toastMsg}</div>}
    </div>
  );
}
