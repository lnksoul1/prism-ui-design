import { test, describe, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { streamChatCompletion } from "../src/llm/providers.js";
import { streamPageGeneration, streamCandidateBatch } from "../src/llm/agent.js";
import { takeCandidateSpec, clearCandidateBatchesForTests } from "../src/llm/candidates.js";
import { stateStore } from "../src/state.js";
import type { LlmConfig } from "../src/llm/config.js";

const openaiCfg = {
  provider: "openai",
  apiKey: "sk-test",
  model: "gpt-4o-mini",
  baseUrl: "http://localhost:9/v1",
} as LlmConfig;

/** 构造 OpenAI SSE 流式响应体 */
function sseBody(deltas: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = deltas.map(
    (d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`
  );
  chunks.push("data: [DONE]\n\n");
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("streamChatCompletion", () => {
  test("openai streaming yields deltas in order and returns full text", async () => {
    globalThis.fetch = (async () =>
      new Response(sseBody(["Hello", " ", "World"]), { status: 200 })) as typeof fetch;
    const received: string[] = [];
    const full = await streamChatCompletion(
      [{ role: "user", content: "hi" }],
      openaiCfg,
      (t) => received.push(t)
    );
    assert.deepEqual(received, ["Hello", " ", "World"]);
    assert.equal(full, "Hello World");
  });

  test("chunks split across network reads are reassembled", async () => {
    // 一个 delta 拆成两次网络读取，验证缓冲区拼接
    const encoder = new TextEncoder();
    const half1 = encoder.encode('data: {"choices":[{"delta":{"content":"AB"}}');
    // half1 以 "}}" 结尾（关闭 delta/choice），half2 需 "]}..." 关闭数组与顶层对象，
    // 拼接后才是合法 JSON —— 验证跨读拆分的缓冲区重组
    const half2 = encoder.encode(']}\n\ndata: [DONE]\n\n');
    let read = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (read === 0) { controller.enqueue(half1); read = 1; }
        else if (read === 1) { controller.enqueue(half2); read = 2; }
        else { controller.close(); }
      },
    });
    globalThis.fetch = (async () => new Response(stream, { status: 200 })) as typeof fetch;
    const received: string[] = [];
    const full = await streamChatCompletion([{ role: "user", content: "x" }], openaiCfg, (t) => received.push(t));
    assert.deepEqual(received, ["AB"]);
    assert.equal(full, "AB");
  });

  test("non-openai providers fall back to non-streaming single delta", async () => {
    // anthropic 走 chatCompletion 非流式路径：mock 其响应格式
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "整段" }] }), { status: 200 })) as typeof fetch;
    const received: string[] = [];
    const full = await streamChatCompletion(
      [{ role: "user", content: "x" }],
      { provider: "anthropic", apiKey: "k", model: "claude-3", baseUrl: "" } as LlmConfig,
      (t) => received.push(t)
    );
    assert.deepEqual(received, ["整段"]);
    assert.equal(full, "整段");
  });

  test("empty stream throws LlmError", async () => {
    const empty = new ReadableStream<Uint8Array>({
      start(controller) { controller.close(); },
    });
    globalThis.fetch = (async () => new Response(empty, { status: 200 })) as typeof fetch;
    await assert.rejects(
      () => streamChatCompletion([{ role: "user", content: "x" }], openaiCfg, () => {}),
      /为空/
    );
  });
});

describe("streamPageGeneration", () => {
  test("streams deltas then applies the parsed spec", async () => {
    stateStore.resetForTests();
    const spec = {
      page: "current",
      template: null,
      style: null,
      base_color: null,
      components: [{ type: "hero", props: { title: "流式标题" } }],
    };
    globalThis.fetch = (async () =>
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(spec) } }] })}\n\ndata: [DONE]\n\n`,
        { status: 200 }
      )) as typeof fetch;
    const deltas: string[] = [];
    const result = await streamPageGeneration("做一个 hero", openaiCfg, (t) => deltas.push(t));
    assert.equal(result.ok, true);
    assert.equal(result.component_count, 1);
    assert.ok(deltas.length >= 1);
    // R9: done 事件携带扁平体检字段（客户端体检卡直接消费）
    assert.equal(result.layout_issues, 0);
    assert.equal(result.layout_overlaps, 0);
    assert.equal(result.layout_out_of_bounds, 0);
    const applied = JSON.stringify(stateStore.getState().components);
    assert.ok(applied.includes("流式标题"));
  });

  test("unparseable output reports error without applying", async () => {
    stateStore.resetForTests();
    globalThis.fetch = (async () =>
      new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "不是JSON" } }] })}\n\ndata: [DONE]\n\n`,
        { status: 200 }
      )) as typeof fetch;
    const result = await streamPageGeneration("x", openaiCfg, () => {});
    assert.equal(result.ok, false);
    assert.match(result.error || "", /解析/);
    assert.equal(stateStore.getState().components.length, 0);
  });
});

describe("streamCandidateBatch (R1 多候选)", () => {
  beforeEach(() => {
    clearCandidateBatchesForTests();
  });

  test("generates 3 candidates in order with start/done events and stores specs", async () => {
    const specA = {
      page: "current",
      style: null,
      base_color: null,
      components: [{ type: "hero", props: { title: "候选A" } }],
    };
    const specC = {
      page: "current",
      style: null,
      base_color: null,
      components: [
        { type: "navbar", props: { brand: "候选C" } },
        { type: "footer", props: { copyright: "© 2026" } },
      ],
    };
    let call = 0;
    const bodies = [
      sseBody([JSON.stringify(specA)]),
      sseBody(["不是JSON"]), // 中间候选失败，不中断整批
      sseBody([JSON.stringify(specC)]),
    ];
    globalThis.fetch = (async () => new Response(bodies[call++] ?? sseBody([]), { status: 200 })) as typeof fetch;

    const starts: Array<[number, number, string]> = [];
    const deltas: Array<[number, string]> = [];
    const dones: Array<[number, boolean]> = [];
    const { batch_id, candidates } = await streamCandidateBatch("做一个落地页", openaiCfg, 3, {
      onStart: (index, total, label) => starts.push([index, total, label]),
      onDelta: (index, text) => deltas.push([index, text]),
      onCandidateDone: (r) => dones.push([r.index, r.ok]),
    });

    // 事件序列: start 3 次（索引/总数/标签），delta 与 done 按 index 对应
    assert.deepEqual(starts, [[0, 3, "均衡版"], [1, 3, "大胆版"], [2, 3, "紧凑版"]]);
    assert.deepEqual(dones, [[0, true], [1, false], [2, true]]);
    assert.ok(deltas.every(([i]) => i >= 0 && i <= 2));
    assert.ok(deltas.some(([i, t]) => i === 0 && t.includes("候选A")));

    // 候选结果
    assert.equal(candidates.length, 3);
    assert.equal(candidates[0].ok, true);
    assert.equal(candidates[0].component_count, 1);
    assert.equal(candidates[0].preview[0]?.type, "hero");
    assert.equal(candidates[1].ok, false);
    assert.match(candidates[1].error || "", /解析/);
    assert.equal(candidates[2].ok, true);
    assert.equal(candidates[2].component_count, 2);
    assert.equal(candidates[2].preview.length, 2);
    assert.match(batch_id, /^batch_/);

    // takeCandidateSpec: 成功候选可取出；应用成功即整批消费
    const spec = takeCandidateSpec(batch_id, 0);
    assert.ok(
      typeof spec === "object" && spec.components[0]?.type === "hero",
      "候选 0 应可取出且为 hero spec"
    );
    assert.equal(takeCandidateSpec(batch_id, 2), "missing");
  });

  test("count is clamped and unknown batch ids report missing", async () => {
    clearCandidateBatchesForTests();
    const spec = {
      page: "current",
      style: null,
      base_color: null,
      components: [{ type: "text_section", props: { title: "唯一" } }],
    };
    globalThis.fetch = (async () =>
      new Response(sseBody([JSON.stringify(spec)]), { status: 200 })) as typeof fetch;
    const { batch_id, candidates } = await streamCandidateBatch("x", openaiCfg, 99, {});
    assert.equal(candidates.length, 3); // clamp 到角度总数 3（每轮 fetch 返回同一 spec）
    assert.equal(takeCandidateSpec("batch_none", 0), "missing");
    assert.equal(takeCandidateSpec(batch_id, 5), "invalid");
  });
});
