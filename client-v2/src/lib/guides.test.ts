import { test, expect } from "vitest";
import { computeAlignmentGuides, snapToGuides } from "./guides";

const rect = (x: number, y: number, w = 100, h = 50) => ({ x, y, w, h });

test("computes guide lines when edges align within threshold", () => {
  const guides = computeAlignmentGuides(rect(110, 0), [rect(0, 0)]); // moving 左沿 110 vs other 右沿 100 差 10 > 阈值 → 不对齐
  expect(guides.xs).toHaveLength(0);
  const aligned = computeAlignmentGuides(rect(2, 0), [rect(0, 0)]); // 左沿 2 vs 0，阈值内
  expect(aligned.xs).toContain(0);
});

test("no guides when far apart; snapToGuides snaps to nearest guide", () => {
  const far = computeAlignmentGuides(rect(500, 500), [rect(0, 0)]);
  expect(far.xs).toHaveLength(0);
  expect(far.ys).toHaveLength(0);
  expect(snapToGuides(41, 100, { xs: [40], ys: [] })).toEqual({ x: 40, y: 100 });
});
