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
import { stateStore, type ImportRecord } from "./state.js";
import { componentToHTML, exportDesign } from "./tools/design-tools.js";
import { applyHtmlFragmentsToDocument } from "./import-project.js";
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
  manifest_id: string | null;
  message: string;
}

/** Per-apply manifest for deterministic rollback (DESIGN.md v1.1 §7.4). */
export interface ApplyManifest {
  id: string;
  createdAt: string;
  page_id: string | null;
  files: Array<{ target: string; backup: string | null; size: number }>;
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

function manifestDir(): string {
  const dir = path.join(productDir(), ".apply-manifests");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeManifest(manifest: ApplyManifest): void {
  fs.writeFileSync(
    path.join(manifestDir(), `${manifest.id}.json`),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );
}

function latestManifest(): ApplyManifest | null {
  const dir = path.join(productDir(), ".apply-manifests");
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) return null;
  const text = fs.readFileSync(path.join(dir, files[files.length - 1]), "utf-8");
  try {
    return JSON.parse(text) as ApplyManifest;
  } catch {
    return null;
  }
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
/**
 * True when the imported source can be rebuilt as a full HTML document and
 * written back in place. JSX/TSX/Vue pages keep the safe generated-artifact path.
 */
function canWriteBackImportedSource(record: ImportRecord | null): boolean {
  if (!record) return false;
  if (record.kind === "url" || record.kind === "html") return true;
  if (record.kind === "file" && record.source_file && record.source_is_html) return true;
  return false;
}

/**
 * Rebuild the imported page from the original document snapshot + edited
 * html_fragment components. The original <head>, body attributes and scripts
 * are preserved; only the extracted body regions are patched.
 */
/** 在 <head> 中注入 prism-adjustments.css（幂等），让 token/设计系统变更直接生效。 */
function injectAdjustmentCssLink(html: string, href = "prism-adjustments.css"): string {
  if (/<link\b[^>]*prism-adjustments\.css/i.test(html)) return html;
  const link = `<link rel="stylesheet" href="${href}">`;
  const headClose = /<\/head>/i.exec(html);
  if (headClose) return html.slice(0, headClose.index) + link + html.slice(headClose.index);
  const headOpen = /<head\b[^>]*>/i.exec(html);
  if (headOpen) return html.slice(0, headOpen.index + headOpen[0].length) + link + html.slice(headOpen.index + headOpen[0].length);
  return link + html;
}

/** 为 URL 来源的产物注入 <base href>，保存到本地后相对资源仍指向原站点。 */
function injectBaseUrl(html: string, baseUrl: string): string {
  if (/<base\b[^>]*>/i.test(html)) return html;
  const base = `<base href="${String(baseUrl).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`;
  const headClose = /<\/head>/i.exec(html);
  if (headClose) return html.slice(0, headClose.index) + base + html.slice(headClose.index);
  const headOpen = /<head\b[^>]*>/i.exec(html);
  if (headOpen) return html.slice(0, headOpen.index + headOpen[0].length) + base + html.slice(headOpen.index + headOpen[0].length);
  return base + html;
}

function appendToBody(html: string, extra: string): string {
  if (!extra) return html;
  const bodyClose = /<\/body>/i.exec(html);
  if (bodyClose) return html.slice(0, bodyClose.index) + extra + html.slice(bodyClose.index);
  return html + extra;
}

function buildImportedDocument(record: ImportRecord, pageHtml: string): string {
  const original = fs.existsSync(record.html_file) ? fs.readFileSync(record.html_file, "utf-8") : pageHtml;
  const state = stateStore.getState();
  const page = state.pages.find((p) => p.id === state.currentPageId);
  const components = page?.components || [];
  const fragments = components.filter((c) => c.type === "html_fragment");
  let adjusted =
    fragments.length > 0
      ? applyHtmlFragmentsToDocument(original, fragments)
      : components.length > 0
        ? pageHtml
        : original;

  // 用户在导入页上新增/替换的普通组件也要进入产物（追加到 body 末尾）。
  if (fragments.length > 0) {
    const extraComponents = components
      .filter((c) => c.type !== "html_fragment")
      .map((c) => componentToHTML(c))
      .join("\n");
    adjusted = appendToBody(adjusted, extraComponents);
  }

  const withBase = record.base_url ? injectBaseUrl(adjusted, record.base_url!) : adjusted;
  return injectAdjustmentCssLink(withBase);
}

/**
 * Write the adjusted page + adjustment CSS into the product directory.
 * For imported url/html/file(html) sources, the full original document is
 * rebuilt and written (file imports go back to their original path in place).
 * Existing files are backed up (with timestamp) before being overwritten.
 */
export function applyDesign(): ApplyResult {
  const state = stateStore.getState();
  const page = state.pages.find((p) => p.id === state.currentPageId);
  if (!page) {
    return { success: false, files: [], backup: null, page_id: null, manifest_id: null, message: "没有当前页面" };
  }
  const record = stateStore.getImport(page.id);
  const writeBackSource = canWriteBackImportedSource(record);

  const dir = writeBackSource && record?.source_file
    ? path.dirname(record.source_file!)
    : productDir();
  fs.mkdirSync(dir, { recursive: true });
  const backupDir = writeBackSource && record?.source_file
      ? path.join(dir, ".prism-backups")
      : path.join(dir, ".backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const files: ApplyFile[] = [];
  let backup: string | null = null;
  const manifestFiles: ApplyManifest["files"] = [];

  const writeWithBackup = (target: string, content: string): void => {
    if (fs.existsSync(target)) {
      const b = path.join(backupDir, `${path.basename(target)}.bak-${Date.now()}`);
      fs.copyFileSync(target, b);
      backup = b;
    }
    fs.writeFileSync(target, content, "utf-8");
    const size = Buffer.byteLength(content, "utf-8");
      files.push({ file: target, size });
      manifestFiles.push({ target, backup: backup || null, size });
  };

    const finish = (message: string): ApplyResult => {
      const manifest: ApplyManifest = {
        id: `apply_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        page_id: page.id,
        files: manifestFiles.map((f) => ({ ...f })),
        message,
      };
      writeManifest(manifest);
      return { success: true, files, backup, page_id: page.id, manifest_id: manifest.id, message };
    };


  if (writeBackSource && record) {
    const htmlContent = buildImportedDocument(record, exportDesign("html"));
    if (record.kind === "file" && record.source_file) {
      writeWithBackup(record.source_file, htmlContent);
      const cssFile = path.join(path.dirname(record.source_file), "prism-adjustments.css");
      writeWithBackup(cssFile, buildAdjustmentCss());
      return finish(`已写回原文件 ${path.basename(record.source_file)}${backup ? "，备份：" + path.basename(backup) : ""}`);
    }

    const htmlFile = path.join(dir, `prism-adjusted-${slugify(page.name)}.html`);
    writeWithBackup(htmlFile, htmlContent);
    writeWithBackup(path.join(dir, "prism-adjustments.css"), buildAdjustmentCss());
    return finish(`已从原始文档重建并应用 ${files.length} 个文件${backup ? "，备份：" + path.basename(backup) : ""}`);
  }

  const htmlFile = path.join(dir, `prism-adjusted-${slugify(page.name)}.html`);
  const cssFile = path.join(dir, "prism-adjustments.css");
  writeWithBackup(htmlFile, exportDesign("html"));
  writeWithBackup(cssFile, buildAdjustmentCss());
  return finish(`已应用 ${files.length} 个文件${backup ? "，备份：" + path.basename(backup) : ""}`);
}

/** Restore the most recent backup of an applied artifact. */
export function rollbackApply(): RollbackResult {
  // 文件来源的一键应用会原位写回并备份在源文件旁的 .prism-backups。
  const state = stateStore.getState();
  const page = state.pages.find((p) => p.id === state.currentPageId);
  const record = page ? stateStore.getImport(page.id) : null;
  const manifest = latestManifest();
  if (manifest && manifest.files.length > 0) {
    let restoredCount = 0;
    for (const entry of manifest.files) {
      if (entry.backup && fs.existsSync(entry.backup)) {
        fs.copyFileSync(entry.backup, entry.target);
        restoredCount += 1;
      }
    }
    if (restoredCount > 0) {
      return { success: true, restored: String(restoredCount), message: `已回滚 ${restoredCount} 个文件（manifest ${manifest.id}）` };
    }
  }

  if (record && record.kind === "file" && record.source_file) {
    const sourceDir = path.dirname(record.source_file!);
    const sourceBackupDir = path.join(sourceDir, ".prism-backups");
    if (fs.existsSync(sourceBackupDir)) {
      const backups = fs
        .readdirSync(sourceBackupDir)
        .filter((f) => f.startsWith(`${path.basename(record.source_file!)}.bak-`))
        .sort();
      if (backups.length > 0) {
        const newest = backups[backups.length - 1];
        const restored = path.join(sourceDir, path.basename(record.source_file!));
        fs.copyFileSync(path.join(sourceBackupDir, newest), restored);
        return { success: true, restored, message: `已回滚：${path.basename(restored)}` };
      }
    }
    return { success: false, restored: null, message: "没有可回滚的备份" };
  }

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
