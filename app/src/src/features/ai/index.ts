import { BUILTIN_PROVIDERS, type ChatMessage } from "../../foundation/types";
import { getSettings, loadSettings } from "../../platform/settings";
import type { ToolDef } from "../tool-registry";
import type { Adapter, StreamChunk } from "./types";
import { createOpenAIAdapter } from "./adapters/openai";
import { anthropicAdapter } from "./adapters/anthropic";
import { geminiAdapter } from "./adapters/gemini";

// 重新导出类型（保持 Workbench 兼容）
export type { ToolCall, StreamChunk } from "./types";

// 7 个 OpenAI 兼容 provider
const OPENAI_COMPAT = new Set(["deepseek", "openai", "kimi", "qwen", "zhipu", "groq", "custom"]);

function getAdapter(providerId: string, baseURL: string): Adapter {
  if (providerId === "anthropic") return anthropicAdapter;
  if (providerId === "google") return geminiAdapter;
  return createOpenAIAdapter(baseURL);
}

async function resolveProvider(modelId: string): Promise<{ config: { id: string; baseURL: string }; apiKey: string } | null> {
  await loadSettings();
  const settings = getSettings();
  if (!settings) return null;

  for (const [id, config] of Object.entries(BUILTIN_PROVIDERS)) {
    if (id === "custom") continue;
    if (config.models.includes(modelId)) {
      const key = settings.keys[id as keyof typeof settings.keys];
      if (key) return { config: { id, baseURL: config.baseURL }, apiKey: key };
    }
  }
  return null;
}

export async function* streamChat(
  modelId: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
  tools?: ToolDef[],
): AsyncGenerator<StreamChunk> {
  let resolved = await resolveProvider(modelId);

  if (!resolved) {
    const settings = getSettings();
    if (settings?.customBaseURL && settings?.customModel && settings?.keys.custom) {
      resolved = {
        config: { id: "custom", baseURL: settings.customBaseURL },
        apiKey: settings.keys.custom,
      };
      modelId = settings.customModel;
    }
  }

  if (!resolved) {
    yield { content: "", thinking: "", done: true, error: "No API key configured." };
    return;
  }

  const adapter = getAdapter(resolved.config.id, resolved.config.baseURL);
  const { url, headers, body } = adapter.buildRequest({ model: modelId, messages, tools }, resolved.apiKey);

  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers, body, signal });
  } catch (err) {
    yield { content: "", thinking: "", done: true, error: `Network error: ${err instanceof Error ? err.message : "unknown"}` };
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let msg = `API error ${response.status}`;
    try { msg = JSON.parse(text).error?.message ?? msg; } catch { /* raw */ }
    yield { content: "", thinking: "", done: true, error: msg };
    return;
  }

  for await (const chunk of adapter.parseStream(response)) {
    yield chunk;
  }
}
