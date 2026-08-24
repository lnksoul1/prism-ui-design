import type { ComponentNode } from "./state.js";

/** V2.0 多断点编辑：desktop 为基线，tablet/mobile 仅存差异（Diff 存储）。 */
export type Breakpoint = "desktop" | "tablet" | "mobile";

export const BREAKPOINTS: readonly Breakpoint[] = ["desktop", "tablet", "mobile"] as const;

export function isBreakpoint(value: string): value is Breakpoint {
  return (BREAKPOINTS as readonly string[]).includes(value);
}

/**
 * 合并某个断点下的最终样式：baseStyle 为桌面基线，
 * 非 desktop 断点用 breakpointOverrides[bp] 覆盖差异字段。
 */
export function resolveStyle(node: ComponentNode, bp: Breakpoint): Record<string, string> {
  const base = { ...(node.baseStyle || {}) };
  if (bp === "desktop") return base;
  return { ...base, ...(node.breakpointOverrides?.[bp] || {}) };
}
