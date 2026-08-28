// M3 ActionFlow: JSON 配置式交互流程 CRUD
import { Router } from "express";
import { stateStore } from "../state.js";
import { asyncHandler, HttpError } from "./shared.js";
import { type ActionFlow } from "../action-flow.js";

export function registerActionFlowRoutes(): Router {
  const router = Router();

  router.get("/api/action-flows", asyncHandler(async (req, res) => {
    const componentId =
      typeof req.query.component_id === "string" ? req.query.component_id : undefined;
    res.json({ success: true, flows: stateStore.getActionFlows(componentId) });
  }));

  router.post("/api/action-flows", asyncHandler(async (req, res) => {
    const { name, componentId, steps, enabled } = req.body || {};
    if (typeof componentId !== "string" || !componentId) {
      throw new HttpError(400, "componentId is required");
    }
    if (!Array.isArray(steps)) throw new HttpError(400, "steps must be an array");
    const flow: ActionFlow = {
      id: `flow_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: typeof name === "string" && name.trim() ? name : "未命名流程",
      trigger: "click",
      componentId,
      steps: steps.map((s: { id?: unknown; action?: unknown; params?: unknown }, i: number) => ({
        id: typeof s?.id === "string" && s.id ? s.id : `step_${Date.now()}_${i}`,
        action: String(s?.action ?? ""),
        params: (s?.params && typeof s.params === "object" ? s.params : {}) as Record<string, unknown>,
      })) as ActionFlow["steps"],
      enabled: typeof enabled === "boolean" ? enabled : true,
    };
    try {
      const created = stateStore.addActionFlow(flow, "user");
      res.json({ success: true, flow: created });
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error));
    }
  }));

  router.post("/api/action-flows/:id", asyncHandler(async (req, res) => {
    const { name, steps, enabled } = req.body || {};
    const patch: { name?: string; steps?: ActionFlow["steps"]; enabled?: boolean } = {};
    if (typeof name === "string" && name.trim()) patch.name = name;
    if (typeof enabled === "boolean") patch.enabled = enabled;
    if (Array.isArray(steps)) {
      patch.steps = steps.map((s: { id?: unknown; action?: unknown; params?: unknown }, i: number) => ({
        id: typeof s?.id === "string" && s.id ? s.id : `step_${Date.now()}_${i}`,
        action: String(s?.action ?? ""),
        params: (s?.params && typeof s.params === "object" ? s.params : {}) as Record<string, unknown>,
      })) as ActionFlow["steps"];
    }
    try {
      const updated = stateStore.updateActionFlow(req.params.id, patch, "user");
      if (!updated) throw new HttpError(404, `Flow ${req.params.id} not found`);
      res.json({ success: true, flow: updated });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, error instanceof Error ? error.message : String(error));
    }
  }));

  router.delete("/api/action-flows/:id", asyncHandler(async (req, res) => {
    const ok = stateStore.removeActionFlow(req.params.id, "user");
    if (!ok) throw new HttpError(404, `Flow ${req.params.id} not found`);
    res.json({ success: true, id: req.params.id });
  }));

  return router;
}
