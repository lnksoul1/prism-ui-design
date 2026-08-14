import express from "express";
import { stateStore } from "../state.js";
import * as designService from "../service/design-service.js";
import { asyncHandler, HttpError } from "./shared.js";

// Token / theme / conflict routes
export function registerTokensRoutes(): express.Router {
  const router = express.Router();

  // API: Update token (from client slider adjustment)
  router.post("/api/token", asyncHandler(async (req, res) => {
    const { category, key, value } = req.body;
    if (!category || !key || !value) {
      throw new HttpError(400, "Missing category, key, or value");
    }
    try {
      designService.setToken(category, key, value, "user");
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error));
    }
    res.json({ success: true });
  }));

  // API: Set theme mode
  router.post("/api/theme", asyncHandler(async (req, res) => {
    const { mode } = req.body;
    if (mode !== "light" && mode !== "dark") {
      throw new HttpError(400, "Mode must be 'light' or 'dark'");
    }
    designService.setTheme(mode, "user");
    res.json({ success: true, mode });
  }));

  // API: Get token conflicts
  router.get("/api/conflicts", asyncHandler(async (_req, res) => {
    const conflicts = stateStore.getTokenConflicts();
    res.json({ conflicts, count: conflicts.length });
  }));

  return router;
}
