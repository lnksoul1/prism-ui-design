#!/usr/bin/env node
/**
 * Prism MCP server (route B).
 *
 * A stdio-only Model Context Protocol server that lets an AI agent generate
 * design tokens, assemble a page from 38 component types, review it for
 * accessibility and design quality, and export it as code or tokens.
 *
 * Architecture:
 *   ┌──────────────┐    stdio (MCP)    ┌───────────────────────────────┐
 *   │  AI agent /  │ ◄───────────────► │  McpServer                    │
 *   │  MCP client  │                   │   ├─ 42 tools                 │
 *   └──────────────┘                   │   ├─ 4 resources              │
 *                                      │   ├─ 3 prompts                │
 *                                      │   └─ DesignStateStore (state) │
 *                                      └───────────────────────────────┘
 *
 * There is no dashboard, no HTTP/WebSocket server and no desktop shell: the
 * session lives in the server's state store, is visible to the agent through
 * `design_get_state`, persists to disk through `design_save_project`, and is
 * replayed by the client through `design_export`.
 *
 * All state mutations go through `DesignStateStore` / `design-service`, so tool
 * behaviour is identical across every call path.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "fs";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { stateStore } from "./state.js";
import { autosavePath, enableAutoSave, loadProject } from "./project-store.js";

// ===== Generation tools (stateless token/asset generators) =====
import { registerColorPaletteTool } from "./tools/color-palette.js";
import { registerTypographyTool } from "./tools/typography.js";
import { registerSpacingTool } from "./tools/spacing.js";
import { registerShadowTool } from "./tools/shadows.js";
import { registerBorderRadiusTool } from "./tools/border-radius.js";
import { registerContrastTool } from "./tools/contrast.js";
import { registerGradientTool } from "./tools/gradient.js";
import { registerBreakpointsTool } from "./tools/breakpoints.js";
import { registerDesignTokensTool } from "./tools/design-tokens.js";

// ===== Session tools (build a design in the state store) =====
import {
  registerDesignInitTool,
  registerDesignAddComponentTool,
  registerDesignUpdateComponentTool,
  registerDesignRenameTool,
  registerDesignRemoveComponentTool,
  registerDesignReorderComponentTool,
  registerDesignAlignTool,
  registerDesignZOrderTool,
  registerDesignSetTokenTool,
  registerDesignSetThemeTool,
  registerDesignApplyTemplateTool,
  registerDesignAddPageTool,
  registerDesignSwitchPageTool,
  registerDesignRemovePageTool,
  registerDesignGetStateTool,
  registerDesignGetConflictsTool,
  registerDesignExportTool,
  registerDesignUndoTool,
  registerDesignRedoTool,
} from "./tools/design-tools.js";import { registerProjectTools } from "./tools/project-tools.js";

// ===== Review & delivery tools =====
import { registerAuditTool } from "./tools/design-audit.js";
import { registerSuggestTool } from "./tools/design-review-suggest.js";
import { registerRenderTool } from "./tools/design-render.js";
import { registerPreviewSyncTool } from "./tools/design-preview.js";
import { registerTokenInteropTools } from "./tools/token-interop.js";
import { registerWebpageImportTool } from "./tools/webpage-import.js";
import { registerDesignMdTool } from "./tools/design-md.js";

// ===== Meta =====
import { registerCapabilitiesTool } from "./tools/capabilities.js";
import { registerSemanticStyleTool } from "./tools/semantic-tools.js";

// Agent context exposed without a tool call.
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

// ===== Server =====

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

// Generation (10)
registerColorPaletteTool(server);
registerTypographyTool(server);
registerSpacingTool(server);
registerShadowTool(server);
registerBorderRadiusTool(server);
registerContrastTool(server);
registerGradientTool(server);
registerBreakpointsTool(server);
registerDesignTokensTool(server);

// Session (18 + 3 persistence)
registerDesignInitTool(server);
registerDesignAddComponentTool(server);
registerDesignUpdateComponentTool(server);
registerDesignRenameTool(server);
registerDesignRemoveComponentTool(server);
registerDesignReorderComponentTool(server);
registerDesignAlignTool(server);
registerDesignZOrderTool(server);
registerDesignSetTokenTool(server);
registerDesignSetThemeTool(server);
registerDesignApplyTemplateTool(server);
registerDesignAddPageTool(server);
registerDesignSwitchPageTool(server);
registerDesignRemovePageTool(server);
registerDesignGetStateTool(server);
registerDesignGetConflictsTool(server);
registerDesignExportTool(server);
registerDesignUndoTool(server);
registerDesignRedoTool(server);
registerProjectTools(server);

// Review & delivery (7)
registerAuditTool(server);
registerSuggestTool(server);
registerRenderTool(server);
registerPreviewSyncTool(server);
registerTokenInteropTools(server);
registerWebpageImportTool(server);
registerDesignMdTool(server);

// Meta (2)
registerCapabilitiesTool(server);
registerSemanticStyleTool(server);

// Agent context
registerResources(server);
registerPrompts(server);

// ===== Start =====

/**
 * Replay the autosave checkpoint when one exists, unless PRISM_AUTOLOAD=off.
 * Anything written to stdout would corrupt the MCP frame stream, so all
 * diagnostics go to stderr.
 */
function restoreAutosave(): void {
  if (process.env.PRISM_AUTOLOAD === "off") {
    console.error(`[${SERVER_NAME}] autoload disabled (PRISM_AUTOLOAD=off)`);
    return;
  }
  const file = autosavePath();
  if (!fs.existsSync(file)) return;
  try {
    const result = loadProject(file);
    console.error(
      `[${SERVER_NAME}] restored autosave "${result.project_name}" (${result.component_count} components)`
    );
  } catch (error) {
    console.error(
      `[${SERVER_NAME}] autosave restore failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function main(): Promise<void> {
  restoreAutosave();

  // Rolling autosave keeps a multi-turn agent session recoverable.
  if (process.env.PRISM_AUTOSAVE !== "off") {
    enableAutoSave();
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[${SERVER_NAME} v${SERVER_VERSION}] MCP stdio transport ready · ` +
      `${stateStore.getState().pages.length} page(s) in the session`
  );
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
