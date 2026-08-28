/**
 * M3 ActionFlow: JSON 配置式交互逻辑（线性步骤序列；可视化积木画布编排留待 M4）。
 * 触发: play mode 下点击组件。优先级: actionFlow > pageLink > behavior。
 */
export type FlowActionType = "navigate" | "toast" | "toggle" | "openUrl" | "delay";

export const FLOW_ACTION_TYPES: readonly FlowActionType[] = [
  "navigate", "toast", "toggle", "openUrl", "delay",
];

export function isFlowActionType(value: string): value is FlowActionType {
  return (FLOW_ACTION_TYPES as readonly string[]).includes(value);
}

export interface ActionFlowStep {
  id: string;
  action: FlowActionType;
  params: Record<string, unknown>;
}

export interface ActionFlow {
  id: string;
  name: string;
  trigger: "click";
  componentId: string;
  steps: ActionFlowStep[];
  enabled: boolean;
}
