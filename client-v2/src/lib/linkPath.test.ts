import { test, expect } from "vitest";
import { bezierPath } from "./linkPath";

test("bezierPath emits a cubic curve with horizontal control points", () => {
  expect(bezierPath({ x: 0, y: 0 }, { x: 200, y: 100 })).toBe("M 0 0 C 100 0, 100 100, 200 100");
});
