import type { ChatMessage } from "../../../foundation/types";
import type { ToolDef } from "../../tool-registry";
import type { Adapter, AdapterRequest, AdapterResponse, StreamChunk, ToolCall } from "../types";

export const geminiAdapter: Adapter = {
  id: "gemini",
  label: "Gemini",

  buildRequest(req: AdapterRequest, apiKey: string): AdapterResponse {
    const contents: Record<string, unknown>[] = [];
    let systemInstruction: string | undefined;

    // 建立 tool_call_id → function.name 映射（多 tool 场景需要按名匹配）
    const idToName = new Map<string, string>();
    for (const m of req.messages) {
      if (m.role === "assistant" && m.tool_calls) {
        for (const tc of m.tool_calls) idToName.set(tc.id, tc.function.name);
      }
    }

    for (const m of req.messages) {
      if (m.role === "system") {
        systemInstruction = (systemInstruction ?? "") + m.content + "\n";
        continue;
      }

      let geminiRole = "user";
      if (m.role === "assistant") geminiRole = "model";
      if (m.role === "tool") geminiRole = "tool";

      if (m.role === "tool") {
        const name = idToName.get(m.tool_call_id ?? "") ?? "";
        contents.push({
          role: "tool",
          parts: [{ functionResponse: { name, response: { result: m.content } } }],
        });
      } else {
        const parts: Record<string, unknown>[] = [{ text: m.content }];
        if (m.tool_calls && m.tool_calls.length > 0) {
          for (const tc of m.tool_calls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments); } catch { /* */ }
            parts.push({ functionCall: { name: tc.function.name, args } });
          }
        }
        contents.push({ role: geminiRole, parts });
      }
    }

    // Tools → Gemini functionDeclarations
    let tools: Record<string, unknown>[] | undefined;
    if (req.tools && req.tools.length > 0) {
      tools = [{ functionDeclarations: req.tools.map((t) => t.function) }];
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { temperature: 0.7 },
    };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction.trim() }] };
    if (tools) body.tools = tools;

    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  },

  async *parseStream(response: Response): AsyncGenerator<StreamChunk> {
    const reader = response.body?.getReader();
    if (!reader) {
      yield { content: "", thinking: "", done: true, error: "No response body" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    const toolCalls: ToolCall[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            const candidate = parsed.candidates?.[0];
            if (!candidate) continue;

            const parts = candidate.content?.parts;
            if (!parts) continue;

            let hasFinish = false;
            if (candidate.finishReason) {
              hasFinish = true;
              if (candidate.finishReason === "SAFETY") {
                yield { content: "", thinking: "", done: true, error: "Content blocked by safety filter" };
                return;
              }
            }

            for (const part of parts) {
              if (part.text) {
                yield { content: part.text, thinking: "", done: false, error: null };
              }
              if (part.functionCall) {
                toolCalls.push({
                  id: `call_${toolCalls.length}`,
                  type: "function" as const,
                  function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args ?? {}),
                  },
                });
              }
            }

            if (hasFinish) {
              yield { content: "", thinking: "", done: true, error: null, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
              return;
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: "", thinking: "", done: true, error: null, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  },
};
