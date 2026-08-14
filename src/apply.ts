/**
 * One-click apply pipeline (product definition v3.1).
 *
 * "导入自己的产品 → 精确调整 → 一键应用": `applyDesign` writes two artifacts
 * into the product directory (PRISM_PRODUCT_DIR, default ~/.prism/products):
 *   - prism-adjusted-<page>.html — the adjusted page exactly as seen on canvas
 *   - prism-adjustments.css      — design-token overrides the user can link
 *                                  into their own product to take effect
 * Every write keeps a timestamped backup so `rollbackApply` can undo it.
 */

import fs from "fs";
import path from "path";
import { stateStore } from "./state.js";
import { exportDesign } from "./tools/design-tools.js";
import { getProjectDir } from "./project-store.js";
import { buildTokenVarMap } from "./writeback.js";

export interface ApplyFile {
  file: string;
  size: number;
}

export interface ApplyResult {
  success: boolean;
  files: ApplyFile[];
  backup: string | null;
  page_id: string | null;
  message: string;
}

export interface RollbackResult {
  success: boolean;
  restored: string | null;
  message: string;
}

/** Directory where adjusted artifacts land (overridable for tests). */
export function productDir(): string {
  return process.env.PRISM_PRODUCT_DIR || path.join(getProjectDir(), "..", "products");
}

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "page"
  );
}

/**
 * Build a drop-in CSS file: the current design tokens as :root variables.
 * Users link this file into their own product to apply the adjustments.
 */
export function buildAdjustmentCss(): string {
  const vars = buildTokenVarMap();
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `/* Prism 一键应用 — 设计调整
   在你的产品 HTML 中引入本文件即可生效：
   <link rel="stylesheet" href="prism-adjustments.css"> */
:root {
${lines.join("\n")}
}
`;
}

/**
 * Write the adjusted page + adjustment CSS into the product directory.
 * Existing files are backed up (with timestamp) before being overwritten.
 */
export function applyDesign(): ApplyResult {
  const state = stateStore.getState();
  const page = state.pages.find((p) => p.id === state.currentPageId);
  if (!page) {
    return { success: false, files: [], backup: null, page_id: null, message: "没有当前页面" };
  }
  const dir = productDir();
  fs.mkdirSync(dir, { recursive: true });
  const backupDir = path.join(dir, ".backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const files: ApplyFile[] = [];
  let backup: string | null = null;

  const writeWithBackup = (target: string, content: string): void => {
    if (fs.existsSync(target)) {
      const b = path.join(backupDir, `${path.basename(target)}.bak-${Date.now()}`);
      fs.copyFileSync(target, b);
      backup = b;
    }
    fs.writeFileSync(target, content, "utf-8");
    files.push({ file: target, size: Buffer.byteLength(content, "utf-8") });
  };

  const htmlFile = path.join(dir, `prism-adjusted-${slugify(page.name)}.html`);
  const cssFile = path.join(dir, "prism-adjustments.css");
  writeWithBackup(htmlFile, exportDesign("html"));
  writeWithBackup(cssFile, buildAdjustmentCss());

  return {
    success: true,
    files,
    backup,
    page_id: page.id,
    message: `已应用 ${files.length} 个文件${backup ? "，备份：" + path.basename(backup) : ""}`,
  };
}

/** Restore the most recent backup of an applied artifact. */
export function rollbackApply(): RollbackResult {
  const dir = productDir();
  const backupDir = path.join(dir, ".backups");
  if (!fs.existsSync(backupDir)) {
    return { success: false, restored: null, message: "没有可回滚的备份" };
  }
  const backups = fs
    .readdirSync(backupDir)
    .filter((f) => /\.bak-\d+$/.test(f))
    .sort();
  if (backups.length === 0) {
    return { success: false, restored: null, message: "没有可回滚的备份" };
  }
  const newest = backups[backups.length - 1];
  const target = path.join(dir, newest.replace(/\.bak-\d+$/, ""));
  if (!fs.existsSync(target)) {
    return { success: false, restored: null, message: `目标文件不存在：${target}` };
  }
  fs.copyFileSync(path.join(backupDir, newest), target);
  return { success: true, restored: target, message: `已回滚：${path.basename(target)}` };
}
