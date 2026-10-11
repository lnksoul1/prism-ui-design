/**
 * LLM channel REST routes (product definition v2).
 *
 *   GET  /api/llm/config    — current config (never the raw key)
 *   PUT  /api/llm/config    — save provider/key/model (key kept if omitted)
 *   POST /api/llm/test      — one-shot connectivity check
 *   POST /api/llm/generate  — synchronous page generation from a prompt
 *   POST /api/llm/stream    — SSE streaming generation (delta/done/error events)
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
import {
  applySpec,
  countNodes,
  generatePageFromPrompt,
  streamCandidateBatch,
  streamPageGeneration,
} from "./agent.js";
import { takeCandidateSpec } from "./candidates.js";
import {
  applyEditOperations,
  collectPageComponents,
  requestPageEdit,
  takePendingEdit,
} from "./edit.js";
import { stateStore } from "../state.js";

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

  // M2 NL2UI 流式: SSE 逐 token 推送。candidates > 1 时进入多候选模式
  // （candidate_start/delta{index}/candidate_done/done{batch_id,candidates}），
  // 候选不落地；客户端选中后 POST /api/llm/apply 消费。
  app.post("/api/llm/stream", async (req, res) => {
    const { prompt, candidates } = (req.body || {}) as { prompt?: unknown; candidates?: unknown };
    const cfg = loadLlmConfig();
    if (!cfg) {
      res.status(400).json({ error: "未配置 LLM（请先在 AI 设置中填写 API Key）" });
      return;
    }
    if (typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({ error: "Missing prompt" });
      return;
    }
    const wantCandidates =
      typeof candidates === "number" && Number.isFinite(candidates) && candidates > 1
        ? Math.min(Math.floor(candidates), 3)
        : 1;
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      if (wantCandidates > 1) {
        const batch = await streamCandidateBatch(prompt, cfg, wantCandidates, {
          onStart: (index, total, label, angle) => send("candidate_start", { index, total, label, angle }),
          onDelta: (index, text) => send("delta", { index, text }),
          onCandidateDone: (r) => send("candidate_done", r),
        });
        const okCount = batch.candidates.filter((c) => c.ok).length;
        send("done", {
          ok: okCount > 0,
          batch_id: batch.batch_id,
          candidates: batch.candidates,
          component_count: 0,
          page_count: 0,
          page_id: null,
          summary:
            okCount > 0
              ? `已生成 ${okCount} 个候选，请选择一个应用（其余丢弃）`
              : "候选全部生成失败",
        });
      } else {
        const result = await streamPageGeneration(prompt, cfg, (text) => send("delta", { text }));
        send("done", result);
      }
    } catch (err) {
      send("error", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
  });

  // R1 多候选: 应用批次中的一个候选（走与直接生成完全相同的 applySpec 落位
  // 管线），成功后整批消费；其余候选随之丢弃。
  app.post("/api/llm/apply", async (req, res) => {
    const { batch_id, index } = (req.body || {}) as { batch_id?: unknown; index?: unknown };
    if (typeof batch_id !== "string" || !batch_id || typeof index !== "number") {
      res.status(400).json({ error: "Missing batch_id or index" });
      return;
    }
    const spec = takeCandidateSpec(batch_id, index);
    if (spec === "missing") {
      res.status(404).json({ error: "候选批次不存在或已过期" });
      return;
    }
    if (spec === "invalid") {
      res.status(400).json({ error: "该候选不存在或生成失败" });
      return;
    }
    const { nodes, targetPageId, report } = applySpec(spec);
    const count = countNodes(nodes);
    res.json({
      success: true,
      ok: true,
      component_count: count,
      page_count: stateStore.getState().pages.length,
      page_id: targetPageId,
      layout_report: report ?? undefined,
      summary: `已应用候选 ${index + 1}：AI 已生成页面（${count} 个组件，布局已自动对齐）`,
    });
  });

  // R2 对话式精准修改: 选中组件 → 自然语言局部修改建议（不落地，返回 diff
  // 预览 + edit_id）。客户端确认后 POST /api/llm/edit/apply 经 runBatch 单
  // undo 步应用。
  app.post("/api/llm/edit", async (req, res) => {
    const { prompt, component_ids, session_id } = (req.body || {}) as {
      prompt?: unknown;
      component_ids?: unknown;
      session_id?: unknown;
    };
    const cfg = loadLlmConfig();
    if (!cfg) {
      res.status(400).json({ error: "未配置 LLM（请先在 AI 设置中填写 API Key）" });
      return;
    }
    if (typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({ error: "Missing prompt" });
      return;
    }
    const ids = Array.isArray(component_ids)
      ? component_ids.filter((x): x is string => typeof x === "string" && !!x)
      : [];
    if (ids.length === 0) {
      res.status(400).json({ error: "Missing component_ids" });
      return;
    }
    const st = stateStore.getState();
    const page = st.pages.find((p) => p.id === st.currentPageId);
    if (collectPageComponents(page?.components || [], ids).length === 0) {
      res.status(400).json({ error: "选中的组件不存在或已被删除" });
      return;
    }
    try {
      const preview = await requestPageEdit(
        prompt,
        ids,
        cfg,
        typeof session_id === "string" ? session_id : null
      );
      res.json({ success: true, ...preview });
    } catch (err) {
      res.status(502).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // R2: 应用一处已确认的修改建议（一次性消费，单 undo 步）。
  app.post("/api/llm/edit/apply", (req, res) => {
    const { edit_id } = (req.body || {}) as { edit_id?: unknown };
    if (typeof edit_id !== "string" || !edit_id) {
      res.status(400).json({ error: "Missing edit_id" });
      return;
    }
    const pending = takePendingEdit(edit_id);
    if (!pending) {
      res.status(404).json({ error: "修改建议不存在或已过期" });
      return;
    }
    const result = applyEditOperations(pending);
    res.json({
      success: true,
      applied: result.applied,
      skipped: result.skipped,
      added: result.added,
      summary: `已应用 ${result.applied} 处修改${
        result.skipped > 0 ? `（${result.skipped} 处因组件已不存在跳过）` : ""
      }`,
    });
  });
}
