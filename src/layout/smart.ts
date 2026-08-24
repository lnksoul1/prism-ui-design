/**
 * M2 智能布局: 选中区域的确定性重排。
 *
 * 规则（全部有解析解，不依赖约束求解器）：
 *   1. 按当前 y（视觉顺序）排序，纵向等间距堆叠（gap 默认 16px）；
 *   2. 横向左对齐到统一的 x 起点（gap 或容器内边距）；
 *   3. 提供容器时 clamp 宽度与位置到容器边界内；
 *   4. 所有坐标吸附到网格（默认 8px）。
 *
 * Cassowary 等约束求解器留待 M3 拖拽实时辅助线（无解析解场景）再评估。
 */
import { snapValue } from "./snap.js";

export interface LayoutBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SmartLayoutOptions {
  /** 吸附网格，默认 8。 */
  grid?: number;
  /** 纵向间距，默认 16。 */
  gap?: number;
  /** 可选容器边界（超出会被 clamp）。 */
  container?: { x: number; y: number; width: number; height: number } | null;
}

export function smartLayout(boxes: LayoutBox[], options: SmartLayoutOptions = {}): LayoutBox[] {
  const grid = options.grid ?? 8;
  const gap = options.gap ?? 16;
  const c = options.container ?? null;

  // 1. 视觉顺序（y 优先，x 次之）
  const sorted = [...boxes].sort((a, b) => (a.y - b.y) || (a.x - b.x));

  // 2. 统一左边界：容器内边距或 gap
  const leftX = c ? snapValue(c.x + gap, grid) : snapValue(gap, grid);
  const maxW = c ? Math.max(0, c.x + c.width - gap - leftX) : Number.POSITIVE_INFINITY;

  // 3. 纵向等间距堆叠 + clamp + 网格吸附
  let cursor = c ? snapValue(c.y + gap, grid) : snapValue(gap, grid);
  const out: LayoutBox[] = [];
  for (const b of sorted) {
    const w = c ? Math.min(b.w, maxW) : b.w;
    const next: LayoutBox = { id: b.id, x: leftX, y: cursor, w: snapValue(w, grid), h: b.h };
    if (c) {
      // 底部越界 clamp（保持高度优先，位置贴容器底）
      if (next.y + next.h > c.y + c.height - gap) {
        next.y = snapValue(Math.max(c.y + gap, c.y + c.height - gap - next.h), grid);
      }
    }
    out.push(next);
    // 游标推进也吸附网格: 高度非网格倍数时后续盒子仍保持 y 对齐（188 → 184）
    cursor = snapValue(next.y + next.h + snapValue(gap, grid), grid);
  }
  return out;
}
