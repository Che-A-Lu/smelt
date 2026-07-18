import type { ChatMessage } from "../../foundation/types";
import type { StreamChunk, ToolCall } from "../ai/types";
import type { ToolDef } from "../tool-registry";
import type { OrchestratorCard } from "./types";

export interface OrchestratorContext {
  streamChat: (modelId: string, messages: ChatMessage[], signal?: AbortSignal, tools?: ToolDef[]) => AsyncGenerator<StreamChunk>;
  onStepOutput: (label: string, content: string) => void;
  signal?: AbortSignal;
  contextMessages?: ChatMessage[];
}

const DEFAULT_PROMPT =
  "你是一个任务编排器。用户给你一个目标。你决定：将目标拆解为几个子任务，每个子任务委托给最合适的模型执行。" +
  "每次只委托一个子任务，等结果回来再决定下一步。不要自己完成子任务——你的职责是调度。";

export async function runOrchestrator(
  card: OrchestratorCard,
  userPrompt: string,
  ctx: OrchestratorContext,
): Promise<string> {
  const maxRounds = card.maxRounds ?? 8;
  let round = 0;

  const modelCallTool: ToolDef = {
    type: "function",
    function: {
      name: "model_call",
      description:
        "将一段子任务委托给指定的模型执行。" +
        "参数 model：目标模型名。" +
        "参数 instruction：要执行的任务描述。" +
        "可用模型：" + card.availableModels.join("、"),
      parameters: {
        type: "object",
        properties: {
          model: { type: "string", description: "目标模型名" },
          instruction: { type: "string", description: "要执行的子任务" },
        },
        required: ["model", "instruction"],
      },
    },
  };

  const messages: ChatMessage[] = [
    { role: "system", content: card.systemPrompt ?? DEFAULT_PROMPT },
    ...(ctx.contextMessages ?? []),
    { role: "user", content: userPrompt },
  ];

  while (round < maxRounds) {
    round++;
    let fullContent = "";
    let toolCalls: ToolCall[] = [];

    try {
      for await (const chunk of ctx.streamChat(card.orchestratorModel, messages, ctx.signal, [modelCallTool])) {
        if (chunk.error) return `编排器错误(轮${round}): ${chunk.error}`;
        if (chunk.done) { toolCalls = chunk.toolCalls ?? []; break; }
        fullContent += chunk.content;
      }
    } catch (err) {
      return `编排器异常(轮${round}): ${err instanceof Error ? err.message : String(err)}`;
    }

    if (toolCalls.length === 0) {
      return fullContent;
    }

    // 追加 assistant 消息
    const assistantMsg: ChatMessage = { role: "assistant", content: fullContent, tool_calls: toolCalls };
    messages.push(assistantMsg);

    for (const tc of toolCalls) {
      if (tc.function.name !== "model_call") continue;

      let args: { model?: string; instruction?: string } = {};
      try { args = JSON.parse(tc.function.arguments); } catch { continue; }
      if (!args.model || !args.instruction) continue;

      let subContent = "";
      const subMsgs: ChatMessage[] = [{ role: "user", content: args.instruction }];

      try {
        for await (const chunk of ctx.streamChat(args.model, subMsgs, ctx.signal)) {
          if (chunk.error) { subContent = `错误: ${chunk.error}`; break; }
          if (chunk.done) break;
          subContent += chunk.content;
        }
      } catch (err) {
        subContent = `异常: ${err instanceof Error ? err.message : String(err)}`;
      }

      ctx.onStepOutput(`${args.model}: ${args.instruction.slice(0, 50)}`, subContent);
      messages.push({ role: "tool", content: subContent, tool_call_id: tc.id });
    }
  }

  return "编排器已达到最大轮次限制。";
}
