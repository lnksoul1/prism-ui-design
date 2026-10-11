import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "node:os";
import path from "node:path";
import { stateStore } from "../src/state.js";
import { applyStyleTokenSet } from "../src/tokens.js";
import {
  clearLlmKey,
  loadLlmConfig,
  maskKey,
  saveLlmConfig,
} from "../src/llm/config.js";
import { chatCompletion, LlmError } from "../src/llm/providers.js";
import {
  requestAiRedo,
  requestAiUndo,
  resetAiHistoryForTests,
} from "../src/llm/edit.js";
import { applySpec, generatePageFromPrompt, parseSpec } from "../src/llm/agent.js";

let tmp: string;
let originalDir: string | undefined;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "prism-llm-"));
  originalDir = process.env.PRISM_PROJECT_DIR;
  process.env.PRISM_PROJECT_DIR = tmp;
  stateStore.resetForTests();
  resetAiHistoryForTests();
  applyStyleTokenSet(stateStore, "#7C3AED", "ai");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  if (originalDir === undefined) delete process.env.PRISM_PROJECT_DIR;
  else process.env.PRISM_PROJECT_DIR = originalDir;
});

// ===== config =====

test("llm config saves and loads with per-provider defaults", () => {
  assert.equal(loadLlmConfig(), null, "no config file → null");
  saveLlmConfig({ provider: "openai", apiKey: "sk-test", model: "" });
  const cfg = loadLlmConfig();
  assert.ok(cfg);
  assert.equal(cfg!.provider, "openai");
  assert.equal(cfg!.model, "gpt-4o-mini", "default model applied when empty");
  assert.equal(cfg!.baseUrl, "https://api.openai.com/v1", "default base URL applied");
  assert.equal(cfg!.apiKey, "sk-test");
});

test("llm config invalid file → null", () => {
  writeFileSync(path.join(tmp, "llm-config.json"), "{not json", "utf-8");
  assert.equal(loadLlmConfig(), null);
});

test("maskKey hides everything but the edges", () => {
  assert.equal(maskKey(""), "");
  assert.equal(maskKey("abcdefgh"), "****");
  assert.equal(maskKey("sk-1234567890wxyz"), "sk-1…wxyz");
});

test("clearLlmKey removes the stored key", () => {
  saveLlmConfig({ provider: "google", apiKey: "AI-abc", model: "gemini-2.5-flash" });
  clearLlmKey();
  assert.equal(loadLlmConfig(), null);
});

// ===== providers (fetch stubbed) =====

function stubFetch(handler: (url: string, init: RequestInit) => unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init || {} });
    const body = handler(String(url), init || {});
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("openai provider posts to /chat/completions with bearer auth", async () => {
  const { calls, restore } = stubFetch(() => ({ choices: [{ message: { content: "你好" } }] }));
  try {
    const reply = await chatCompletion(
      [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
      { provider: "openai", apiKey: "sk-1", model: "gpt-4o-mini", baseUrl: "https://example.com/v1/" }
    );
    assert.equal(reply, "你好");
    const call = calls[0];
    assert.equal(call.url, "https://example.com/v1/chat/completions");
    assert.equal((call.init.headers as Record<string, string>).Authorization, "Bearer sk-1");
    const body = JSON.parse(String(call.init.body)) as { model: string; messages: unknown[] };
    assert.equal(body.model, "gpt-4o-mini");
    assert.equal(body.messages.length, 2);
  } finally {
    restore();
  }
});

test("anthropic provider extracts system and posts to /v1/messages", async () => {
  const { calls, restore } = stubFetch(() => ({
    content: [{ type: "text", text: "claude says hi" }],
  }));
  try {
    const reply = await chatCompletion(
      [{ role: "system", content: "rules" }, { role: "user", content: "go" }],
      { provider: "anthropic", apiKey: "ak-1", model: "claude-sonnet-4-5" }
    );
    assert.equal(reply, "claude says hi");
    const call = calls[0];
    assert.equal(call.url, "https://api.anthropic.com/v1/messages");
    const headers = call.init.headers as Record<string, string>;
    assert.equal(headers["x-api-key"], "ak-1");
    assert.equal(headers["anthropic-version"], "2023-06-01");
    const body = JSON.parse(String(call.init.body)) as { system: string; messages: Array<{ role: string }> };
    assert.equal(body.system, "rules");
    assert.deepEqual(body.messages.map((m) => m.role), ["user"]);
  } finally {
    restore();
  }
});

test("google provider maps roles and sends generateContent with key", async () => {
  const { calls, restore } = stubFetch(() => ({
    candidates: [{ content: { parts: [{ text: "gemini ok" }] } }],
  }));
  try {
    const reply = await chatCompletion(
      [{ role: "system", content: "s" }, { role: "assistant", content: "prev" }, { role: "user", content: "now" }],
      { provider: "google", apiKey: "g-1", model: "gemini-2.5-flash" }
    );
    assert.equal(reply, "gemini ok");
    const call = calls[0];
    assert.match(call.url, /models\/gemini-2\.5-flash:generateContent\?key=g-1$/);
    const body = JSON.parse(String(call.init.body)) as { contents: Array<{ role: string }> };
    assert.deepEqual(body.contents.map((c) => c.role), ["user", "model", "user"]);
  } finally {
    restore();
  }
});

test("provider surfaces HTTP errors with status and body", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response("invalid api key", { status: 401 })) as typeof fetch;
  try {
    await assert.rejects(
      chatCompletion([{ role: "user", content: "x" }], { provider: "openai", apiKey: "k", model: "m" }),
      (err: unknown) => err instanceof LlmError && /401/.test(err.message) && /invalid api key/.test(err.message)
    );
  } finally {
    globalThis.fetch = original;
  }
});

