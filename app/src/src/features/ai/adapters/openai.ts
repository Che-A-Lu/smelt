import type { Adapter, AdapterRequest, AdapterResponse, StreamChunk, ToolCall } from "../types";

export function createOpenAIAdapter(baseURL: string): Adapter {
  return {
    id: "openai",
    label: "OpenAI Compatible",

    buildRequest(req: AdapterRequest, apiKey: string): AdapterResponse {
      const body: Record<string, unknown> = { model: req.model, messages: req.messages, stream: true };
      if (req.tools && req.tools.length > 0) {
        body.tools = req.tools;
        body.tool_choice = "auto";
      }
      return {
        url: `${baseURL}/chat/completions`,
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
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
      const tcAccum = new Map<number, { id: string; name: string; args: string }>();

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
            if (data === "[DONE]") {
              const toolCalls = collectToolCalls(tcAccum);
              yield { content: "", thinking: "", done: true, error: null, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
              return;
            }
            try {
              const delta = JSON.parse(data).choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.tool_calls) {
                for (const dtc of delta.tool_calls) {
                  const idx = dtc.index ?? 0;
                  if (!tcAccum.has(idx)) tcAccum.set(idx, { id: "", name: "", args: "" });
                  const acc = tcAccum.get(idx)!;
                  if (dtc.id) acc.id = dtc.id;
                  if (dtc.function?.name) acc.name = dtc.function.name;
                  if (dtc.function?.arguments) acc.args += dtc.function.arguments;
                }
                continue;
              }

              if (delta.content || delta.reasoning_content) {
                yield { content: delta.content ?? "", thinking: delta.reasoning_content ?? "", done: false, error: null };
              }
            } catch { /* skip */ }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const toolCalls = collectToolCalls(tcAccum);
      yield { content: "", thinking: "", done: true, error: null, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
    },
  };
}

function collectToolCalls(tcAccum: Map<number, { id: string; name: string; args: string }>): ToolCall[] {
  const result: ToolCall[] = [];
  for (const [, tc] of tcAccum) {
    if (tc.id && tc.name) {
      result.push({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.args || "{}" } });
    }
  }
  return result;
}
