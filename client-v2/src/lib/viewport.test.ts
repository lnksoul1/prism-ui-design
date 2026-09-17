// client-v2/src/lib/viewport.test.ts — 无限画布视口数学: 缩放锚点/边界/坐标换算
import { test, expect } from "vitest";
import { clampZoom, zoomAtPoint, screenToContent, MIN_ZOOM, MAX_ZOOM } from "./viewport";

test("clampZoom bounds zoom into [0.25, 4]", () => {
  expect(MIN_ZOOM).toBe(0.25);
  expect(MAX_ZOOM).toBe(4);
  expect(clampZoom(1)).toBe(1);
  expect(clampZoom(0.1)).toBe(0.25);
  expect(clampZoom(9)).toBe(4);
});

test("zoomAtPoint keeps the content point under the cursor fixed", () => {
  // view(x=100,y=50,z=1)，光标在视口坐标 (300,200)，放大 2 倍
  const next = zoomAtPoint({ x: 100, y: 50, z: 1 }, 300, 200, 2);
  expect(next.z).toBe(2);
  expect(next.x).toBe(-100); // 300 - (300-100)*2
  expect(next.y).toBe(-100); // 200 - (200-50)*2
  // 光标下的内容点缩放前后不变: (300-100)/1 = 200 → (300-(-100))/2 = 200
  expect((300 - next.x) / next.z).toBe(200);
  expect((200 - next.y) / next.z).toBe(150);
});

test("zoomAtPoint shrinks with factor < 1 and still anchors the cursor", () => {
  const next = zoomAtPoint({ x: -100, y: -100, z: 2 }, 300, 200, 0.5);
  expect(next.z).toBe(1);
  expect(next.x).toBe(100); // 300 - (300+100)*0.5
  expect(next.y).toBe(50); // 200 - (200+100)*0.5
  expect((300 - next.x) / next.z).toBe((300 - -100) / 2);
  expect((200 - next.y) / next.z).toBe((200 - -100) / 2);
});

test("zoomAtPoint clamps at the limits and keeps the anchor stable", () => {
  // 超上限: z 1 → 4（而非 5），锚点公式仍成立
  const up = zoomAtPoint({ x: 100, y: 50, z: 1 }, 300, 200, 5);
  expect(up.z).toBe(4);
  expect((300 - up.x) / up.z).toBe(200);
  expect((200 - up.y) / up.z).toBe(150);
  // 超下限: z 1 → 0.25
  const down = zoomAtPoint({ x: 100, y: 50, z: 1 }, 300, 200, 0.05);
  expect(down.z).toBe(0.25);
  expect((300 - down.x) / down.z).toBe(200);
  expect((200 - down.y) / down.z).toBe(150);
  // 已在边界时再缩放: z 不变，位移也不变
  const pinned = zoomAtPoint({ x: 0, y: 0, z: MAX_ZOOM }, 300, 200, 1.5);
  expect(pinned).toEqual({ x: 0, y: 0, z: 4 });
});

test("screenToContent maps viewport coords into content space", () => {
  expect(screenToContent({ x: 40, y: 20, z: 2 }, 100, 50)).toEqual({ x: 30, y: 15 });
  expect(screenToContent({ x: 0, y: 0, z: 1 }, 96, 48)).toEqual({ x: 96, y: 48 });
  expect(screenToContent({ x: -24, y: -16, z: 0.5 }, 0, 0)).toEqual({ x: 48, y: 32 });
});
