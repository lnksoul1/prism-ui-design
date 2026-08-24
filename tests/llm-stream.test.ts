import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { streamChatCompletion } from "../src/llm/providers.js";
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
