import { create } from "zustand";
import type { DesignStateView } from "../types";

export type Breakpoint = "desktop" | "tablet" | "mobile";
const BREAKPOINTS: readonly Breakpoint[] = ["desktop", "tablet", "mobile"];

interface DesignStore {
  state: DesignStateView | null;
  connected: boolean;
  selection: string[];
  breakpoint: Breakpoint;
  applyServerState: (s: DesignStateView) => void;
  setConnected: (v: boolean) => void;
  select: (id: string) => void;
  deselect: (id: string) => void;
  clearSelection: () => void;
  setBreakpoint: (bp: Breakpoint) => void;
}

export const useDesignStore = create<DesignStore>((set) => ({
  state: null,
  connected: false,
  selection: [],
  breakpoint: "desktop",
  applyServerState: (s) => set({ state: s }),
  setConnected: (v) => set({ connected: v }),
  select: (id) =>
    set((st) => (st.selection.includes(id) ? st : { selection: [...st.selection, id] })),
  deselect: (id) => set((st) => ({ selection: st.selection.filter((s) => s !== id) })),
  clearSelection: () => set({ selection: [] }),
  setBreakpoint: (bp) =>
    set((st) => ((BREAKPOINTS as readonly string[]).includes(bp) ? { breakpoint: bp } : st)),
}));
