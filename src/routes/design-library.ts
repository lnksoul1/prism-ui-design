import express from "express";
import {
  applyDesignLibraryComponent,
  applyDesignStyle,
  listDesignComponents,
  listDesignStyles,
  listTermTemplates,
} from "../design-library.js";
import { asyncHandler, HttpError } from "./shared.js";

/**
 * DESIGN.md v1.1 §9.1 — unified design-library REST API.
 *
 *   GET  /api/design-library
 *   POST /api/design-library/style
 *   POST /api/design-library/component
 */
export function registerDesignLibraryRoutes(): express.Router {
  const router = express.Router();

  router.get("/api/design-library", asyncHandler(async (_req, res) => {
    const styles = listDesignStyles();
    const components = listDesignComponents();
    const termTemplates = listTermTemplates();
    res.json({
      success: true,
      version: 1,
      source: "https://vibe-hub.org/topics/design",
      count: { styles: styles.length, components: components.length, termTemplates: termTemplates.length },
      styles,
      components,
      termTemplates,
    });
  }));

  router.post("/api/design-library/style", asyncHandler(async (req, res) => {
    const { style_id } = req.body || {};
    if (typeof style_id !== "string" || !style_id) {
      throw new HttpError(400, "style_id is required");
    }
    const result = applyDesignStyle(style_id, "user");
    if (!result.ok) {
      throw new HttpError(404, result.detail || `Unknown design style "${style_id}"`);
    }
    res.json({ success: true, ...result });
  }));

  router.post("/api/design-library/component", asyncHandler(async (req, res) => {
    const { component_id, target_id } = req.body || {};
    if (typeof component_id !== "string" || !component_id) {
      throw new HttpError(400, "component_id is required");
    }
    const result = applyDesignLibraryComponent(
      component_id,
      typeof target_id === "string" && target_id ? target_id : null,
      "user"
    );
    if (!result.ok) {
      throw new HttpError(404, result.detail || `Unknown design-library component "${component_id}"`);
    }
    res.json({ success: true, ...result });
  }));

  return router;
}
