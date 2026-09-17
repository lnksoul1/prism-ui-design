// 设计 → 提示词简报导出: POST /api/prompt-brief（body: { stack?, page_ids? } 可选）
import { Router } from "express";
import { stateStore } from "../state.js";
import { compilePromptBrief } from "../prompt-brief.js";
import { asyncHandler, HttpError } from "./shared.js";

export function registerPromptBriefRoutes(): Router {
  const router = Router();

  router.post("/api/prompt-brief", asyncHandler(async (req, res) => {
    const { stack, page_ids } = req.body || {};
    if (stack !== undefined && stack !== "react" && stack !== "html") {
      throw new HttpError(400, 'stack must be "react" or "html"');
    }
    if (page_ids !== undefined && (!Array.isArray(page_ids) || page_ids.some((p) => typeof p !== "string"))) {
      throw new HttpError(400, "page_ids must be an array of page ids");
    }
    const brief = compilePromptBrief(stateStore.getState(), {
      ...(stack ? { stack } : {}),
      ...(page_ids ? { pages: page_ids } : {}),
    });
    res.json({ success: true, brief });
  }));

  return router;
}
