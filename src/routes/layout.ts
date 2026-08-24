import express from "express";
import { stateStore } from "../state.js";
import { autoLayoutPages, autoLayoutTopLevel } from "../layout-engine.js";
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

  // M2 智能布局: 网格吸附
  router.post("/api/layout/snap", asyncHandler(async (req, res) => {
    const { ids, grid } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((v) => typeof v !== "string")) {
      throw new HttpError(400, "ids must be a non-empty string array");
    }
    const g = typeof grid === "number" && Number.isFinite(grid) && grid > 0 && grid <= 128 ? grid : 8;
    const changed = stateStore.snapComponentsToGrid(ids, g, "user");
    res.json({ success: true, changed, grid: g });
  }));

  // M2 智能布局: 确定性重排
  router.post("/api/layout/smart", asyncHandler(async (req, res) => {
    const { ids, grid, gap, container } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((v) => typeof v !== "string")) {
      throw new HttpError(400, "ids must be a non-empty string array");
    }
    const opts = {
      grid: typeof grid === "number" && grid > 0 && grid <= 128 ? grid : undefined,
      gap: typeof gap === "number" && gap >= 0 && gap <= 200 ? gap : undefined,
      container:
        container && typeof container === "object" &&
        typeof container.x === "number" && typeof container.y === "number" &&
        typeof container.width === "number" && typeof container.height === "number"
          ? container
          : null,
    };
    const ok = stateStore.applySmartLayout(ids, opts, "user");
    if (!ok) throw new HttpError(404, "No valid components found");
    res.json({ success: true, count: ids.length, ...opts });
  }));

  return router;
}
