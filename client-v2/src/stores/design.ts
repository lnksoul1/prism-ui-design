import { create } from "zustand";
import type { DesignStateView } from "../types";
import { collabMaps } from "../collab/collab";
import { mergeCollabIntoState } from "../collab/project";

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
