import type { ChatMessage } from "../../foundation/types";
import type { StreamChunk } from "../ai/types";
import type { ToolDef } from "../tool-registry";
import type { PipelineCard } from "./types";

export interface PipelineContext {
  streamChat: (modelId: string, messages: ChatMessage[], signal?: AbortSignal, tools?: ToolDef[]) => AsyncGenerator<StreamChunk>;
  onStepOutput: (label: string, content: string) => void;
  onPause: (label: string) => Promise<void>;
  signal?: AbortSignal;
  contextMessages?: ChatMessage[];
}

export async function runPipeline(
  card: PipelineCard,
  userPrompt: string,
  ctx: PipelineContext,
): Promise<string> {
  const maxRounds = card.maxRounds ?? 10;
  let round = 0;
  const stepOutputs: { label: string; content: string }[] = [];

  for (const step of card.steps) {
    if (ctx.signal?.aborted) break;
    if (round >= maxRounds) break;

    if (step.type === "pause") {
      await ctx.onPause(step.label ?? "检查中间结果");
      continue;
    }

    round++;

    const messages: ChatMessage[] = [
      ...(stepOutputs.length === 0 && ctx.contextMessages ? ctx.contextMessages : []),
      { role: "system", content: step.instruction! },
    ];

    // 上下文策略
    const mode = step.contextMode ?? "last";
    if (mode === "all") {
      for (const so of stepOutputs) {
        messages.push({ role: "user", content: `[${so.label}]\n${so.content}` });
      }
    } else if (mode === "last" || !mode) {
      const last = stepOutputs[stepOutputs.length - 1];
      if (last) messages.push({ role: "user", content: `[${last.label}]\n${last.content}` });
    }

    // 第一轮追加用户 prompt
    if (stepOutputs.length === 0 && userPrompt) {
      messages.push({ role: "user", content: userPrompt });
    }

    let fullContent = "";
    try {
      for await (const chunk of ctx.streamChat(step.model!, messages, ctx.signal)) {
        if (chunk.error) return `管线错误(步骤${round}): ${chunk.error}`;
        if (chunk.done) break;
        fullContent += chunk.content;
      }
    } catch (err) {
      return `管线异常(步骤${round}): ${err instanceof Error ? err.message : String(err)}`;
    }

    const label = step.outputLabel ?? `步骤${round}`;
    stepOutputs.push({ label, content: fullContent });
    ctx.onStepOutput(label, fullContent);
  }

  const last = stepOutputs[stepOutputs.length - 1];
  return last?.content ?? "";
}
