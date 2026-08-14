/**
 * Built-in LLM channel configuration (product definition v2).
 *
 * The desktop app embeds its own AI channel (BYO API key) so non-professionals
 * never need to attach an external agent. The key lives in a local config
 * file next to the project store — never logged, never sent anywhere except
 * the provider the user configured.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { getProjectDir } from "../project-store.js";

export type LlmProvider = "openai" | "anthropic" | "google";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  /** OpenAI-compatible base URL (e.g. https://api.deepseek.com/v1). */
  baseUrl?: string;
}

export const PROVIDER_DEFAULTS: Record<LlmProvider, { model: string; baseUrl?: string }> = {
  openai: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
  anthropic: { model: "claude-sonnet-4-5" },
  google: { model: "gemini-2.5-flash" },
};

export const PROVIDERS: LlmProvider[] = ["openai", "anthropic", "google"];

export function isProvider(value: string): value is LlmProvider {
  return (PROVIDERS as string[]).includes(value);
}

export function configPath(): string {
  return path.join(getProjectDir(), "llm-config.json");
}

/** Read the local LLM config. Returns null when not configured. */
export function loadLlmConfig(): LlmConfig | null {
  try {
    if (!existsSync(configPath())) return null;
    const raw = JSON.parse(readFileSync(configPath(), "utf-8")) as Partial<LlmConfig>;
    if (!raw || typeof raw.apiKey !== "string" || !raw.apiKey) return null;
    const provider = isProvider(raw.provider || "") ? (raw.provider as LlmProvider) : "openai";
    return {
      provider,
      apiKey: raw.apiKey,
      model: typeof raw.model === "string" && raw.model ? raw.model : PROVIDER_DEFAULTS[provider].model,
      baseUrl:
        typeof raw.baseUrl === "string" && raw.baseUrl
          ? raw.baseUrl
          : PROVIDER_DEFAULTS[provider].baseUrl,
    };
  } catch {
    return null;
  }
}

/** Persist the LLM config (test suites redirect PRISM_PROJECT_DIR to stay clean). */
export function saveLlmConfig(cfg: LlmConfig): LlmConfig {
  mkdirSync(getProjectDir(), { recursive: true });
  writeFileSync(
    configPath(),
    JSON.stringify(
      { provider: cfg.provider, apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl },
      null,
      2
    ),
    "utf-8"
  );
  return cfg;
}

/** Remove the stored API key (keeps provider/model choices). */
export function clearLlmKey(): void {
  try {
    writeFileSync(
      configPath(),
      JSON.stringify({ provider: "openai", apiKey: "", model: "", baseUrl: "" }, null, 2),
      "utf-8"
    );
  } catch {
    // ignore fs errors
  }
}

/** Mask a key for display: sk-…abcd. */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function hasLlm(): boolean {
  const cfg = loadLlmConfig();
  return !!cfg && !!cfg.apiKey;
}
