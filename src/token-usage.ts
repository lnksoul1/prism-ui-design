// src/token-usage.ts
import type { ComponentNode, DesignState } from "./state.js";

/**
 * V2.0 Token 治理: 构建 tokenId → 引用它的组件 id 列表 的反向索引。
 * 扫描 baseStyle、breakpointOverrides、elementMeta.css 中与 token 值
 * 精确相等的样式值。tokenId 格式为 `${category}.${key}`。
 */
export function buildTokenUsage(state: DesignState): Record<string, string[]> {
  const valueToIds = new Map<string, string[]>();
  // 同值 token 会共享一条组件引用列表，须保留 value → 多个 token id 的映射。
  const tokenIdsByValue = new Map<string, string[]>();

  const tokenCategories: Array<keyof DesignState["tokens"]> = [
    "colors",
    "typography",
    "spacing",
    "shadows",
    "radii",
    "transitions",
  ];
  for (const category of tokenCategories) {
    const group = state.tokens?.[category];
    if (!group) continue;
    for (const [key, token] of Object.entries(group)) {
      const id = `${category}.${key}`;
      valueToIds.set(token.value, []);
      const tokenIds = tokenIdsByValue.get(token.value);
      if (tokenIds) tokenIds.push(id);
      else tokenIdsByValue.set(token.value, [id]);
    }
  }

  const scanStyles = (style: Record<string, string> | undefined, componentId: string): void => {
    if (!style) return;
    for (const value of Object.values(style)) {
      if (typeof value !== "string") continue;
      const ids = valueToIds.get(value);
      if (ids && !ids.includes(componentId)) ids.push(componentId);
    }
  };

  const walk = (nodes: ComponentNode[]): void => {
    for (const node of nodes) {
      scanStyles(node.baseStyle, node.id);
      if (node.breakpointOverrides) {
        for (const diff of Object.values(node.breakpointOverrides)) {
          scanStyles(diff, node.id);
        }
      }
      if (node.elementMeta) {
        for (const meta of Object.values(node.elementMeta)) {
          scanStyles(meta?.css, node.id);
        }
      }
      if (node.children?.length) walk(node.children);
    }
  };
  walk(state.components);

  const usage: Record<string, string[]> = {};
  for (const [value, ids] of valueToIds) {
    for (const tokenId of tokenIdsByValue.get(value) ?? []) {
      usage[tokenId] = ids;
    }
  }
  return usage;
}
