// client-v2/src/lib/viewport.ts — 无限画布视口数学（纯函数，便于测试）
// 视口模型: 内容坐标 p 经 transform: translate(view.x, view.y) scale(view.z)（origin 0 0）
// 映射为视口坐标 s = view.x + p * view.z。

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

export interface CanvasView {
  x: number;
  y: number;
  z: number;
}

/** 缩放倍率夹取到 [MIN_ZOOM, MAX_ZOOM]。 */
export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** 以视口坐标 (cx, cy) 为锚点缩放: 锚点处的内容点在缩放前后保持不动。
 * z' = clamp(z * factor)；x' = cx - (cx - x) * z'/z（y 同理）。 */
export function zoomAtPoint(view: CanvasView, cx: number, cy: number, factor: number): CanvasView {
  const z = clampZoom(view.z * factor);
  const k = z / view.z;
  return { x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, z };
}

/** 视口坐标 → 内容坐标（drop 落点等指针事件换算）。 */
export function screenToContent(view: CanvasView, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - view.x) / view.z, y: (sy - view.y) / view.z };
}
