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

export interface FlowContext {
  hasPage(id: string): boolean;
  hasComponent(id: string): boolean;
}

export type FlowEffect =
  | { type: "navigate"; pageId: string }
  | { type: "toast"; message: string }
  | { type: "toggle"; componentId: string }
  | { type: "openUrl"; url: string }
  | { type: "delay"; ms: number };

/**
 * M3 引擎: 纯函数顺序执行，产出副作用描述（由 play mode 前端消费）。
 * 首个非法步骤即停止并返回已累积 effects + errors。
 */
export function runActionFlow(flow: ActionFlow, ctx: FlowContext): { effects: FlowEffect[]; errors: string[] } {
  const effects: FlowEffect[] = [];
  const errors: string[] = [];
  if (!flow.enabled) {
    errors.push("flow disabled");
    return { effects, errors };
  }
  for (const step of flow.steps) {
    switch (step.action) {
      case "navigate": {
        const pageId = typeof step.params.page_id === "string" ? step.params.page_id : "";
        if (!pageId || !ctx.hasPage(pageId)) {
          errors.push(`step ${step.id}: unknown page "${pageId}"`);
          return { effects, errors };
        }
        effects.push({ type: "navigate", pageId });
        break;
      }
      case "toast": {
        const message = typeof step.params.message === "string" ? step.params.message : "";
        if (!message) {
          errors.push(`step ${step.id}: toast requires message`);
          return { effects, errors };
        }
        effects.push({ type: "toast", message });
        break;
      }
      case "toggle": {
        const componentId = typeof step.params.component_id === "string" ? step.params.component_id : "";
        if (!componentId || !ctx.hasComponent(componentId)) {
          errors.push(`step ${step.id}: unknown component "${componentId}"`);
          return { effects, errors };
        }
        effects.push({ type: "toggle", componentId });
        break;
      }
      case "openUrl": {
        const url = typeof step.params.url === "string" ? step.params.url : "";
        if (!/^https?:\/\//.test(url)) {
          errors.push(`step ${step.id}: openUrl requires http(s) url`);
          return { effects, errors };
        }
        effects.push({ type: "openUrl", url });
        break;
      }
      case "delay": {
        const ms = typeof step.params.ms === "number" && step.params.ms >= 0 && step.params.ms <= 10000
          ? step.params.ms
          : 300;
        effects.push({ type: "delay", ms });
        break;
      }
      default:
        errors.push(`step ${step.id}: unknown action "${String(step.action)}"`);
        return { effects, errors };
    }
  }
  return { effects, errors };
}
