/**
 * LLM channel REST routes (product definition v2).
 *
 *   GET  /api/llm/config    — current config (never the raw key)
 *   PUT  /api/llm/config    — save provider/key/model (key kept if omitted)
 *   POST /api/llm/test      — one-shot connectivity check
 *   POST /api/llm/generate  — synchronous page generation from a prompt
 */

import express from "express";
import {
  PROVIDER_DEFAULTS,
  isProvider,
  loadLlmConfig,
  maskKey,
  saveLlmConfig,
  type LlmConfig,
} from "./config.js";
import { chatCompletion } from "./providers.js";
import { generatePageFromPrompt } from "./agent.js";

export function registerLlmRoutes(app: express.Express): void {
  // Current LLM config (masked key only)
  app.get("/api/llm/config", (_req, res) => {
    const cfg = loadLlmConfig();
    res.json({
      success: true,
      configured: !!cfg,
      provider: cfg?.provider || "openai",
      model: cfg?.model || "",
      base_url: cfg?.baseUrl || "",
      has_key: !!cfg?.apiKey,
      masked_key: cfg ? maskKey(cfg.apiKey) : "",
    });
  });

  // Save LLM config; an empty apiKey keeps the previously stored key
  app.put("/api/llm/config", (req, res) => {
    const body = (req.body || {}) as Partial<LlmConfig>;
    const existing = loadLlmConfig();
    const provider = isProvider(body.provider || "")
      ? (body.provider as LlmConfig["provider"])
      : existing?.provider || "openai";
    const apiKey =
      typeof body.apiKey === "string" && body.apiKey.trim()
        ? body.apiKey.trim()
        : existing?.apiKey || "";
    if (!apiKey) {
      res.status(400).json({ error: "Missing apiKey" });
      return;
    }
    const cfg: LlmConfig = {
      provider,
      apiKey,
      model:
        typeof body.model === "string" && body.model.trim()
          ? body.model.trim()
          : PROVIDER_DEFAULTS[provider].model,
      baseUrl:
        typeof body.baseUrl === "string" && body.baseUrl.trim()
          ? body.baseUrl.trim()
          : PROVIDER_DEFAULTS[provider].baseUrl,
    };
    saveLlmConfig(cfg);
    res.json({
      success: true,
      configured: true,
      provider: cfg.provider,
      model: cfg.model,
      masked_key: maskKey(cfg.apiKey),
    });
  });

  // Connectivity check (used by the AI settings dialog)
  app.post("/api/llm/test", async (_req, res) => {
    const cfg = loadLlmConfig();
    if (!cfg) {
      res.status(400).json({ error: "未配置 LLM（请先在 AI 设置中填写 API Key）" });
      return;
    }
    try {
      const reply = await chatCompletion([{ role: "user", content: "请只回复两个字：在线" }], cfg);
      res.json({ success: true, reply: reply.slice(0, 200) });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Synchronous generation (used by the AI settings dialog preview + tests)
  app.post("/api/llm/generate", async (req, res) => {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "Missing prompt string" });
      return;
    }
    const cfg = loadLlmConfig();
    if (!cfg) {
      res.status(400).json({ error: "未配置 LLM（请先在 AI 设置中填写 API Key）" });
      return;
    }
    const result = await generatePageFromPrompt(prompt, cfg);
    if (!result.ok) {
      res.status(502).json({ success: false, error: result.error || "生成失败" });
      return;
    }
    res.json({ success: true, ...result });
  });
}
