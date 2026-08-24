/**
 * LLM provider adapters (product definition v2).
 *
 * Three transports behind one `chatCompletion` function:
 *   - openai:    OpenAI-compatible chat/completions (OpenAI, DeepSeek, 通义,
 *                智谱, Moonshot, LM Studio, Ollama… via a custom base URL)
 *   - anthropic: Anthropic Messages API (native)
 *   - google:    Gemini generateContent (native)
 */

import type { LlmConfig } from "./config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class LlmError extends Error {}

async function fetchJson(url: string, init: RequestInit, provider: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new LlmError(
      `${provider} 请求失败：${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new LlmError(`${provider} HTTP ${res.status}：${body.slice(0, 300)}`);
  }
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function openaiChat(messages: ChatMessage[], cfg: LlmConfig): Promise<string> {
  const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const data = (await fetchJson(
    `${base}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.7, max_tokens: 4096 }),
    },
    "OpenAI"
  )) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) throw new LlmError("OpenAI 返回为空");
  return content;
}

async function anthropicChat(messages: ChatMessage[], cfg: LlmConfig): Promise<string> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const data = (await fetchJson(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: cfg.model, max_tokens: 4096, system, messages: rest }),
    },
    "Anthropic"
  )) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("");
  if (!text) throw new LlmError("Anthropic 返回为空");
  return text;
}

async function googleChat(messages: ChatMessage[], cfg: LlmConfig): Promise<string> {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const data = (await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      cfg.model
    )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    },
    "Gemini"
  )) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("");
  if (!text) throw new LlmError("Gemini 返回为空");
  return text;
}

/**
 * Run one chat completion against the configured provider.
 * Throws LlmError with a readable message on any failure.
 */
export async function chatCompletion(messages: ChatMessage[], cfg: LlmConfig): Promise<string> {
  if (!cfg.apiKey) throw new LlmError("未配置 API Key");
  if (cfg.provider === "anthropic") return anthropicChat(messages, cfg);
  if (cfg.provider === "google") return googleChat(messages, cfg);
  return openaiChat(messages, cfg);
}

/**
 * M2 NL2UI 流式: OpenAI 兼容的流式对话；anthropic/google 降级为非流式
 * （一次性 onDelta 回调），对上层调用方保持同一接口。
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  cfg: LlmConfig,
  onDelta: (text: string) => void
): Promise<string> {
  if (cfg.provider !== "openai") {
    const full = await chatCompletion(messages, cfg);
    onDelta(full);
    return full;
  }
  const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
      }),
    });
  } catch (err) {
    throw new LlmError(`OpenAI 请求失败：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new LlmError(`OpenAI HTTP ${res.status}：${body.slice(0, 300)}`);
  }
  if (!res.body) throw new LlmError("OpenAI 流式响应缺少 body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // 忽略无法解析的行（心跳/注释）
      }
    }
  }
  if (!full) throw new LlmError("OpenAI 流式返回为空");
  return full;
}
