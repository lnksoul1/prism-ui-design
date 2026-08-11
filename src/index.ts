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
  const success = (stateStore as any).reorderComponent(from_id, to_id, position, "user");
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
  const success = (stateStore as any).undo();
  res.json({ success, canUndo: (stateStore as any).canUndo(), canRedo: (stateStore as any).canRedo() });
});

// API: Redo
app.post("/api/redo", (_req, res) => {
  const success = (stateStore as any).redo();
  res.json({ success, canUndo: (stateStore as any).canUndo(), canRedo: (stateStore as any).canRedo() });
});

// API: Add page
app.post("/api/page", (req, res) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: "Missing page name" });
    return;
  }
  const page = (stateStore as any).addPage(name, "user");
  res.json({ success: true, page_id: page.id, name: page.name });
});

// API: Switch page
app.post("/api/page/:id/switch", (req, res) => {
  const { id } = req.params;
  const success = (stateStore as any).switchPage(id, "user");
  res.json({ success });
});

// API: Remove page
app.delete("/api/page/:id", (req, res) => {
  const { id } = req.params;
  const success = (stateStore as any).removePage(id, "user");
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
  const success = (stateStore as any).renamePage(id, name, "user");
  res.json({ success });
});

// API: Set theme mode
app.post("/api/theme", (req, res) => {
  const { mode } = req.body;
  if (mode !== "light" && mode !== "dark") {
    res.status(400).json({ error: "Mode must be 'light' or 'dark'" });
    return;
  }
  (stateStore as any).setThemeMode(mode, "user");
  res.json({ success: true, mode });
});

// API: Get token conflicts
app.get("/api/conflicts", (_req, res) => {
  const conflicts = (stateStore as any).getTokenConflicts();
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
  (stateStore as any).setPendingPrompt?.(prompt);
  res.json({ success: true });
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
      (stateStore as any).undo();
      break;
    }
    case "redo": {
      (stateStore as any).redo();
      break;
    }
    case "add_page": {
      const { name } = msg;
      if (typeof name === "string") {
        (stateStore as any).addPage(name, "user");
      }
      break;
    }
    case "switch_page": {
      const { pageId } = msg;
      if (typeof pageId === "string") {
        (stateStore as any).switchPage(pageId, "user");
      }
      break;
    }
    case "remove_page": {
      const { pageId } = msg;
      if (typeof pageId === "string") {
        (stateStore as any).removePage(pageId, "user");
      }
      break;
    }
    case "rename_page": {
      const { pageId, name } = msg;
      if (typeof pageId === "string" && typeof name === "string") {
        (stateStore as any).renamePage(pageId, name, "user");
      }
      break;
    }
    case "reorder_component": {
      const { fromId, toId, position } = msg;
      if (typeof fromId === "string" && typeof toId === "string" && (position === "before" || position === "after")) {
        (stateStore as any).reorderComponent(fromId, toId, position, "user");
      }
      break;
    }
    case "set_theme": {
      const { mode } = msg;
      if (mode === "light" || mode === "dark") {
        (stateStore as any).setThemeMode(mode, "user");
      }
      break;
    }
    case "prompt": {
      const { prompt } = msg;
      if (typeof prompt === "string") {
        (stateStore as any).setPendingPrompt?.(prompt);
      }
      break;
    }
  }
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

async function main(): Promise<void> {
  // 1. Start MCP server on stdio (for AI agent)
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME} v${SERVER_VERSION}] MCP stdio transport ready for AI agent`);

  // 2. Start HTTP + WebSocket server (for browser client)
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
