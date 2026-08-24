/**
 * M2 智能布局: 网格吸附纯函数。确定性解析解，无需约束求解器。
 */
export interface SnapTarget {
  id: string;
  layout?: { x: number; y: number };
}

export interface SnapResult {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/** 把单个数值吸附到最近的网格倍数（默认 8px；恰在半格时向下取整）。 */
export function snapValue(value: number, grid = 8): number {
  if (!Number.isFinite(grid) || grid <= 0) return value;
  return Math.ceil(value / grid - 0.5) * grid + 0;
}

/** 计算一组节点的吸附修正（不改状态，供预览/应用两用）。 */
export function snapToGrid(nodes: SnapTarget[], grid = 8): SnapResult[] {
  return nodes.map((n) => {
    const x = n.layout?.x ?? 0;
    const y = n.layout?.y ?? 0;
    return {
      id: n.id,
      from: { x, y },
      to: { x: snapValue(x, grid), y: snapValue(y, grid) },
    };
  });
}
