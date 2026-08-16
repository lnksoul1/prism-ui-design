import express from "express";
import { stateStore } from "../state.js";
import { autoLayoutPages, autoLayoutTopLevel, ensureTopLevelLayouts } from "../layout-engine.js";
import { asyncHandler, HttpError } from "./shared.js";

/**
 * Smart-canvas layout routes (DESIGN.md v1.1 §5.1).
 * The server owns the streaming-column algorithm so MCP/REST/WS/LLM share one
 * reproducible layout path.
 */
export function registerLayoutRoutes(): express.Router {
  const router = express.Router();

  // Re-layout all top-level components on the current page from the top.
  router.post("/api/layout/auto", asyncHandler(async (_req, res) => {
    const state = stateStore.getState();
    const page = state.pages.find((p) => p.id === state.currentPageId) || state.pages[0];
    if (!page) {
      throw new HttpError(400, "No current page");
    }
    autoLayoutTopLevel(page.components);
    stateStore.replacePageComponents(page.id, page.components, "user");
    res.json({ success: true, page_id: page.id, component_count: page.components.length });
  }));

  // Fill missing layouts for every page (used after import and by MCP).
  router.post("/api/layout/ensure", asyncHandler(async (_req, res) => {
    const state = stateStore.getState();
    autoLayoutPages(state.pages, state.activePlatform);
    for (const page of state.pages) {
      stateStore.replacePageComponents(page.id, page.components, "user");
    }
    res.json({ success: true, pages: state.pages.length });
  }));

  return router;
}
