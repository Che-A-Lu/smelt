import type { ChatMessage } from "../../foundation/types";
import type { ToolDef } from "../tool-registry";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface StreamChunk {
  content: string;
  thinking: string;
  done: boolean;
  error: string | null;
  toolCalls?: ToolCall[];
}

export interface AdapterRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
}

export interface AdapterResponse {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface Adapter {
  id: string;
  label: string;
  buildRequest(req: AdapterRequest, apiKey: string): AdapterResponse;
  parseStream(response: Response): AsyncGenerator<StreamChunk>;
}
