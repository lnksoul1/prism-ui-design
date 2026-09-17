import { create } from "zustand";
import type { DesignStateView } from "../types";
import { collabMaps } from "../collab/collab";
import { mergeCollabIntoState } from "../collab/project";
import { zoomAtPoint, type CanvasView } from "../lib/viewport";

export type Breakpoint = "desktop" | "tablet" | "mobile";
const BREAKPOINTS: readonly Breakpoint[] = ["desktop", "tablet", "mobile"];

interface DesignStore {
  state: DesignStateView | null;
  baseState: DesignStateView | null;
  connected: boolean;
  selection: string[];
  breakpoint: Breakpoint;
  /** M2 容器查询模拟: 模拟父容器宽度（px），null = 关闭。仅前端状态，不入 Schema。 */
  cqWidth: number | null;
  /** M3 原型连线模式: 开启后点击组件设为连线源，点目标页 chip 建立跳转。 */
  linkMode: boolean;
  pendingLinkSource: string | null;
  /** M3 预览模式: 点击组件走 actionFlow > pageLink > behavior 激活链，仅前端状态，不写服务端。 */
  playMode: boolean;
  previewPageId: string | null;
  hiddenIds: string[];
  toastMsg: string | null;
  /** M3 拖拽中: 被拖组件当前位置 + 对齐辅助线（拖拽期间用 setState 直接写，无需 action）。 */
  dragState: { id: string; x: number; y: number; guides: { xs: number[]; ys: number[] } } | null;
  /** M4 调整大小中: 被调整组件的实时盒子（调整期间用 setState 直接写，无需 action）。 */
  resizeState: { id: string; x: number; y: number; w: number; h: number } | null;
  /** 无限画布视口: translate(x,y) scale(z)，仅前端状态不入 Schema、不同步。 */
  view: CanvasView;
  setView: (v: CanvasView) => void;
  panBy: (dx: number, dy: number) => void;
  /** 以视口坐标 (cx, cy) 为锚点缩放（cx/cy 相对视口容器左上角）。 */
  zoomAt: (cx: number, cy: number, factor: number) => void;
  resetView: () => void;
  applyServerState: (s: DesignStateView) => void;
  setConnected: (v: boolean) => void;
  select: (id: string) => void;
  deselect: (id: string) => void;
  clearSelection: () => void;
  setBreakpoint: (bp: Breakpoint) => void;
  setCqWidth: (w: number | null) => void;
  setLinkMode: (v: boolean) => void;
  setPendingLinkSource: (id: string | null) => void;
  setPlayMode: (v: boolean) => void;
  setPreviewPage: (id: string) => void;
  toggleHidden: (id: string) => void;
  showToast: (msg: string) => void;
}

export const useDesignStore = create<DesignStore>((set) => ({
  state: null,
  baseState: null,
  connected: false,
  selection: [],
  breakpoint: "desktop",
  cqWidth: null,
  linkMode: false,
  pendingLinkSource: null,
  playMode: false,
  previewPageId: null,
  hiddenIds: [],
  toastMsg: null,
  dragState: null,
  resizeState: null,
  view: { x: 0, y: 0, z: 1 },
  setView: (v) => set({ view: v }),
  panBy: (dx, dy) => set((st) => ({ view: { ...st.view, x: st.view.x + dx, y: st.view.y + dy } })),
  zoomAt: (cx, cy, factor) => set((st) => ({ view: zoomAtPoint(st.view, cx, cy, factor) })),
  resetView: () => set({ view: { x: 0, y: 0, z: 1 } }),
  applyServerState: (s) =>
    set((st) => {
      const merged = mergeCollabIntoState(s, collabMaps());
      return { baseState: s, state: merged ?? st.state };
    }),
  setConnected: (v) => set({ connected: v }),
  select: (id) =>
    set((st) => (st.selection.includes(id) ? st : { selection: [...st.selection, id] })),
  deselect: (id) => set((st) => ({ selection: st.selection.filter((s) => s !== id) })),
  clearSelection: () => set({ selection: [] }),
  setBreakpoint: (bp) =>
    set((st) => ((BREAKPOINTS as readonly string[]).includes(bp) ? { breakpoint: bp } : st)),
  setCqWidth: (w) => set({ cqWidth: typeof w === "number" && w >= 200 && w <= 1200 ? Math.round(w) : null }),
  setLinkMode: (v) => set({ linkMode: v, pendingLinkSource: null }),
  setPendingLinkSource: (id) => set({ pendingLinkSource: id }),
  setPlayMode: (v) =>
    set(v ? { playMode: true, previewPageId: null, hiddenIds: [], toastMsg: null, linkMode: false }
         : { playMode: false, previewPageId: null, hiddenIds: [], toastMsg: null }),
  setPreviewPage: (id) => set({ previewPageId: id }),
  toggleHidden: (id) =>
    set((st) => ({
      hiddenIds: st.hiddenIds.includes(id) ? st.hiddenIds.filter((x) => x !== id) : [...st.hiddenIds, id],
    })),
  showToast: (msg) => set({ toastMsg: msg }),
}));
