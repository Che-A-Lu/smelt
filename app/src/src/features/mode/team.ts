import type { ChatMessage } from "../../foundation/types";
import type { StreamChunk } from "../ai/types";
import type { TeamCard, TeamMember } from "./types";

export interface TeamContext {
  streamChat: (modelId: string, messages: ChatMessage[], signal?: AbortSignal) => AsyncGenerator<StreamChunk>;
  onMemberOutput: (member: TeamMember, content: string) => void;
  signal?: AbortSignal;
  contextMessages?: ChatMessage[];
}

export async function runTeam(
  card: TeamCard,
  userPrompt: string,
  ctx: TeamContext,
): Promise<{ member: TeamMember; content: string }[]> {
  const tasks = card.members.map(async (member) => {
    const messages: ChatMessage[] = [
      ...(ctx.contextMessages ?? []),
      { role: "system", content: member.persona },
    ];
    if (userPrompt) messages.push({ role: "user", content: userPrompt });

    let fullContent = "";
    try {
      for await (const chunk of ctx.streamChat(member.model, messages, ctx.signal)) {
        if (chunk.error) return { member, content: `错误: ${chunk.error}` };
        if (chunk.done) break;
        fullContent += chunk.content;
      }
    } catch (err) {
      return { member, content: `异常: ${err instanceof Error ? err.message : String(err)}` };
    }

    ctx.onMemberOutput(member, fullContent);
    return { member, content: fullContent };
  });

  return Promise.all(tasks);
}
