/**
 * M3 对齐辅助线（Cassowary 评估结论: 最近邻阈值匹配 + 一次吸附均有确定性
 * 解析解，无需约束求解器；多约束联立场景留待 V3 评估）。
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function computeAlignmentGuides(moving: Rect, others: Rect[], threshold = 6): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const movingXs = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const movingYs = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  for (const o of others) {
    for (const cx of [o.x, o.x + o.w / 2, o.x + o.w]) {
      if (movingXs.some((m) => Math.abs(m - cx) <= threshold) && !xs.includes(cx)) xs.push(cx);
    }
    for (const cy of [o.y, o.y + o.h / 2, o.y + o.h]) {
      if (movingYs.some((m) => Math.abs(m - cy) <= threshold) && !ys.includes(cy)) ys.push(cy);
    }
  }
  return { xs, ys };
}

export function snapToGuides(x: number, y: number, guides: { xs: number[]; ys: number[] }): { x: number; y: number } {
  let nx = x;
  let ny = y;
  for (const gx of guides.xs) if (Math.abs(x - gx) <= 6) nx = gx;
  for (const gy of guides.ys) if (Math.abs(y - gy) <= 6) ny = gy;
  return { x: nx, y: ny };
}
