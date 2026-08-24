// client-v2/src/lib/style.ts — 与 src/responsive.ts 语义一致的客户端合并器
import type { ComponentNode } from "../types";

export type Breakpoint = "desktop" | "tablet" | "mobile";

export function resolveStyle(node: ComponentNode, bp: Breakpoint): Record<string, string> {
  const base = { ...(node.baseStyle || {}) };
  if (bp === "desktop") return base;
  return { ...base, ...(node.breakpointOverrides?.[bp] || {}) } as Record<string, string>;
}
