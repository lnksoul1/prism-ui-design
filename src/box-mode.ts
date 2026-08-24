/**
 * M2 盒子模式: 复杂组件（图表/富文本等）在编辑器中只控制外层容器，
 * 内部实例（ECharts option、编辑器文档）预览时才挂载，保证编辑流畅度。
 */
export const BOX_MODE_TYPES = ["chart", "echarts", "rich_text", "editor"] as const;

export type BoxModeType = (typeof BOX_MODE_TYPES)[number];

export function isBoxModeType(value: string): value is BoxModeType {
  return (BOX_MODE_TYPES as readonly string[]).includes(value);
}

export interface BoxMode {
  enabled: boolean;
  /** 预览时注入组件实例的配置（如 ECharts option）。 */
  internalConfig: Record<string, unknown>;
}
