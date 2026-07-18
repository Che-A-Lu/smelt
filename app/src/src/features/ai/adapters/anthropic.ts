import type { ChatMessage } from "../../../foundation/types";
import type { ToolDef } from "../../tool-registry";
import type { Adapter, AdapterRequest, AdapterResponse, StreamChunk, ToolCall } from "../types";

export const anthropicAdapter: Adapter = {
  id: "anthropic",
  label: "Anthropic",

  buildRequest(req: AdapterRequest, apiKey: string): AdapterResponse {
    // 提取 system 消息
    const systemParts: string[] = [];
    const messages: Record<string, unknown>[] = [];

    for (let i = 0; i < req.messages.length; i++) {
      const m = req.messages[i];
      if (m.role === "system") {
        systemParts.push(m.content);
      } else if (m.role === "tool") {
        // tool 消息 → user + tool_result content block
        messages.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: m.content }],
        });
      } else {
        const entry: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.tool_calls && m.tool_calls.length > 0) {
          // assistant 带 tool_calls → content 数组
          const blocks: Record<string, unknown>[] = [];
          if (m.content) blocks.push({ type: "text", text: m.content });
          for (const tc of m.tool_calls) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(tc.function.arguments); } catch { /* */ }
            blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
          }
          entry.content = blocks;
        }
        messages.push(entry);
      }
    }

    // Tools → Anthropic 格式
    let tools: Record<string, unknown>[] | undefined;
    if (req.tools && req.tools.length > 0) {
      tools = req.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: 4096,
      stream: true,
      messages,
    };
    if (systemParts.length > 0) body.system = systemParts.join("\n");
    if (tools) { body.tools = tools; body.tool_choice = { type: "auto" }; }

    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
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
    const tcMap = new Map<number, { id: string; name: string; args: string }>();

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
            const evt = JSON.parse(data);
            const type = evt.type as string;

            switch (type) {
              case "content_block_start": {
                const block = evt.content_block;
                if (block?.type === "tool_use") {
                  tcMap.set(evt.index, { id: block.id, name: block.name, args: "" });
                }
                break;
              }

              case "content_block_delta": {
                const delta = evt.delta;
                if (delta?.type === "text_delta") {
                  yield { content: delta.text, thinking: "", done: false, error: null };
                } else if (delta?.type === "input_json_delta") {
                  const tc = tcMap.get(evt.index);
                  if (tc) tc.args += delta.partial_json;
                }
                break;
              }

              case "message_stop": {
                const toolCalls: ToolCall[] = [];
                for (const [, tc] of tcMap) {
                  if (tc.id && tc.name) {
                    toolCalls.push({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.args || "{}" } });
                  }
                }
                yield { content: "", thinking: "", done: true, error: null, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
                return;
              }

              case "error": {
                yield { content: "", thinking: "", done: true, error: evt.error?.message ?? "Anthropic error" };
                return;
              }

              // message_start, content_block_stop, message_delta, ping → ignore
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const toolCalls: ToolCall[] = [];
    for (const [, tc] of tcMap) {
      if (tc.id && tc.name) {
        toolCalls.push({ id: tc.id, type: "function" as const, function: { name: tc.name, arguments: tc.args || "{}" } });
      }
    }
    yield { content: "", thinking: "", done: true, error: null, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  },
};
