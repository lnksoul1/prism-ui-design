// client-v2/src/types.ts — 服务端 DesignState 的客户端视图（宽松类型）
export interface ComponentNode {
  id: string;
  type: string;
  variant?: string;
  name?: string;
  props: Record<string, unknown>;
  layout?: { x: number; y: number; w: number; h: number };
  visible?: boolean;
  locked?: boolean;
  children: ComponentNode[];
  baseStyle?: Record<string, string>;
  breakpointOverrides?: Partial<Record<"mobile" | "tablet", Partial<Record<string, string>>>>;
  animation?: Record<string, unknown>;
  animations?: unknown[];
  behavior?: Record<string, unknown>;
  boxMode?: { enabled: boolean; internalConfig: Record<string, unknown> };
}

export interface CommentView {
  id: string;
  component_id: string;
  author: string;
  text: string;
  createdAt: string;
  x?: number;
  y?: number;
  resolved?: boolean;
  assignee?: string;
  updatedAt?: string;
}

export interface PageLinkView {
  id: string;
  from_page_id: string;
  to_page_id: string;
  label?: string;
  source_component_id?: string;
  /** M4 转场: play mode 进入目标页的动画类型（服务端默认 "fade"）。 */
  transition?: string;
}

export interface ActionFlowStepView {
  id: string;
  action: string;
  params: Record<string, unknown>;
}
export interface ActionFlowView {
  id: string;
  name: string;
  trigger: string;
  componentId: string;
  steps: ActionFlowStepView[];
  enabled: boolean;
}

/** R1 M2 修正记忆: 页面级布局约束。 */
export interface PageConstraintView {
  id: string;
  component_type: string;
  layout: { x: number; y: number; w: number; h: number };
  source_component_id?: string;
}

export interface DesignStateView {
  projectName: string;
  style: string;
  tokens: Record<string, Record<string, { value: string }>>;
  components: ComponentNode[];
  pages: Array<{
    id: string;
    name: string;
    components: ComponentNode[];
    constraints?: PageConstraintView[];
  }>;
  currentPageId: string | null;
  comments: CommentView[];
  pageLinks: PageLinkView[];
  revision: number;
  actionFlows?: Record<string, ActionFlowView>;
}
