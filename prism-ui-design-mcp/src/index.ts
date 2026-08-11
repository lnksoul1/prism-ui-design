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
import { SERVER_NAME, SERVER_VERSION, STYLE_PRESETS } from "./constants.js";
import { stateStore, type AnimationDef } from "./state.js";
import { applyStyleTokenSet } from "./tokens.js";

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

// ===== HTTP + WebSocket Server (for browser client) =====

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

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
  stateStore.setToken(category, key, value, "user");
  res.json({ success: true });
});

// API: Reorder component (from client drag-and-drop)
// NOTE: Must be defined before /api/component/:id to avoid route conflict
app.post("/api/component/reorder", (req, res) => {
  const { from_id, to_id, position } = req.body;
  if (!from_id || !to_id || !position) {
    res.status(400).json({ error: "Missing from_id, to_id, or position" });
    return;
  }
  const success = stateStore.reorderComponent(from_id, to_id, position, "user");
  res.json({ success });
});

// API: Update component (from client inline edit)
app.post("/api/component/:id", (req, res) => {
  const { id } = req.params;
  const { props } = req.body;
  const success = stateStore.updateComponent(id, props, "user");
  res.json({ success });
});

// API: Remove component (from client)
app.delete("/api/component/:id", (req, res) => {
  const { id } = req.params;
  const success = stateStore.removeComponent(id, "user");
  res.json({ success });
});

// API: Undo
app.post("/api/undo", (_req, res) => {
  const success = stateStore.undo();
  res.json({ success, canUndo: stateStore.canUndo(), canRedo: stateStore.canRedo() });
});

// API: Redo
app.post("/api/redo", (_req, res) => {
  const success = stateStore.redo();
  res.json({ success, canUndo: stateStore.canUndo(), canRedo: stateStore.canRedo() });
});

// API: Add page
app.post("/api/page", (req, res) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: "Missing page name" });
    return;
  }
  const page = stateStore.addPage(name, "user");
  res.json({ success: true, page_id: page.id, name: page.name });
});

// API: Switch page
app.post("/api/page/:id/switch", (req, res) => {
  const { id } = req.params;
  const success = stateStore.switchPage(id, "user");
  res.json({ success });
});

// API: Remove page
app.delete("/api/page/:id", (req, res) => {
  const { id } = req.params;
  const success = stateStore.removePage(id, "user");
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
  const success = stateStore.renamePage(id, name, "user");
  res.json({ success });
});

// API: Set theme mode
app.post("/api/theme", (req, res) => {
  const { mode } = req.body;
  if (mode !== "light" && mode !== "dark") {
    res.status(400).json({ error: "Mode must be 'light' or 'dark'" });
    return;
  }
  stateStore.setThemeMode(mode, "user");
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
  if (!["html", "react", "vue", "figma_tokens"].includes(format)) {
    res.status(400).json({ error: "Invalid format. Must be 'html', 'react', 'vue', or 'figma_tokens'" });
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
  stateStore.setPendingPrompt(prompt);
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
    stateStore.clearAll("ai");
    stateStore.setProjectName(project_name, "ai");
    stateStore.setStyle(style, "ai");

    const preset = STYLE_PRESETS[style];
    if (!preset) {
      res.status(400).json({ error: `Unknown style: ${style}` });
      return;
    }

    const tokens = applyStyleTokenSet(stateStore, style, base_color, "ai");

    res.json({
      success: true,
      project_name,
      style,
      base_color: tokens.baseHex,
      font: `${tokens.font.display.name} + ${tokens.font.body.name}`,
      token_count:
        Object.keys(tokens.colors).length +
        Object.keys(tokens.typography).length +
        Object.keys(tokens.spacing).length +
        Object.keys(tokens.radii).length +
        Object.keys(tokens.transitions).length,
    });
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
    const node = stateStore.addComponent(
      type,
      variant,
      props || {},
      parent_id || null,
      "ai"
    );
    res.json({ success: true, id: node.id, type: node.type });
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
  // Send current state on connect
  ws.send(JSON.stringify({
    type: "init",
    state: stateStore.getState(),
  }));

  // Listen for client adjustments
  ws.on("message", (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      handleClientMessage(msg);
    } catch {
      // Ignore malformed messages
    }
  });
});

