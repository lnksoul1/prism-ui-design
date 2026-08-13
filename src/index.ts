#!/usr/bin/env node
/**
 * UI Design MCP Server — Real-Time Collaborative Mode
 *
 * Architecture:
 *   ┌──────────┐     stdio      ┌──────────────────┐
 *   │ AI Agent │ ←─────────────→ │  MCP Server       │
 *   │ (Trae/   │                 │                    │
 *   │  Claude) │                 │  ┌──────────────┐ │
 *   └──────────┘                 │  │ Design State │ │
 *                                │  │ Store        │ │
 *                                │  └──────┬───────┘ │
 *                                │         │         │
 *   ┌──────────┐   WebSocket     │  ┌──────▼───────┐ │
 *   │ Browser  │ ←─────────────→ │  │ HTTP + WS    │ │
 *   │ Client   │                 │  │ Server       │ │
 *   │ (Canvas) │                 │  └──────────────┘ │
 *   └──────────┘                 └──────────────────┘
 *
 * The MCP Server runs on stdio for AI agent communication,
 * and simultaneously runs an HTTP + WebSocket server for
 * the browser-based client dashboard.
 *
 * When AI calls a design tool, the state store updates and
 * broadcasts the change via WebSocket to all connected clients.
 * When the user adjusts via the client, changes are written
 * back to the state store, visible to the AI on next query.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { stateStore, type ComponentNode } from "./state.js";
import { applyStyleTokenSet } from "./tokens.js";

// Shared mutation layer (used by both REST and WebSocket channels)
import * as designService from "./service/design-service.js";

// Existing design generation tools
import { registerColorPaletteTool } from "./tools/color-palette.js";
import { registerTypographyTool } from "./tools/typography.js";
import { registerSpacingTool } from "./tools/spacing.js";
import { registerShadowTool } from "./tools/shadows.js";
import { registerBorderRadiusTool } from "./tools/border-radius.js";
import { registerContrastTool } from "./tools/contrast.js";
import { registerGradientTool } from "./tools/gradient.js";
import { registerBreakpointsTool } from "./tools/breakpoints.js";
import { registerDesignTokensTool } from "./tools/design-tokens.js";

// New real-time design manipulation tools
import {
  registerAllDesignTools,
  exportDesign,
  exportComponentCode,
  applyPageTemplate,
} from "./tools/design-tools.js";

// Project import module
import { importClientUi, scanProject, type ExtractedPage } from "./import-project.js";

// Project persistence (save / load / autosave)
import { registerProjectTools } from "./tools/project-tools.js";
import {
  autosavePath,
  enableAutoSave,
  loadProject,
  listProjects,
  saveProject,
} from "./project-store.js";
import { listTemplates, loadTemplate, saveTemplate } from "./templates.js";
import { createVersion, diffVersions, listVersions, restoreVersion } from "./versions.js";
import { writebackAll, writebackPreview, writebackTokens, type WritebackMode } from "./writeback.js";

// Phase B capabilities: token interop, a11y audit, render preview, resources, prompts
import { registerTokenInteropTools } from "./tools/token-interop.js";
import { registerAuditTool } from "./tools/design-audit.js";
import { previewsDir, registerRenderTool } from "./tools/design-render.js";
import { registerTemplateTools } from "./tools/template-tools.js";
import { registerVersionTools } from "./tools/version-tools.js";
import { registerDesignMdTool } from "./tools/design-md.js";
import { registerStyleGuideTools } from "./tools/style-guide-tools.js";
import { applyStyleGuide, BRAND_DESIGN_SYSTEMS } from "./style-guides.js";
import { registerSemanticStyleTool } from "./tools/semantic-tools.js";
import { registerCapabilitiesTool } from "./tools/capabilities.js";
import { registerWebpageImportTool } from "./tools/webpage-import.js";
import { registerSpecTools } from "./tools/spec-tools.js";
import { registerPlatformTools } from "./tools/platform-tools.js";
import { registerCollabTools } from "./tools/collab-tools.js";
import { registerGeneratePageTool } from "./tools/generate-tools.js";
import { registerCanvasTools } from "./tools/canvas-tools.js";
import { canvasToHtml, shapesToComponents } from "./canvas-shapes.js";
import {
  registerSuggestTool,
  registerBrandStyleTool,
  registerReflowTool,
  registerAutoImproveTool,
  registerReviewAndImproveTool,
} from "./tools/design-review.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

// Upgrade plan U1-U3: Lenis/GSAP/Vanta/React Bits integration
import { registerScrollTools } from "./tools/scroll-tools.js";
import { registerAnimationEngineTools } from "./tools/animation-tools.js";
import { registerVantaTools } from "./tools/vanta-tools.js";
import { registerReactBitsTools } from "./tools/react-bits-tools.js";
// Trigger animation preset registration (css + gsap). These modules import the
// registry from ./animations/index.js, so the registry is initialized first.
import "./animations/css-presets.js";
import "./animations/gsap-presets.js";

// ===== Server Initialization =====

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

// ===== Register All Tools =====

// Existing generation tools (color, typography, spacing, etc.)
registerColorPaletteTool(server);
registerTypographyTool(server);
registerSpacingTool(server);
registerShadowTool(server);
registerBorderRadiusTool(server);
registerContrastTool(server);
registerGradientTool(server);
registerBreakpointsTool(server);
registerDesignTokensTool(server);

// New real-time design tools (init, add_component, set_token, etc.)
registerAllDesignTools(server);

// Project persistence tools (save / load / list)
registerProjectTools(server);

// Token interchange (DTCG / CSS / Style Dictionary / Figma Tokens)
registerTokenInteropTools(server);

// Accessibility audit
registerAuditTool(server);

// Visual verification (HTML always, PNG when Playwright is installed)
registerRenderTool(server);

// Templates (C3) and version snapshots (C4)
registerTemplateTools(server);
registerVersionTools(server);

// DESIGN.md interop, webpage import, style guides, semantic styling
registerDesignMdTool(server);
registerWebpageImportTool(server);
registerStyleGuideTools(server);
registerSemanticStyleTool(server);

// Self-describing capability manifest
registerCapabilitiesTool(server);

// Spec §8.2 alignment tools (list presets/components/pages, token get/batch/delete, project name)
registerSpecTools(server);

// Design review: suggestions, brand style learning, reflow
registerSuggestTool(server);
registerBrandStyleTool(server);
registerReflowTool(server);
registerAutoImproveTool(server);
registerReviewAndImproveTool(server);

// C2 platform snapshots, C5 comments, C6 one-shot page generation
registerPlatformTools(server);
registerCollabTools(server);
registerGeneratePageTool(server);
registerCanvasTools(server);

// Upgrade plan U1-U3: Lenis (scroll), GSAP (animations), Vanta (3D bg), React Bits
registerScrollTools(server);
registerAnimationEngineTools(server);
registerVantaTools(server);
registerReactBitsTools(server);

// MCP Resources + Prompts for agent context
registerResources(server);
registerPrompts(server);

// ===== HTTP + WebSocket Server (for browser client) =====

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

// Connected dashboard clients (presence + cursor tracking)
const wsClients = new Map<WebSocket, { id: string; joinedAt: string; cursor?: { x: number; y: number } }>();

// Serve static client files
const clientDir = path.resolve(__dirname, "../client");
app.use(express.json());
app.use(express.static(clientDir));
app.use("/previews", express.static(previewsDir()));

// API: Get current state
app.get("/api/state", (_req, res) => {
  res.json(stateStore.getState());
});

// API: Update token (from client slider adjustment)
app.post("/api/token", (req, res) => {
  const { category, key, value } = req.body;
  if (!category || !key || !value) {
    res.status(400).json({ error: "Missing category, key, or value" });
    return;
  }
  try {
    designService.setToken(category, key, value, "user");
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Reorder component (from client drag-and-drop)
// NOTE: Must be defined before /api/component/:id to avoid route conflict
app.post("/api/component/reorder", (req, res) => {
  const { from_id, to_id, position } = req.body;
  if (!from_id || !to_id || !position) {
    res.status(400).json({ error: "Missing from_id, to_id, or position" });
    return;
  }
  const success = designService.reorderComponent(from_id, to_id, position, "user");
  res.json({ success });
});

// API: Inspect — export a single component as code (HTML / React / CSS)
function findComponentInState(id: string): ComponentNode | null {
  const state = stateStore.getState();
  const search = (list: ComponentNode[]): ComponentNode | null => {
    for (const c of list) {
      if (c.id === id) return c;
      const found = search(c.children || []);
      if (found) return found;
    }
    return null;
  };
  for (const page of state.pages) {
    const found = search(page.components);
    if (found) return found;
  }
  return null;
}

app.get("/api/component/:id/code", (req, res) => {
  const format = typeof req.query.format === "string" ? req.query.format : "html";
  if (!["html", "react", "css"].includes(format)) {
    res.status(400).json({ error: "Invalid format. Must be 'html', 'react', or 'css'" });
    return;
  }
  const comp = findComponentInState(req.params.id);
  if (!comp) {
    res.status(404).json({ error: `Component ${req.params.id} not found` });
    return;
  }
  const code = exportComponentCode(comp, format, stateStore.getState().tokens);
  res.json({ success: true, id: comp.id, type: comp.type, format, code });
});

// API: Update component (from client inline edit)
app.post("/api/component/:id", (req, res) => {
  const { id } = req.params;
  const { props } = req.body;
  const success = designService.updateComponent(id, props, "user");
  res.json({ success });
});

// API: Remove component (from client)
app.delete("/api/component/:id", (req, res) => {
  const { id } = req.params;
  const success = designService.removeComponent(id, "user");
  res.json({ success });
});

// API: Undo
app.post("/api/undo", (_req, res) => {
  const success = designService.undo();
  res.json({ success, canUndo: stateStore.canUndo(), canRedo: stateStore.canRedo() });
});

// API: Redo
app.post("/api/redo", (_req, res) => {
  const success = designService.redo();
  res.json({ success, canUndo: stateStore.canUndo(), canRedo: stateStore.canRedo() });
});

// API: Add page
app.post("/api/page", (req, res) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: "Missing page name" });
    return;
  }
  const page = designService.addPage(name, "user");
  res.json({ success: true, page_id: page.id, name: page.name });
});

// API: Switch page
app.post("/api/page/:id/switch", (req, res) => {
  const { id } = req.params;
  const success = designService.switchPage(id, "user");
  res.json({ success });
});

// API: Remove page
app.delete("/api/page/:id", (req, res) => {
  const { id } = req.params;
  const success = designService.removePage(id, "user");
  res.json({ success });
});

// API: Rename page
app.post("/api/page/:id/rename", (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: "Missing page name" });
    return;
  }
  const success = designService.renamePage(id, name, "user");
  res.json({ success });
});

// API: Set theme mode
app.post("/api/theme", (req, res) => {
  const { mode } = req.body;
  if (mode !== "light" && mode !== "dark") {
    res.status(400).json({ error: "Mode must be 'light' or 'dark'" });
    return;
  }
  designService.setTheme(mode, "user");
  res.json({ success: true, mode });
});

// API: Get token conflicts
app.get("/api/conflicts", (_req, res) => {
  const conflicts = stateStore.getTokenConflicts();
  res.json({ conflicts, count: conflicts.length });
});

// API: Export design as code
app.post("/api/export", (req, res) => {
  const { format } = req.body;
  if (!["html", "react", "vue", "figma_tokens", "react-ts", "css", "presentation", "flutter", "swiftui", "svelte"].includes(format)) {
    res.status(400).json({ error: "Invalid format. Must be 'html', 'react', 'vue', 'figma_tokens', 'react-ts', 'css', 'presentation', 'flutter', 'swiftui', or 'svelte'" });
    return;
  }
  try {
    const code = exportDesign(format);
    res.json({ success: true, format, code, code_length: code.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Submit AI prompt (user sends natural language from client dashboard)
app.post("/api/prompt", (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Missing prompt string" });
    return;
  }
  designService.setPendingPrompt(prompt);
  broadcastPromptQueued(prompt);
  res.json({ success: true });
});

// API: Import project from folder path — scans for HTML/JSX/Vue files and extracts pages
app.post("/api/import", async (req, res) => {
  const { path: folderPath, clear_existing } = req.body;
  if (!folderPath || typeof folderPath !== "string") {
    res.status(400).json({ error: "Missing 'path' field (project folder path)" });
    return;
  }

  try {
    // Validate path exists
    const fs = await import("fs");
    if (!fs.existsSync(folderPath)) {
      res.status(404).json({ error: `Path not found: ${folderPath}` });
      return;
    }

    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: `Path is not a directory: ${folderPath}` });
      return;
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
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// API: Import the Prism client dashboard shell so the service can open and
// adjust the project's own UI on the canvas.
app.post("/api/import-client", (req, res) => {
  const { clear_existing } = req.body || {};
  try {
    const result = importClientUi(clear_existing === true);
    stateStore.setProjectName("Prism 客户端", "ai");
    stateStore.setStyle("minimal", "ai");
    applyStyleTokenSet(stateStore, "minimal", "#7C3AED", "ai");
    stateStore.switchPage(result.pageId, "ai");
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Capture the live dashboard itself with Playwright and drop the
// screenshot into the canvas as a reference image.
app.post("/api/capture-client", async (_req, res) => {
  try {
    const { captureUrlPng } = await import("./tools/design-render.js");
    const url = `http://127.0.0.1:${PORT}/`;
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
    res.json({ success: true, file, url, component_id: node.id, bytes: png.length });
  } catch (error) {
    res.status(501).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: One-click write-back — design tokens into client/style.css (with backup)
// and the full design into client/design-writeback.html.
app.post("/api/writeback", (req, res) => {
  const bodyMode = (req.body || {}).mode;
  const mode: WritebackMode = bodyMode === "preview" || bodyMode === "all" ? bodyMode : "tokens";
  try {
    const clientDir = process.env.PRISM_CLIENT_DIR || path.resolve(__dirname, "..", "client");
    const result =
      mode === "all"
        ? writebackAll(clientDir)
        : mode === "preview"
          ? writebackPreview(clientDir)
          : writebackTokens(clientDir);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Get the tldraw canvas document for a page (defaults to current page)
app.get("/api/canvas", (req, res) => {
  const state = stateStore.getState();
  const pageId =
    typeof req.query.pageId === "string" ? req.query.pageId : state.currentPageId;
  if (!pageId) {
    res.status(400).json({ error: "No page id" });
    return;
  }
  const doc = stateStore.getCanvasDoc(pageId);
  res.json({ success: true, page_id: pageId, doc });
});

// API: Save the tldraw canvas document for a page
app.post("/api/canvas", (req, res) => {
  const state = stateStore.getState();
  const pageId =
    typeof (req.body || {}).pageId === "string"
      ? (req.body as { pageId: string }).pageId
      : state.currentPageId;
  const doc = (req.body || {}).doc;
  if (!pageId || !doc || typeof doc !== "object") {
    res.status(400).json({ error: "Missing pageId or canvas doc" });
    return;
  }
  try {
    stateStore.saveCanvasDoc(pageId, doc, "user");
    res.json({ success: true, page_id: pageId, revision: stateStore.getState().revision });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Apply the current page's canvas drawing to the component model
app.post("/api/canvas/apply", (_req, res) => {
  const state = stateStore.getState();
  const pageId = state.currentPageId;
  const doc = stateStore.getCanvasDoc(pageId);
  if (!pageId || !doc) {
    res.status(400).json({ error: "No canvas document for the current page" });
    return;
  }
  try {
    const components = shapesToComponents(doc);
    stateStore.replacePageComponents(pageId, components, "user");
    res.json({
      success: true,
      page_id: pageId,
      component_count: components.length,
      components,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Write the canvas drawing back to a real HTML file in the client folder
app.post("/api/canvas/export", async (_req, res) => {
  const state = stateStore.getState();
  const doc = stateStore.getCanvasDoc(state.currentPageId);
  if (!doc) {
    res.status(400).json({ error: "No canvas document for the current page" });
    return;
  }
  try {
    const html = canvasToHtml(doc, state.tokens);
    const fs = await import("fs");
    const targetClientDir = process.env.PRISM_CLIENT_DIR || clientDir;
    const out = path.join(targetClientDir, "canvas-page.html");
    fs.writeFileSync(out, html, "utf-8");
    res.json({ success: true, file: out, size: html.length, component_count: shapesToComponents(doc).length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Queue AI drawing commands for the current page's canvas
app.post("/api/canvas/draw", (req, res) => {
  const state = stateStore.getState();
  const shapes = (req.body || {}).shapes;
  if (!Array.isArray(shapes) || shapes.length === 0) {
    res.status(400).json({ error: "Missing shapes array" });
    return;
  }
  try {
    const queued = stateStore.addCanvasDraws(shapes, state.currentPageId, "ai");
    res.json({ success: true, page_id: state.currentPageId, queued: queued.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Clear the applied draw queue for a page
app.post("/api/canvas/draws/clear", (req, res) => {
  const state = stateStore.getState();
  const pageId =
    typeof (req.body || {}).pageId === "string"
      ? (req.body as { pageId: string }).pageId
      : state.currentPageId;
  const cleared = stateStore.clearCanvasDraws(pageId, "user");
  res.json({ success: true, cleared });
});

// API: Initialize design project (mirrors design_init MCP tool)
app.post("/api/init", (req, res) => {
  const { project_name, style, base_color } = req.body;
  if (!project_name || !style) {
    res.status(400).json({ error: "Missing project_name or style" });
    return;
  }
  try {
    const result = designService.initProject(project_name, style, base_color);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Add component to canvas (mirrors design_add_component MCP tool)
app.post("/api/component", (req, res) => {
  const { type, variant, props, parent_id } = req.body;
  if (!type) {
    res.status(400).json({ error: "Missing component type" });
    return;
  }
  try {
    const node = designService.addComponent(type, variant, props || {}, parent_id || null, "ai");
    res.json({ success: true, id: node.id, type: node.type });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Apply a page template (used by the canvas empty-state "start from template")
app.post("/api/template", (req, res) => {
  const { template } = req.body;
  if (!template || typeof template !== "string") {
    res.status(400).json({ error: "Missing template name" });
    return;
  }
  try {
    const componentIds = applyPageTemplate(template);
    res.json({ success: true, template, component_ids: componentIds, count: componentIds.length });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: List saved templates
app.get("/api/templates", (_req, res) => {
  try {
    const templates = listTemplates();
    res.json({ success: true, count: templates.length, templates });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: List brand design systems (one-click token overrides)
app.get("/api/design-systems", (_req, res) => {
  const systems = BRAND_DESIGN_SYSTEMS.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    keywords: s.keywords,
    swatch:
      s.tokens.colors?.["color-primary"] ||
      s.tokens.colors?.["color-accent"] ||
      s.tokens.colors?.["color-bg"] ||
      null,
    preview: {
      bg: s.tokens.colors?.["color-bg"] || null,
      surface: s.tokens.colors?.["color-surface"] || null,
      text: s.tokens.colors?.["color-text"] || null,
      primary: s.tokens.colors?.["color-primary"] || null,
    },
  }));
  res.json({ success: true, systems });
});

// API: Apply a brand design system (token overrides, undoable)
app.post("/api/design-system/apply", (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Missing design system name" });
    return;
  }
  try {
    const result = applyStyleGuide(name);
    res.json({ success: true, guide_id: result.guide_id, guide_name: result.guide_name, overrides: result.overrides.length });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Save the current design as a template
app.post("/api/template/save", (req, res) => {
  const { name } = req.body || {};
  try {
    const result = saveTemplate(typeof name === "string" ? name : undefined);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Load a saved template
app.post("/api/template/load", (req, res) => {
  const { file } = req.body || {};
  if (!file || typeof file !== "string") {
    res.status(400).json({ error: "Missing 'file' field" });
    return;
  }
  try {
    const result = loadTemplate(file);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Create a design version snapshot
app.post("/api/version", (req, res) => {
  const { name } = req.body || {};
  try {
    const version = createVersion(typeof name === "string" ? name : undefined);
    res.json({
      success: true,
      id: version.id,
      name: version.name,
      created_at: version.createdAt,
      component_count: version.componentCount,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: List design versions
app.get("/api/versions", (_req, res) => {
  try {
    const versions = listVersions();
    res.json({ success: true, count: versions.length, versions });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Diff two versions
app.post("/api/version/diff", (req, res) => {
  const { from_id, to_id } = req.body || {};
  if (!from_id || !to_id) {
    res.status(400).json({ error: "Missing from_id or to_id" });
    return;
  }
  try {
    const diff = diffVersions(from_id, to_id);
    res.json({ success: true, ...diff });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Restore a version snapshot
app.post("/api/version/:id/restore", (req, res) => {
  const { id } = req.params;
  try {
    const version = restoreVersion(id);
    res.json({ success: true, restored_id: version.id, name: version.name });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Add a review comment
app.post("/api/comment", (req, res) => {
  const { component_id, text, author } = req.body || {};
  if (!component_id || !text) {
    res.status(400).json({ error: "Missing component_id or text" });
    return;
  }
  try {
    const comment = stateStore.addComment(component_id, String(text), typeof author === "string" ? author : "user", "user");
    res.json({ success: true, comment });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: List comments (optionally filtered by component)
app.get("/api/comments", (req, res) => {
  const componentId = typeof req.query.component_id === "string" ? req.query.component_id : undefined;
  const all = stateStore.getState().comments;
  const comments = componentId ? all.filter((c) => c.component_id === componentId) : all;
  res.json({ success: true, count: comments.length, comments });
});

// API: Remove a comment
app.delete("/api/comment/:id", (req, res) => {
  const ok = stateStore.removeComment(req.params.id, "user");
  if (!ok) {
    res.status(404).json({ success: false, error: `Comment ${req.params.id} not found` });
    return;
  }
  res.json({ success: true, comment_id: req.params.id });
});

// API: Save project to disk
app.post("/api/project/save", (req, res) => {
  const { name, file } = req.body || {};
  try {
    const result = saveProject(typeof name === "string" ? name : undefined, typeof file === "string" ? file : undefined);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Load project from disk
app.post("/api/project/load", (req, res) => {
  const { file } = req.body || {};
  if (!file || typeof file !== "string") {
    res.status(400).json({ error: "Missing 'file' field (path to .prism.json)" });
    return;
  }
  try {
    const result = loadProject(file);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: List saved projects
app.get("/api/projects", (_req, res) => {
  try {
    const projects = listProjects();
    res.json({ success: true, count: projects.length, projects });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// API: Render the current design as HTML, or as a real PNG screenshot
// (requires Playwright; returns 501 with a readable error when unavailable).
app.get("/api/render", async (req, res) => {
  try {
    const { exportDesign } = await import("./tools/design-tools.js");
    const { renderHtmlToPng } = await import("./tools/design-render.js");
    const format = req.query.format === "png" ? "png" : "html";
    const viewport = typeof req.query.viewport === "string" ? req.query.viewport : "desktop";
    const html = exportDesign("html");
    if (format === "png") {
      try {
        const png = await renderHtmlToPng(html, viewport);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Disposition", `inline; filename="prism-preview-${viewport}.png"`);
        res.send(png);
      } catch (error) {
        res.status(501).json({
          error:
            error instanceof Error && error.message.includes("playwright")
              ? "Playwright is not installed — run `npm i -D playwright && npx playwright install chromium` to enable screenshots."
              : `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      return;
    }
    res.json({ success: true, html, code_length: html.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: SERVER_NAME,
    version: SERVER_VERSION,
    clients: wss.clients.size,
  });
});

// ===== WebSocket: Real-time sync =====

wss.on("connection", (ws: WebSocket) => {
  const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  wsClients.set(ws, { id: clientId, joinedAt: new Date().toISOString() });

  // Send current state on connect
  ws.send(JSON.stringify({
    type: "init",
    clientId,
    state: stateStore.getState(),
  }));
  broadcastPresence();

  // Listen for client adjustments
  ws.on("message", (data: Buffer) => {
    try {
      const raw = JSON.parse(data.toString());

      // Live cursors are ephemeral and bypass the mutation pipeline (C5).
      if (raw && raw.type === "cursor") {
        if (typeof raw.x === "number" && typeof raw.y === "number") {
          wsClients.set(ws, { ...(wsClients.get(ws) || { id: clientId, joinedAt: new Date().toISOString() }), cursor: { x: raw.x, y: raw.y } });
          broadcastCursor(clientId, raw.x, raw.y);
        }
        return;
      }

      // Optimistic concurrency: reject mutations based on a stale revision (C5).
      const baseRevision = typeof raw?.base_revision === "number" ? raw.base_revision : undefined;
      const { base_revision: _br, ...rest } = raw || {};
      if (baseRevision !== undefined && baseRevision !== stateStore.getState().revision) {
        ws.send(JSON.stringify({
          type: "conflict",
          message: `Design changed by another client (revision ${baseRevision} → ${stateStore.getState().revision}). Reload and retry.`,
          expected_revision: baseRevision,
          current_revision: stateStore.getState().revision,
        }));
        return;
      }

      const parsed = designService.wsMessageSchema.safeParse(rest);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join(".") || "message"}: ${i.message}`)
          .join("; ");
        ws.send(JSON.stringify({ type: "error", message: `Invalid client message — ${issues}` }));
        return;
      }
      const result = designService.applyClientMessage(parsed.data);
      if (!result.ok) {
        ws.send(JSON.stringify({ type: "error", message: result.detail }));
      } else if (parsed.data.type === "prompt") {
        broadcastPromptQueued(parsed.data.prompt);
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: "error", message: `Malformed message: ${error instanceof Error ? error.message : String(error)}` }));
    }
  });

  ws.on("close", () => {
    wsClients.delete(ws);
    broadcastPresence();
    broadcastCursorLeave(clientId);
  });
});

function broadcastPresence(): void {
  const clients = [...wsClients.values()];
  const message = JSON.stringify({
    type: "presence",
    count: clients.length,
    clients,
  });
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastCursor(clientId: string, x: number, y: number): void {
  const message = JSON.stringify({ type: "cursor", client_id: clientId, x, y });
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastCursorLeave(clientId: string): void {
  const message = JSON.stringify({ type: "cursor_leave", client_id: clientId });
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastPromptQueued(prompt: string): void {
  const message = JSON.stringify({ type: "prompt_queued", prompt });
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastPromptAccepted(prompt: string): void {
  const message = JSON.stringify({ type: "prompt_accepted", prompt });
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastPromptExecuted(summary: string, action: string): void {
  const message = JSON.stringify({ type: "prompt_executed", summary, action });
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ===== Broadcast state changes to all WebSocket clients =====

stateStore.on("change", (change: unknown) => {
  const message = JSON.stringify({
    type: "change",
    change,
    state: stateStore.getState(),
  });
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
});

stateStore.on("activity", (entry: unknown) => {
  const message = JSON.stringify({
    type: "activity",
    entry,
  });
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
});

// When the agent consumes a queued prompt, tell every dashboard so the
// "waiting for agent" status flips to "accepted".
stateStore.on("prompt_accepted", (prompt: unknown) => {
  broadcastPromptAccepted(String(prompt));
});

stateStore.on("prompt_executed", (result: unknown) => {
  const r = (result || {}) as { summary?: string; action?: string };
  broadcastPromptExecuted(r.summary || "", r.action || "prompt_executed");
});

// ===== Start Everything =====

const PORT = parseInt(process.env.DASHBOARD_PORT || "3100", 10);

// Auto-import existing project pages on startup
async function autoImportProjectPages(): Promise<void> {
  try {
    // Determine the project root: two levels up from dist/ (e.g., d:\Prism from d:\Prism\prism-ui-design-mcp\dist)
    const projectRoot = path.resolve(__dirname, "..", "..");
    const fs = await import("fs");

    if (!fs.existsSync(projectRoot)) {
      console.error(`[${SERVER_NAME}] Auto-import: project root not found: ${projectRoot}`);
      return;
    }

    console.error(`[${SERVER_NAME}] Auto-import: scanning ${projectRoot} for existing pages...`);

    const result = scanProject(projectRoot);

    if (result.pages.length === 0) {
      console.error(`[${SERVER_NAME}] Auto-import: no supported design files found`);
      return;
    }

    // Clear the default empty page and import found pages
    stateStore.clearAll("ai");
    const projectName = path.basename(projectRoot);
    stateStore.setProjectName(projectName, "ai");

    // Remember the default "Home" page ID so we can remove it after importing
    const stateAfterClear = stateStore.getState();
    const defaultPageId = stateAfterClear.pages && stateAfterClear.pages.length > 0 ? stateAfterClear.pages[0].id : null;

    let totalComponents = 0;
    for (const page of result.pages) {
      const newPage = stateStore.addPage(page.name, "ai");
      for (const comp of page.components) {
        stateStore.addComponent(
          comp.type,
          comp.variant,
          comp.props,
          null,
          "ai"
        );
      }
      totalComponents += page.components.length;
    }

    // Remove the default empty "Home" page now that we have imported pages
    if (defaultPageId) {
      stateStore.removePage(defaultPageId, "ai");
    }

    // Switch to the first imported page
    const state = stateStore.getState();
    if (state.pages && state.pages.length > 0) {
      stateStore.switchPage(state.pages[0].id, "ai");
    }

    console.error(`[${SERVER_NAME}] Auto-import: imported ${result.pages.length} pages, ${totalComponents} components from ${result.scannedFiles} files`);
  } catch (error) {
    console.error(`[${SERVER_NAME}] Auto-import error:`, error instanceof Error ? error.message : String(error));
  }
}

async function main(): Promise<void> {
  // 1. Start MCP server on stdio (for AI agent)
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME} v${SERVER_VERSION}] MCP stdio transport ready for AI agent`);

  // 2. Restore the most recent project (autosave checkpoint), otherwise auto-import
  const fs = await import("fs");
  const autoImport = process.env.PRISM_AUTOIMPORT !== "off";
  if (process.env.PRISM_AUTOLOAD !== "off" && fs.existsSync(autosavePath())) {
    try {
      const result = loadProject(autosavePath());
      console.error(
        `[${SERVER_NAME}] Restored autosaved project "${result.project_name}" (${result.component_count} components)`
      );
    } catch (error) {
      console.error(`[${SERVER_NAME}] Autosave restore failed:`, error instanceof Error ? error.message : String(error));
      if (autoImport) await autoImportProjectPages();
    }
  } else if (autoImport) {
    await autoImportProjectPages();
  }

  // 3. Rolling autosave on every state change
  enableAutoSave();

  // 4. Start HTTP + WebSocket server (for browser client)
  httpServer.listen(PORT, () => {
    console.error(`[${SERVER_NAME}] Dashboard: http://localhost:${PORT}`);
    console.error(`[${SERVER_NAME}] WebSocket: ws://localhost:${PORT}/ws`);
    console.error(`[${SERVER_NAME}] Project autosave enabled`);
    console.error(`[${SERVER_NAME}] Configure your AI agent to use this MCP server via stdio`);
    console.error(`[${SERVER_NAME}] Open the dashboard URL in your browser to monitor in real-time`);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
