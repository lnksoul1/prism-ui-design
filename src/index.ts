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
import {
  registerAllDesignTools,
  exportDesign,
  applyPageTemplate,
} from "./tools/design-tools.js";

// Project import module
import { scanProject } from "./import-project.js";

// Project persistence (save / load / autosave)
import { registerProjectTools } from "./tools/project-tools.js";
import {
  autosavePath,
  enableAutoSave,
  loadProject,
} from "./project-store.js";
import { listTemplates, loadTemplate, saveTemplate } from "./templates.js";
import { createVersion, diffVersions, listVersions, restoreVersion } from "./versions.js";

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
import { registerExplainTool, explainDesign } from "./tools/explain-tools.js";
import { registerCapabilitiesTool } from "./tools/capabilities.js";
import { registerWebpageImportTool } from "./tools/webpage-import.js";
import { registerSpecTools } from "./tools/spec-tools.js";
import { registerPlatformTools } from "./tools/platform-tools.js";
import { registerCollabTools } from "./tools/collab-tools.js";
import { registerGeneratePageTool } from "./tools/generate-tools.js";
import { registerCanvasTools } from "./tools/canvas-tools.js";
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

// Route modules (P2.2: routes split into dedicated files)
import { registerCanvasRoutes } from "./routes/canvas.js";
import { registerTokensRoutes } from "./routes/tokens.js";
import { registerComponentsRoutes } from "./routes/components.js";
import { registerProjectsRoutes } from "./routes/projects.js";
import { registerTemplatesRoutes } from "./routes/templates.js";
import { errorHandler } from "./routes/shared.js";

// Built-in LLM channel (product definition v2: BYO API key, no external agent)
import { registerLlmRoutes } from "./llm/routes.js";
import { hasLlm, loadLlmConfig } from "./llm/config.js";
import { generatePageFromPrompt } from "./llm/agent.js";

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
registerExplainTool(server);

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

// Mount extracted route modules (P2.2)
app.use(registerCanvasRoutes());
app.use(registerTokensRoutes());
app.use(registerComponentsRoutes());
app.use(registerProjectsRoutes());
app.use(registerTemplatesRoutes());

// Built-in LLM channel routes (AI settings + generation)
registerLlmRoutes(app);

// API: Get current state
app.get("/api/state", (_req, res) => {
  res.json(stateStore.getState());
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
  const result = designService.submitPrompt(prompt);
  if (!result.executed) {
    if (hasLlm()) {
      // The built-in LLM channel takes over asynchronously.
      broadcastPromptQueued(prompt);
      runLlmPromptAsync(prompt);
      res.json({
        success: true,
        executed: false,
        action: result.action || null,
        summary: result.summary,
        suggestions: result.suggestions || [],
        llm: "generating",
      });
      return;
    }
    // Handed to the external agent queue; tell dashboards it was queued.
    broadcastPromptQueued(prompt);
  }
  res.json({
    success: true,
    executed: result.executed,
    action: result.action || null,
    summary: result.summary,
    suggestions: result.suggestions || [],
  });
});

/**
 * Run the built-in LLM channel on a prompt the local engine could not match.
 * Success broadcasts through the normal `prompt_executed` pipeline; failures
 * broadcast a dedicated `llm_error` so the dashboard can show the reason.
 */
async function runLlmPromptAsync(prompt: string): Promise<void> {
  const cfg = loadLlmConfig();
  if (!cfg) return;
  const result = await generatePageFromPrompt(prompt, cfg);
  if (result.ok) {
    stateStore.clearPendingPrompt();
    stateStore.recordPromptExecuted(result.summary, "llm_generate");
  } else {
    broadcastLlmError(result.error || "AI 生成失败");
  }
}

function broadcastLlmError(summary: string): void {
  const message = JSON.stringify({ type: "llm_error", summary });
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

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

// API: Explain the current design in plain language (read-only)
app.get("/api/explain", (req, res) => {
  const lang = req.query.lang === "en" ? "en" : "zh";
  res.json({ success: true, ...explainDesign(lang) });
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

// Unified error-handling middleware (must be registered after all routes)
app.use(errorHandler);

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
      // Prompts run through the built-in executor first; the client gets an
      // immediate acknowledgment with the outcome (executed / queued +
      // suggestions) instead of a silent queue. When the local engine cannot
      // match and an LLM channel is configured, the built-in AI takes over.
      if (parsed.data.type === "prompt") {
        const result = designService.submitPrompt(parsed.data.prompt);
        if (!result.executed && hasLlm()) {
          broadcastPromptQueued(parsed.data.prompt);
          ws.send(
            JSON.stringify({
              type: "prompt_result",
              executed: false,
              action: null,
              summary: "",
              suggestions: result.suggestions || [],
              llm: "generating",
            })
          );
          runLlmPromptAsync(parsed.data.prompt);
          return;
        }
        if (!result.executed) broadcastPromptQueued(parsed.data.prompt);
        ws.send(
          JSON.stringify({
            type: "prompt_result",
            executed: result.executed,
            action: result.action || null,
            summary: result.summary,
            suggestions: result.suggestions || [],
          })
        );
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

/**
 * Phase 2.4 (增量更新): extract the component ids a change touched, so the
 * client can re-render only those components instead of the whole canvas.
 */
function affectedComponentIds(change: unknown): string[] {
  const c = change as {
    type?: string;
    id?: string;
    componentId?: string;
    newId?: string;
    fromId?: string;
    toId?: string;
    component?: { id?: string };
  };
  if (!c) return [];
  switch (c.type) {
    case "addComponent":
      return c.component && c.component.id ? [c.component.id] : [];
    case "updateComponent":
    case "removeComponent":
    case "setBehavior":
    case "setAnimation":
    case "setElementMeta":
      return c.id || c.componentId ? [c.id || c.componentId || ""] : [];
    case "duplicateComponent":
      return [c.id, c.newId].filter(Boolean) as string[];
    case "reorderComponent":
      return [c.fromId, c.toId].filter(Boolean) as string[];
    default:
      return [];
  }
}

stateStore.on("change", (change: unknown) => {
  const c = change as {
    type?: string;
    category?: string;
    key?: string;
    value?: string;
    tokens?: Record<string, string>;
  };
  let patch: Record<string, unknown> | undefined;
  if (c && c.type === "token") {
    patch = { category: c.category, key: c.key, value: c.value };
  } else if (c && c.type === "tokenBatch") {
    patch = { category: c.category, tokens: c.tokens };
  }
  const message = JSON.stringify({
    type: "change",
    change,
    patch,
    affected_ids: affectedComponentIds(change),
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
