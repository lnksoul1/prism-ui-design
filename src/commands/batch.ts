/**
 * M2 Command 层: 把多个 stateStore mutation 组合为一个撤销步。
 *
 * 用法：
 *   runBatch("move-many", () => {
 *     stateStore.updateComponent(a, {}, "user", { x: 10 });
 *     stateStore.updateComponent(b, {}, "user", { x: 20 });
 *   });
 *
 * fn 抛错时自动回滚到批量前状态并重新抛出（调用方无需 try/catch）。
 */
import { stateStore } from "../state.js";

export function runBatch<T>(name: string, fn: () => T): T {
  stateStore.beginBatch();
  try {
    const result = fn();
    stateStore.endBatch({ type: "batch", name });
    return result;
  } catch (err) {
    stateStore.abortBatch();
    throw err;
  }
}
