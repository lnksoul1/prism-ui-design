// M3 代码同步: 设计器 ↔ JSX 双向同步（导出: 设计优先; 导入: 代码优先; ignore 区域双向跳过）
import { Router } from "express";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { stateStore } from "../state.js";
import { mergePageExport } from "../code-sync/jsx-export.js";
import { computeCodeSyncChanges } from "../code-sync/jsx-import.js";
import { applyCodeSyncChanges } from "../code-sync/apply.js";
import { asyncHandler, HttpError } from "./shared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYNC_DIR = resolve(__dirname, "..", "..", ".design", "sync");

function findPage(pageId: string): ReturnType<typeof stateStore.getState>["pages"][number] {
  const page = stateStore.getState().pages.find((p) => p.id === pageId);
  if (!page) throw new HttpError(404, `Page ${pageId} not found`);
  return page;
}

function syncPath(pageId: string): string {
  return resolve(SYNC_DIR, `page-${pageId}.jsx`);
}

export function registerCodeSyncRoutes(): Router {
  const router = Router();

  // 导出: 设计器状态 → .design/sync/page-<id>.jsx（合并模式，保护非编辑区域）
  router.post("/api/code-sync/export", asyncHandler(async (req, res) => {
    const { page_id } = req.body || {};
    if (typeof page_id !== "string" || !page_id) throw new HttpError(400, "page_id is required");
    const page = findPage(page_id);
    const file = syncPath(page_id);
    const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
    const code = mergePageExport(page, existing);
    mkdirSync(SYNC_DIR, { recursive: true });
    writeFileSync(file, code, "utf8");
    res.json({ success: true, path: file, code, merged: existing !== null });
  }));

  // 导入: .design/sync/page-<id>.jsx（或 body.code）→ stateStore；mode=preview 只返回变更
  router.post("/api/code-sync/import", asyncHandler(async (req, res) => {
    const { page_id, code, mode } = req.body || {};
    if (typeof page_id !== "string" || !page_id) throw new HttpError(400, "page_id is required");
    const page = findPage(page_id);
    const file = syncPath(page_id);
    const source =
      typeof code === "string" && code ? code : existsSync(file) ? readFileSync(file, "utf8") : null;
    if (!source) throw new HttpError(400, "No code provided and no synced file exists");
    const changes = computeCodeSyncChanges(page, source);
    if (mode === "apply") {
      const result = applyCodeSyncChanges(changes);
      res.json({ success: true, mode, changes, result });
      return;
    }
    res.json({ success: true, mode: "preview", changes });
  }));

  return router;
}