// ===== agent =====

test("parseSpec tolerates fenced JSON and plain JSON", () => {
  const fenced = parseSpec("```json\n{\"page\":\"new\",\"components\":[{\"type\":\"hero\",\"props\":{\"title\":\"Hi\"}}]}\n```");
  assert.equal(fenced?.page, "new");
  assert.equal(fenced?.components.length, 1);

  const plain = parseSpec('{"page":"current","style":"minimal","components":[]}');
  assert.equal(plain?.page, "current");
  assert.equal(plain?.style, "minimal");

  assert.equal(parseSpec("nothing useful here"), null);
  assert.equal(parseSpec(""), null);
});

test("applySpec builds a new page from a spec and applies tokens", () => {
  const { nodes, targetPageId } = applySpec({
    page: "new",
    style: "bold",
    base_color: "#FF5500",
    components: [
      { type: "hero", props: { title: "AI 首页", subtitle: "副标题" } },
      { type: "navbar", props: { brand: "AI 品牌", links: ["首页", "关于"] } },
      { type: "mystery_type", props: {} }, // unknown types are skipped
    ],
  });
  assert.equal(nodes.length, 2);
  const state = stateStore.getState();
  assert.equal(state.pages.length, 2, "a fresh page was created");
  assert.equal(state.currentPageId, targetPageId);
  assert.equal(state.components.length, 2);
  // 风格预设已移除：style 仅记录，token 用中性默认 + base_color
  assert.equal(state.style, "minimal");
  assert.match(state.tokens.colors["color-primary"].value, /^#[0-9A-Fa-f]{6}$/);
});

test("applySpec replaces the current page when page is current", () => {
  stateStore.addComponent("hero", undefined, { title: "旧" }, null, "ai");
  applySpec({
    page: "current",
    components: [{ type: "cta", props: { title: "新", button_text: "走" } }],
  });
  const state = stateStore.getState();
  assert.equal(state.pages.length, 1, "no new page for current-mode edits");
  assert.equal(state.components.length, 1);
  assert.equal(state.components[0].type, "cta");
  assert.equal(state.components[0].props.title, "新");
});

test("generatePageFromPrompt runs the full pipeline with a stubbed provider", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '{"page":"new","style":"playful","components":[{"type":"hero","props":{"title":"宠物店"}},{"type":"footer","props":{"copyright":"© 2026"}}]}',
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  try {
    const result = await generatePageFromPrompt("帮我做一个宠物店的首页", {
      provider: "openai",
      apiKey: "sk-stub",
      model: "gpt-4o-mini",
    });
    assert.equal(result.ok, true);
    assert.equal(result.component_count, 2);
    assert.match(result.summary, /AI 已生成/);
    const state = stateStore.getState();
    assert.equal(state.pages.length, 2);
    assert.equal(state.components[0].type, "hero");
    assert.equal(state.components[0].props.title, "宠物店");
    assert.equal(state.style, "minimal"); // 风格预设已移除，统一 minimal 记录
  } finally {
    globalThis.fetch = original;
  }
});

