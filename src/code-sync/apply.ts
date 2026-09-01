// src/code-sync/apply.ts
import { stateStore } from "../state.js";
import { runBatch } from "../commands/batch.js";
import { computeCodeSyncChanges } from "./jsx-import.js";

const TEXT_KEYS = ["text", "title", "label", "button_text", "cta_text", "heading", "brand"];

/** M3 双向同步: 应用代码变更（runBatch 合并为单 undo 步）。 */
export function applyCodeSyncChanges(
  changes: ReturnType<typeof computeCodeSyncChanges>
): { applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;
  runBatch("code-sync-apply", () => {
    for (const change of changes) {
      if (change.skipped) {
        skipped++;
        continue;
      }
      if (change.text !== undefined) {
        const node = stateStore.getState().components.find((c) => c.id === change.id);
        const key = TEXT_KEYS.find((k) => typeof node?.props?.[k] === "string" && (node.props[k] as string).trim()) ?? "text";
        stateStore.updateComponent(change.id, { [key]: change.text }, "user");
      }
      if (change.style) {
        stateStore.setBaseStyle(change.id, change.style, "user");
      }
      applied++;
    }
  });
  return { applied, skipped };
}
