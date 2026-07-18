// 管线
export interface PipelineStep {
  model?: string;
  instruction?: string;
  outputLabel?: string;
  contextMode?: "all" | "last" | "none";
  type?: "pause";
  label?: string;
}

export interface PipelineCard {
  type: "pipeline";
  name: string;
  maxRounds?: number;
  steps: PipelineStep[];
}

// 团队
export interface TeamMember {
  model: string;
  role: string;
  persona: string;
}

export interface TeamCard {
  type: "team";
  name: string;
  members: TeamMember[];
}

// 编排
export interface OrchestratorCard {
  type: "orchestrator";
  name: string;
  orchestratorModel: string;
  availableModels: string[];
  maxRounds?: number;
  maxTokensPerRound?: number;
  systemPrompt?: string;
}

export type ModeCard = PipelineCard | TeamCard | OrchestratorCard;
export type ModeType = "pipeline" | "team" | "orchestrator" | null;

const VALID_TYPES = ["pipeline", "team", "orchestrator"];

export function validateModeCard(json: unknown): ModeCard | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const type = obj.type as string;
  if (!VALID_TYPES.includes(type)) return null;

  if (type === "pipeline") {
    if (!obj.name || !Array.isArray(obj.steps) || obj.steps.length < 2) return null;
    for (const s of obj.steps) {
      if (s.type === "pause") continue;
      if (!s.model || !s.instruction) return null;
    }
    return obj as unknown as PipelineCard;
  }

  if (type === "team") {
    if (!obj.name || !Array.isArray(obj.members) || obj.members.length < 2) return null;
    for (const m of obj.members) {
      if (!m.model || !m.role || !m.persona) return null;
    }
    return obj as unknown as TeamCard;
  }

  if (type === "orchestrator") {
    if (!obj.name || !obj.orchestratorModel || !Array.isArray(obj.availableModels) || obj.availableModels.length === 0) return null;
    return obj as unknown as OrchestratorCard;
  }

  return null;
}
