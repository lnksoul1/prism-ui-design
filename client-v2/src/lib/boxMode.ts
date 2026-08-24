// client-v2/src/lib/boxMode.ts — 与 src/box-mode.ts 镜像的客户端常量
export const BOX_MODE_TYPES = ["chart", "echarts", "rich_text", "editor"] as const;

export function isBoxModeComponent(node: {
  type: string;
  boxMode?: { enabled: boolean };
}): boolean {
  return node.boxMode?.enabled === true || (BOX_MODE_TYPES as readonly string[]).includes(node.type);
}