function handleClientMessage(msg: { type: string; [key: string]: unknown }): void {
  switch (msg.type) {
    case "set_token": {
      const { category, key, value } = msg;
      if (typeof category === "string" && typeof key === "string" && typeof value === "string") {
        stateStore.setToken(category as "colors", key, value, "user");
      }
      break;
    }
    case "update_component": {
      const { id, props } = msg;
      if (typeof id === "string" && props) {
        stateStore.updateComponent(id, props as Record<string, unknown>, "user");
      }
      break;
    }
    case "remove_component": {
      const { id } = msg;
      if (typeof id === "string") {
        stateStore.removeComponent(id, "user");
      }
      break;
    }
    case "undo": {
      stateStore.undo();
      break;
    }
    case "redo": {
      stateStore.redo();
      break;
    }
    case "add_page": {
      const { name } = msg;
      if (typeof name === "string") {
        stateStore.addPage(name, "user");
      }
      break;
    }
    case "switch_page": {
      const { pageId } = msg;
      if (typeof pageId === "string") {
        stateStore.switchPage(pageId, "user");
      }
      break;
    }
    case "remove_page": {
      const { pageId } = msg;
      if (typeof pageId === "string") {
        stateStore.removePage(pageId, "user");
      }
      break;
    }
    case "rename_page": {
      const { pageId, name } = msg;
      if (typeof pageId === "string" && typeof name === "string") {
        stateStore.renamePage(pageId, name, "user");
      }
      break;
    }
    case "reorder_component": {
      const { fromId, toId, position } = msg;
      if (typeof fromId === "string" && typeof toId === "string" && (position === "before" || position === "after")) {
        stateStore.reorderComponent(fromId, toId, position, "user");
      }
      break;
    }
    case "set_theme": {
      const { mode } = msg;
      if (mode === "light" || mode === "dark") {
        stateStore.setThemeMode(mode, "user");
      }
      break;
    }
    case "prompt": {
      const { prompt } = msg;
      if (typeof prompt === "string") {
        stateStore.setPendingPrompt(prompt);
      }
      break;
    }
    case "add_component": {
      const { component_type, variant, props } = msg;
      if (typeof component_type === "string") {
        stateStore.addComponent(
          component_type,
          typeof variant === "string" ? variant : undefined,
          (props as Record<string, unknown>) || {},
          null,
          "user"
        );
      }
      break;
    }
    case "set_animation": {
      const { component_id, entry, hover, duration, delay, curve } = msg;
      if (typeof component_id === "string") {
        const animation: AnimationDef = {};
        if (typeof entry === "string") animation.entry = entry;
        if (typeof hover === "string") animation.hover = hover;
        if (typeof duration === "number") animation.duration = duration;
        if (typeof delay === "number") animation.delay = delay;
        if (typeof curve === "string") animation.curve = curve;
        stateStore.setAnimation(component_id, animation, "user");
      }
      break;
    }
    case "apply_style": {
      const { style } = msg;
      if (typeof style === "string" && STYLE_PRESETS[style]) {
        applyStylePreset(style);
      }
      break;
    }
  }
}

// ===== Helper: Apply style preset and generate all tokens =====

function applyStylePreset(styleName: string): void {
  if (!STYLE_PRESETS[styleName]) return;

  stateStore.setStyle(styleName, "user");
  applyStyleTokenSet(stateStore, styleName, undefined, "user");
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

  // 2. Auto-import existing project pages
  await autoImportProjectPages();

  // 3. Start HTTP + WebSocket server (for browser client)
  httpServer.listen(PORT, () => {
    console.error(`[${SERVER_NAME}] Dashboard: http://localhost:${PORT}`);
    console.error(`[${SERVER_NAME}] WebSocket: ws://localhost:${PORT}/ws`);
    console.error(`[${SERVER_NAME}] Configure your AI agent to use this MCP server via stdio`);
    console.error(`[${SERVER_NAME}] Open the dashboard URL in your browser to monitor in real-time`);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
