// ============================================================
// 工具注册表
// 内置工具 + 工作台工具区脚本卡 → OpenAI tools 数组
// ============================================================

import type { CardEntry } from "../foundation/types";
import type { ToolItem } from "../ui/workbench/types";
import { getSandbox } from "./sandbox/index";
import { readSphereFiles } from "../platform/storage";

// OpenAI function calling 格式
export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required: string[];
    };
  };
}

// 工具执行上下文
export interface ToolContext {
  workbenchCardIds: string[];     // 工作台内可操作的卡片 ID
  toolCardIds: string[];          // 工具区卡片 ID
  allCards: CardEntry[];          // 画布所有卡片引用
  readCard: (cardId: string) => Promise<string>;
  createCard: (title: string, content: string) => Promise<string>;
  updateCard: (cardId: string, content: string) => Promise<void>;
  tagCard: (cardId: string, tags: string[]) => Promise<void>;
  searchCards: (query: string) => Promise<{ name: string; tags: string[] }[]>;
}

// 工具执行结果
export interface ToolResult {
  tool_call_id: string;
  role: "tool";
  content: string;
}

// ============================================================
// 内置工具定义
// ============================================================

const BUILTIN_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "card_read",
      description:
        "读取指定卡片的内容和元信息（标签、创建时间、文件类型）。" +
        "限制：只读操作，不能修改卡片，不能访问工作台外的卡片。" +
        "确认：不需要用户确认。",
      parameters: {
        type: "object",
        properties: {
          cardId: { type: "string", description: "卡片名称（在工作台上下文区或工具区中显示的名称）" },
        },
        required: ["cardId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "card_list",
      description:
        "列出当前工作台上下文区和工具区的所有卡片名称和标签。" +
        "限制：只读操作。只能列出已加入此工作台的卡片。" +
        "确认：不需要用户确认。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "card_search",
      description:
        "按标签或名称搜索画布上的卡片。不读取卡片内容——只返回卡片名称和标签。" +
        "限制：只读操作。不能搜索工作台外的卡片内容。" +
        "确认：不需要用户确认。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词，匹配卡片名称或标签" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "card_create",
      description:
        "在工作台的 AI 临时文件区创建一张新卡片。" +
        "限制：不能创建脚本卡（.py/.js 等可执行文件）。" +
        "确认：需要用户手动确认（自动模式下免确认）。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "卡片名称（不含扩展名）" },
          fileType: { type: "string", enum: ["md", "txt", "json", "csv"], description: "文件类型" },
          content: { type: "string", description: "卡片内容" },
        },
        required: ["title", "fileType", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "card_update",
      description:
        "修改指定卡片的内容。" +
        "限制：只能修改已加入此工作台的卡片，不能改工作台外的卡片。" +
        "确认：需要用户手动确认（自动模式下免确认）。",
      parameters: {
        type: "object",
        properties: {
          cardId: { type: "string", description: "卡片名称（在工作台上下文区或工具区中显示的名称）" },
          content: { type: "string", description: "新的卡片内容" },
        },
        required: ["cardId", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "card_tag",
      description:
        "给卡片添加或移除标签。纯标签操作，不修改卡片内容。" +
        "限制：只能修改已加入此工作台的卡片。" +
        "确认：不需要用户确认。",
      parameters: {
        type: "object",
        properties: {
          cardId: { type: "string", description: "卡片名称（在工作台上下文区或工具区中显示的名称）" },
          tags: { type: "string", description: "逗号分隔的标签列表。例如：'重要, 待处理, 已审核'" },
        },
        required: ["cardId", "tags"],
      },
    },
  },
];

// ============================================================
// 关键词 → tool 匹配表
// ============================================================

const KEYWORD_TOOLS: { keywords: string[]; toolName: string }[] = [
  { keywords: ["分析", "数据", "csv", "表", "查看", "读", "看看", "看一下", "读一下", "analyze", "data", "read", "look"], toolName: "card_read" },
  { keywords: ["列表", "有哪些", "所有的", "列出来", "list", "all"], toolName: "card_list" },
  { keywords: ["创建", "新建", "写", "生成", "产出", "create", "write", "generate", "new"], toolName: "card_create" },
  { keywords: ["改", "修改", "更新", "编辑", "update", "edit", "modify", "change"], toolName: "card_update" },
  { keywords: ["标签", "标记", "分类", "tag", "label", "category"], toolName: "card_tag" },
  { keywords: ["搜索", "查找", "找", "search", "find"], toolName: "card_search" },
];

// ============================================================
// 构建 API tools 数组
// ============================================================

export function buildTools(
  toolItems: ToolItem[],
  userPrompt?: string,
): ToolDef[] {
  const toolNames = new Set<string>();
  for (const t of BUILTIN_TOOLS) toolNames.add(t.function.name);

  // 关键词匹配 → 补充工具
  if (userPrompt) {
    const lower = userPrompt.toLowerCase();
    for (const kt of KEYWORD_TOOLS) {
      if (kt.keywords.some((kw) => lower.includes(kw))) {
        toolNames.add(kt.toolName);
      }
    }
  }

  if (toolItems.length > 0) toolNames.add("script_run");

  const tools: ToolDef[] = [];
  const added = new Set<string>();
  for (const bt of BUILTIN_TOOLS) {
    if (toolNames.has(bt.function.name)) { tools.push(bt); added.add(bt.function.name); }
  }

  if (toolNames.has("script_run") && toolItems.length > 0) {
    const scriptCards = toolItems.map((t) => t.label).join("、");
    tools.push({
      type: "function",
      function: {
        name: "script_run",
        description: `执行工具区中的脚本。可用脚本：${scriptCards}。脚本在隔离沙箱中运行——无网络、无文件系统、无 DOM。`,
        parameters: {
          type: "object",
          properties: {
            scriptName: { type: "string", description: "要运行的脚本名称" },
            input: { type: "string", description: "传给脚本的输入数据（可选）" },
          },
          required: ["scriptName"],
        },
      },
    });
  }

  return tools;
}

// ============================================================
// 工具执行器
// ============================================================

export async function executeTool(
  name: string,
  args: Record<string, string>,
  ctx: ToolContext,
): Promise<string> {
  switch (name) {
    case "card_read": {
      const cardId = findCardId(args.cardId, ctx);
      if (!cardId) return `未找到卡片："${args.cardId}"。请用 card_list 查看可用卡片。`;
      return await ctx.readCard(cardId);
    }

    case "card_list": {
      const cards = ctx.allCards.filter((c) => ctx.workbenchCardIds.includes(c.id));
      if (cards.length === 0) return "工作台内没有卡片。";
      return cards.map((c) => `- ${c.label} [${c.tags.join(", ") || "无标签"}]`).join("\n");
    }

    case "card_search": {
      const q = args.query.toLowerCase();
      const results = await ctx.searchCards(q);
      if (results.length === 0) return `未找到匹配 "${args.query}" 的卡片。`;
      return results.map((r) => `- ${r.name} [${r.tags.join(", ") || "无标签"}]`).join("\n");
    }

    case "card_create": {
      const title = args.title || "未命名";
      const content = args.content || "";
      const result = await ctx.createCard(title, content);
      return `卡片已创建：${result}`;
    }

    case "card_update": {
      const cardId = findCardId(args.cardId, ctx);
      if (!cardId) return `未找到卡片："${args.cardId}"。`;
      await ctx.updateCard(cardId, args.content || "");
      return `卡片已更新：${args.cardId}`;
    }

    case "card_tag": {
      const cardId = findCardId(args.cardId, ctx);
      if (!cardId) return `未找到卡片："${args.cardId}"。`;
      const tags = (args.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
      await ctx.tagCard(cardId, tags);
      return `标签已更新：${args.cardId} → [${tags.join(", ")}]`;
    }

    case "script_run": {
      // 按名称找工具区里的脚本卡
      const toolCardId = ctx.toolCardIds.find((id) => {
        const c = ctx.allCards.find((x) => x.id === id);
        return c?.label === args.scriptName || c?.label.toLowerCase() === args.scriptName?.toLowerCase();
      });
      if (!toolCardId) return `未找到脚本："${args.scriptName}"。请确认脚本卡已加入工具区。`;

      const card = ctx.allCards.find((x) => x.id === toolCardId);
      if (!card?.sphereId) return `脚本卡 "${args.scriptName}" 内容为空。`;

      let code = "";
      try {
        const files = await readSphereFiles(card.sphereId);
        code = files.map((f) => f.content).join("\n");
      } catch {
        return `无法读取脚本 "${args.scriptName}"。`;
      }

      const sandbox = getSandbox();
      const result = await sandbox.runScript(code);

      if (result.ok) return result.output || "脚本执行完成（无输出）。";
      return `脚本执行错误：${result.error}`;
    }

    default:
      return `未知工具：${name}`;
  }
}

// 从卡片名查找 ID
function findCardId(nameOrId: string, ctx: ToolContext): string | null {
  // 直接匹配 ID
  if (ctx.workbenchCardIds.includes(nameOrId)) return nameOrId;
  if (ctx.toolCardIds.includes(nameOrId)) return nameOrId;
  // 按名称匹配
  const match = ctx.allCards.find(
    (c) => c.label.toLowerCase() === nameOrId.toLowerCase() && ctx.workbenchCardIds.includes(c.id),
  );
  return match?.id ?? null;
}

// 需要确认的写工具
const WRITE_TOOLS = new Set(["card_create", "card_update", "script_run"]);

export function requiresConfirmation(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName);
}

export { BUILTIN_TOOLS };
