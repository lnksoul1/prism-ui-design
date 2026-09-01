// client-v2/src/lib/snap.ts — 与服务端 src/layout/snap.ts 的 snapValue 保持镜像（半格向下取整）
export function snapValue(value: number, grid = 8): number {
  if (!Number.isFinite(grid) || grid <= 0) return value;
  return Math.ceil(value / grid - 0.5) * grid + 0;
}
