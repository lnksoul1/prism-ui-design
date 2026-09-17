/** M4 页面转场: play mode 进入目标页的动画类型（与服务端 PAGE_LINK_TRANSITIONS 对齐）。 */
export const PAGE_LINK_TRANSITIONS = [
  { value: "fade", label: "淡入" },
  { value: "slide-left", label: "左滑" },
  { value: "slide-right", label: "右滑" },
  { value: "slide-up", label: "上滑" },
  { value: "slide-down", label: "下滑" },
  { value: "expand", label: "展开" },
  { value: "none", label: "无" },
] as const;

export const DEFAULT_LINK_TRANSITION = "fade";

/** 转场的中文短标签（连线 / 检查器展示用），未知值回退为 "淡入"。 */
export function linkTransitionLabel(transition?: string): string {
  return PAGE_LINK_TRANSITIONS.find((t) => t.value === (transition ?? DEFAULT_LINK_TRANSITION))?.label ?? "淡入";
}
