import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { stateStore, type ImportRecord } from "../state.js";
import * as designService from "../service/design-service.js";
import { importClientUi, importHtmlString, scanProject } from "../import-project.js";
import { applyStyleTokenSet } from "../tokens.js";
import { saveProject, loadProject, listProjects, getProjectDir } from "../project-store.js";
import { writebackAll, writebackPreview, writebackTokens, type WritebackMode } from "../writeback.js";
import { applyDesign, rollbackApply } from "../apply.js";
import { exportDesign } from "../tools/design-tools.js";
import { previewsDir } from "../tools/design-render.js";
import { asyncHandler, HttpError } from "./shared.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = parseInt(process.env.DASHBOARD_PORT || "3100", 10);

// Project / import / writeback / init routes
export function registerProjectsRoutes(): express.Router {
  const router = express.Router();

  // API: Import project from folder path — scans for HTML/JSX/Vue files and extracts pages
  router.post("/api/import", asyncHandler(async (req, res) => {
    const { path: folderPath, clear_existing } = req.body;
    if (!folderPath || typeof folderPath !== "string") {
      throw new HttpError(400, "Missing 'path' field (project folder path)");
    }

    // Validate path exists
    const fs = await import("fs");
    if (!fs.existsSync(folderPath)) {
      throw new HttpError(404, `Path not found: ${folderPath}`);
    }

    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      throw new HttpError(400, `Path is not a directory: ${folderPath}`);
    }

    // Scan and parse the project
    const result = scanProject(folderPath);

    if (result.pages.length === 0) {
      res.json({
        success: false,
        message: "No supported files found (HTML, JSX, TSX, Vue)",
        scannedFiles: result.scannedFiles,
      });
      return;
    }

    // Optionally clear existing state
    if (clear_existing) {
      stateStore.clearAll("ai");
    }

    // Get the current project name or use the folder name
    const projectName = path.basename(folderPath);
    stateStore.setProjectName(projectName, "ai");

    // Create pages from extracted content
    const createdPages: Array<{ id: string; name: string; componentCount: number }> = [];

    for (const page of result.pages) {
      // Create a new page
      const newPage = stateStore.addPage(page.name, "ai");

      // Add each extracted component to the page
      for (const comp of page.components) {
        stateStore.addComponent(
          comp.type,
          comp.variant,
          comp.props,
          null,
          "ai"
        );
      }

      // Record provenance so the apply banner / one-click apply cover this
      // page too (导入 → 调整 → 一键应用 一等旅程).
      await recordProductImport(newPage.id, "file", page.name || projectName, page.components.length);

      createdPages.push({
        id: newPage.id,
        name: page.name,
        componentCount: page.components.length,
      });
    }

    // Switch to the first imported page
    if (createdPages.length > 0) {
      stateStore.switchPage(createdPages[0].id, "ai");
    }

    res.json({
      success: true,
      project_name: projectName,
      scanned_files: result.scannedFiles,
      pages_imported: createdPages.length,
      total_components: result.totalComponents,
      pages: createdPages,
    });
  }));

  // API: Import the Prism client dashboard shell so the service can open and
  // adjust the project's own UI on the canvas. Records provenance so the
  // apply banner / one-click apply work for this source too.
  router.post("/api/import-client", asyncHandler(async (req, res) => {
    const { clear_existing } = req.body || {};
    const result = importClientUi(clear_existing === true);
    stateStore.setProjectName("Prism 客户端", "ai");
    stateStore.setStyle("minimal", "ai");
    applyStyleTokenSet(stateStore, "minimal", "#7C3AED", "ai");
    stateStore.switchPage(result.pageId, "ai");
    await recordProductImport(result.pageId, "client", "Prism 客户端界面", result.imported);
    res.json({ success: true, ...result, page_id: result.pageId, imported: result.imported });
  }));

  // API: Capture the live dashboard itself with Playwright and drop the
  // screenshot into the canvas as a reference image. Records provenance so
  // the apply pipeline treats it like any other imported product page.
  router.post("/api/capture-client", asyncHandler(async (_req, res) => {
    const { captureUrlPng } = await import("../tools/design-render.js");
    const url = `http://127.0.0.1:${port}/`;
    const png = await captureUrlPng(url, "desktop");
    const file = `capture-${Date.now()}.png`;
    const { writeFileSync } = await import("fs");
    writeFileSync(path.join(previewsDir(), file), png);
    const node = stateStore.addComponent(
      "image",
      undefined,
      { src: `/previews/${file}`, alt: "Prism 实际界面" },
      null,
      "user"
    );
    const pageId = stateStore.getState().currentPageId || stateStore.getState().pages[0]?.id || "";
    if (pageId) {
      await recordProductImport(pageId, "capture", "实际界面截图", 1);
    }
    res.json({ success: true, file, url, component_id: node.id, bytes: png.length, page_id: pageId });
  }));

  // API: One-click write-back — design tokens into client/style.css (with backup)
  // and the full design into client/design-writeback.html.
  router.post("/api/writeback", asyncHandler(async (req, res) => {
    const bodyMode = (req.body || {}).mode;
    const mode: WritebackMode = bodyMode === "preview" || bodyMode === "all" ? bodyMode : "tokens";
    const clientDir = process.env.PRISM_CLIENT_DIR || path.resolve(__dirname, "../../client");
    const result =
      mode === "all"
        ? writebackAll(clientDir)
        : mode === "preview"
          ? writebackPreview(clientDir)
          : writebackTokens(clientDir);
    res.json({ success: true, ...result });
  }));

  // API: Initialize design project (mirrors design_init MCP tool)
  router.post("/api/init", asyncHandler(async (req, res) => {
    const { project_name, style, base_color } = req.body;
    if (!project_name || !style) {
      throw new HttpError(400, "Missing project_name or style");
    }
    const result = designService.initProject(project_name, style, base_color);
    res.json(result);
  }));

  // API: Save project to disk
  router.post("/api/project/save", asyncHandler(async (req, res) => {
    const { name, file } = req.body || {};
    const result = saveProject(typeof name === "string" ? name : undefined, typeof file === "string" ? file : undefined);
    res.json({ success: true, ...result });
  }));

  // API: Load project from disk
  router.post("/api/project/load", asyncHandler(async (req, res) => {
    const { file } = req.body || {};
    if (!file || typeof file !== "string") {
      throw new HttpError(400, "Missing 'file' field (path to .prism.json)");
    }
    const result = loadProject(file);
    res.json({ success: true, ...result });
  }));

  // API: List saved projects
  router.get("/api/projects", asyncHandler(async (_req, res) => {
    const projects = listProjects();
    res.json({ success: true, count: projects.length, projects });
  }));

  // ===== 导入 → 调整 → 一键应用 管线 (product definition v3.2 支柱④) =====

  /**
   * Record product provenance for an imported page so the apply banner and
   * one-click apply work for every import source (URL/HTML/client UI/capture).
   * Persists the original HTML snapshot for future apply steps.
   */
  async function recordProductImport(
    pageId: string,
    kind: ImportRecord["kind"],
    source: string,
    componentCount: number,
    url?: string
  ): Promise<void> {
    const fs = await import("fs");
    const importsDir = path.join(getProjectDir(), "imports");
    fs.mkdirSync(importsDir, { recursive: true });
    const htmlFile = path.join(importsDir, `${pageId}.html`);
    if (!fs.existsSync(htmlFile)) {
      // Snapshot the current rendered page so apply has an original to diff.
      fs.writeFileSync(htmlFile, exportDesign("html"), "utf-8");
    }
    stateStore.setImport(
      pageId,
      {
        kind,
        source,
        url,
        html_file: htmlFile,
        imported_at: new Date().toISOString(),
        component_count: componentCount,
      },
      "user"
    );
  }

  // API: Import the user's own product (URL or pasted HTML) as an editable page
  router.post("/api/import/product", asyncHandler(async (req, res) => {
    const { url, html } = req.body || {};
    if ((!url && !html) || (url && html)) {
      throw new HttpError(400, "Provide exactly one of 'url' or 'html'");
    }
    const fs = await import("fs");
    let sourceHtml: string;
    let sourceName: string;
    let kind: ImportRecord["kind"] = "html";
    try {
      if (html) {
        sourceHtml = String(html);
        sourceName = "Pasted HTML";
      } else {
        const parsed = new URL(String(url));
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new HttpError(400, "Only http/https URLs are supported");
        }
        kind = "url";
        const response = await fetch(parsed, {
          headers: { "User-Agent": "Prism-Import/1.0" },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          throw new HttpError(502, `Fetch failed: HTTP ${response.status} for ${url}`);
        }
        sourceHtml = await response.text();
        sourceName = parsed.hostname;
      }
      if (sourceHtml.length > 2_000_000) {
        throw new HttpError(400, `Page too large (${sourceHtml.length} chars, max 2000000)`);
      }
      const result = importHtmlString(sourceHtml, sourceName, false);
      // Persist the original HTML for provenance / future apply steps
      const importsDir = path.join(getProjectDir(), "imports");
      fs.mkdirSync(importsDir, { recursive: true });
      const htmlFile = path.join(importsDir, `${result.pageId}.html`);
      fs.writeFileSync(htmlFile, sourceHtml, "utf-8");
      await recordProductImport(result.pageId, kind, sourceName, result.imported, kind === "url" ? String(url) : undefined);
      stateStore.switchPage(result.pageId, "user");
      res.json({
        success: true,
        page_id: result.pageId,
        page_name: result.pageName,
        source: sourceName,
        imported: result.imported,
        message: `已导入 ${result.imported} 个组件（来源：${sourceName}），调整后可以一键应用`,
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, error instanceof Error ? error.message : String(error));
    }
  }));

  // API: List import provenance records
  router.get("/api/imports", asyncHandler(async (_req, res) => {
    const state = stateStore.getState();
    res.json({ success: true, imports: state.imports || {} });
  }));

  // API: One-click apply — write the adjusted page + adjustment CSS into the
  // product directory with timestamped backups (rollback supported).
  router.post("/api/apply", asyncHandler(async (_req, res) => {
    const result = applyDesign();
    if (!result.success) {
      throw new HttpError(400, result.message);
    }
    res.json(result);
  }));

  // API: Roll back the most recent apply
  router.post("/api/apply/rollback", asyncHandler(async (_req, res) => {
    const result = rollbackApply();
    res.json(result);
  }));

  return router;
}
