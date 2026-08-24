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
}

export interface DesignStateView {
  projectName: string;
  style: string;
  tokens: Record<string, Record<string, { value: string }>>;
  components: ComponentNode[];
  pages: Array<{ id: string; name: string; components: ComponentNode[] }>;
  currentPageId: string | null;
  comments: unknown[];
  revision: number;
}
