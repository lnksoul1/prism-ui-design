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
import { stateStore } from "./state.js";

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
import { registerAllDesignTools, exportDesign } from "./tools/design-tools.js";

// Project import module
import { scanProject, type ExtractedPage } from "./import-project.js";

// Project persistence (save / load / autosave)
import { registerProjectTools } from "./tools/project-tools.js";
import {
  autosavePath,
  enableAutoSave,
  loadProject,
  listProjects,
  saveProject,
} from "./project-store.js";

// Phase B capabilities: token interop, a11y audit, render preview, resources, prompts
import { registerTokenInteropTools } from "./tools/token-interop.js";
import { registerAuditTool } from "./tools/design-audit.js";
import { registerRenderTool } from "./tools/design-render.js";
import { registerTemplateTools } from "./tools/template-tools.js";
import { registerVersionTools } from "./tools/version-tools.js";
import { registerDesignMdTool } from "./tools/design-md.js";
import { registerStyleGuideTools } from "./tools/style-guide-tools.js";
import { registerSemanticStyleTool } from "./tools/semantic-tools.js";
import { registerCapabilitiesTool } from "./tools/capabilities.js";
import { registerWebpageImportTool } from "./tools/webpage-import.js";
import { registerSpecTools } from "./tools/spec-tools.js";
import { registerPlatformTools } from "./tools/platform-tools.js";
import { registerCollabTools } from "./tools/collab-tools.js";
import { registerGeneratePageTool } from "./tools/generate-tools.js";
import {
  registerSuggestTool,
  registerBrandStyleTool,
  registerReflowTool,
  registerAutoImproveTool,
  registerReviewAndImproveTool,
} from "./tools/design-review.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

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

// API: Render the current design as standalone HTML (screenshot when Playwright available)
app.get("/api/render", async (_req, res) => {
  try {
    const { exportDesign } = await import("./tools/design-tools.js");
    const html = exportDesign("html");
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
  if (process.env.PRISM_AUTOLOAD !== "off" && fs.existsSync(autosavePath())) {
    try {
      const result = loadProject(autosavePath());
      console.error(
        `[${SERVER_NAME}] Restored autosaved project "${result.project_name}" (${result.component_count} components)`
      );
    } catch (error) {
      console.error(`[${SERVER_NAME}] Autosave restore failed:`, error instanceof Error ? error.message : String(error));
      await autoImportProjectPages();
    }
  } else {
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
