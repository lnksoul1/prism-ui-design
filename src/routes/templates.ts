import express from "express";
import * as designService from "../service/design-service.js";
import { listBehaviorTemplates, listComponentTemplates } from "../template-catalog.js";
import { asyncHandler, HttpError } from "./shared.js";

// 模板快速变更 (product definition v3.2, 支柱⑦ P0)
// GET  /api/templates          — catalog listing (component + behavior templates)
// POST /api/templates/component — apply a component template (add, or replace target_id)
// POST /api/templates/behavior  — apply a behavior template to a component
export function registerTemplatesRoutes(): express.Router {
  const router = express.Router();

  // Catalog: the client library tabs and agents both read from here so the
  // dashboard never drifts from the server-side source of truth.
  // (Note: GET /api/templates is the saved-template listing; this is the
  // quick-change template catalog.)
  router.get("/api/template-catalog", asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      component_templates: listComponentTemplates(),
      behavior_templates: listBehaviorTemplates(),
    });
  }));

  // Apply a component template (组件模板): POST { template_id, target_id? }
  router.post("/api/templates/component", asyncHandler(async (req, res) => {
    const { template_id, target_id } = req.body || {};
    if (typeof template_id !== "string" || !template_id) {
      throw new HttpError(400, "template_id is required");
    }
    const result = designService.applyComponentTemplate(
      template_id,
      typeof target_id === "string" && target_id ? target_id : null,
      "user"
    );
    if (!result.ok) {
      throw new HttpError(400, result.detail || `Unknown template "${template_id}"`);
    }
    res.json({ success: true, ...result });
  }));

  // Apply a behavior template (交互模板): POST { component_id, template_id }
  router.post("/api/templates/behavior", asyncHandler(async (req, res) => {
    const { component_id, template_id } = req.body || {};
    if (typeof component_id !== "string" || !component_id) {
      throw new HttpError(400, "component_id is required");
    }
    if (typeof template_id !== "string" || !template_id) {
      throw new HttpError(400, "template_id is required");
    }
    const result = designService.applyBehaviorTemplate(component_id, template_id, component_id, "user");
    if (!result.ok) {
      throw new HttpError(400, result.detail || `Unknown template "${template_id}"`);
    }
    res.json({ success: true, ...result });
  }));

  return router;
}