test("generatePageFromPrompt reports unparseable output as an error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: "抱歉，我没理解" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  try {
    const result = await generatePageFromPrompt("随便", {
      provider: "openai",
      apiKey: "sk-stub",
      model: "gpt-4o-mini",
    });
    assert.equal(result.ok, false);
    assert.match(result.error || "", /无法解析|AI 输出/);
  } finally {
    globalThis.fetch = original;
  }
});

// ===== R6 整页生成的对话化撤销 =====

test("R6 applySpec lands as a single undo step and is conversation-undoable", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '{"page":"new","style":"playful","components":[{"type":"hero","props":{"title":"宠物店"}},{"type":"footer","props":{"copyright":"© 2026"}}]}',
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  try {
    const result = await generatePageFromPrompt("帮我做一个宠物店的首页", {
      provider: "openai",
      apiKey: "sk-stub",
      model: "gpt-4o-mini",
    });
    assert.equal(result.ok, true);
    const state = stateStore.getState();
    assert.equal(state.pages.length, 2);

    // 一次对话撤销回滚整次生成（单 undo 步，含新页面）
    assert.equal(requestAiUndo(), "已撤销上一步 AI 修改");
    const undone = stateStore.getState();
    assert.equal(undone.pages.length, 1, "新页面随撤销一并消失");
    assert.equal(undone.currentPageId !== state.currentPageId, true, "回到原页面");

    // 对话恢复 → 新页面回来
    assert.equal(requestAiRedo(), "已恢复上一步 AI 修改");
    assert.equal(stateStore.getState().pages.length, 2);
    assert.equal(
      stateStore.getState().components.some((c) => c.props.title === "宠物店"),
      true
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("R6 guard: manual change after generation blocks conversational undo", async () => {
  applySpec({
    page: "current",
    components: [{ type: "cta", props: { title: "AI 落地", button_text: "走" } }],
  });
  // 用户手动补一笔
  stateStore.addComponent("banner", undefined, { text: "手动" }, null, "user");
  assert.throws(() => requestAiUndo(), /已有其他改动/);
});

// ===== R1 M1 落位管线 =====

test("generated components are placed by the server (tidy pipeline), summary reports layout", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                page: "new",
                style: null,
                components: [
                  { type: "navbar", props: { brand: "N" } },
                  { type: "hero", props: { title: "H" } },
                  { type: "card", props: { title: "C1" }, layout_intent: "grid" },
                  { type: "card", props: { title: "C2" }, layout_intent: "grid" },
                  { type: "card", props: { title: "C3" }, layout_intent: "grid" },
                  { type: "footer", props: { copyright: "©" } },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  try {
    const result = await generatePageFromPrompt("做一个带三卡片的落地页", {
      provider: "openai",
      apiKey: "sk-stub",
      model: "gpt-4o-mini",
    });
    assert.equal(result.ok, true);
    // 体检: navbar 顶部通栏 + hero 全宽 + 三卡网格 + footer 贴底 → 无重叠无越界
    assert.deepEqual(result.layout_report, { overlaps: 0, out_of_bounds: 0 });
    assert.match(result.summary, /AI 已生成/);
    assert.match(result.summary, /布局已自动对齐/);
    const page = stateStore.getState().pages.find((p) => p.id === result.page_id);
    assert.ok(page);
    const byType = new Map(page!.components.map((c) => [c.type, c.layout!]));
    assert.deepEqual(byType.get("navbar"), { x: 0, y: 0, w: 1200, h: 64 });
    // 三张 grid 卡片横向等宽并排
    const cards = page!.components.filter((c) => c.type === "card");
    assert.equal(cards.length, 3);
    assert.equal(cards[0].layout!.y, cards[1].layout!.y);
    assert.ok(cards[1].layout!.x > cards[0].layout!.x);
    assert.ok(cards[2].layout!.x > cards[1].layout!.x);
    // footer 贴在内容栈底: 64(navbar)+360(hero)+16+160(cards)=600，footer 前 +16
    assert.deepEqual(byType.get("footer"), { x: 0, y: 616, w: 1200, h: 160 });
  } finally {
    globalThis.fetch = original;
  }
});

test("invalid layout_intent values are dropped during parse", () => {
  const spec = parseSpec(
    '{"page":"current","components":[{"type":"hero","layout_intent":"diagonal","props":{}},{"type":"card","layout_intent":"row","props":{}}]}'
  );
  assert.ok(spec);
  assert.equal(spec!.components[0].layout_intent, undefined);
  assert.equal(spec!.components[1].layout_intent, "row");
});
