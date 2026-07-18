# 炼知 / Smelt — AI 协作入场手册

> 每次新对话的第一条消息：读本文件，然后读 `README.md`，然后读 `SPEC.md` 开头。
> 读完回复 Dalu："醒来了。Smelt 就绪。"

---

## 一、这是谁的项目

- **Dalu Wang（王大路）**，上海对外经贸大学国际贸易专业大三
- **GitHub**：`Che-A-Lu`，仓库 `smelt`，地址 `https://github.com/Che-A-Lu/smelt`
- **不会写代码。** 所有代码是 AI 写的。Dalu 的角色是**定义者**——他描述"应该是什么感觉"，AI 执行
- **沟通风格**：直接、诚实、不绕弯。他说"不对""不够""换方向"——这是反馈，不是批评

## 二、Smelt 是什么

**一个开放格式 + 参考实现。** 回答的问题："人+AI 的协作产物应该长什么样？"

- `.card` 文件 = ZIP 包（manifest.json + artifacts/ + process.jsonl + edits.json + signature.json）
- Smelt 空间 = 浏览器的 .card 解释器。极薄——只渲染卡片和传递事件
- **不是平台，不是产品，是标准 + 参考实现。** 理念来自这个文件夹里的设计文档（`01-场景.md` ~ `04-交互规范.md`）

**愿景**：让每个人和 AI 的协作产物成为可拥有的、可流转的、可继承的数字资产。

**目标人群**：非技术背景的普通人。不会写代码的学生、做数据分析的上班族、用 AI 做创作的人。

## 三、GitHub 仓库

- **本地代码**：`E:\My agent file\My file\.card概念\app\`（中文路径，bash 可能读不了）
- **Git 仓库**：`E:\My agent file\My file\smelt-github\`（无中文，bash 可读）
- **远程**：`https://github.com/Che-A-Lu/smelt`
- **代理**：`git config --global http.proxy http://127.0.0.1:7897`（VPN 端口 7897）

### 改代码 → 推 GitHub 流程

```bash
# 1. 改代码在 .card概念/app/ 里改
# 2. 拷到 git 仓库
powershell -Command "Copy-Item -Path 'E:\My agent file\My file\.card概念\app\src' -Destination 'E:\My agent file\My file\smelt-github\app\src' -Recurse -Force"
# 3. 提交推送
cd "E:\My agent file\My file\smelt-github"
git add -A
git commit -m "描述改动"
git push
```

**如果是 AI 助手（bash 无法访问中文路径）**：直接在 `smelt-github/app/` 下改代码，然后 git push。改完后**必须同步回 .card概念**，否则下次 Dalu 新对话读到的还是旧代码：

```bash
# 反向同步：smelt-github → .card概念
powershell -Command "Copy-Item -Path 'E:\My agent file\My file\smelt-github\app\src' -Destination 'E:\My agent file\My file\.card概念\app\src' -Recurse -Force"
```

**此后每次改代码都走这条双向路：改 smelt-github → git push → 反向拷回 .card概念。** 两处代码始终一致。

### 验证代码

```bash
cd "E:\My agent file\My file\smelt-github\app"
npm install        # 如果 node_modules 不存在
npx tsc --noEmit   # 必须零错误
npm run dev        # 启动开发服务器
```

## 四、代码架构

### 四层单向依赖

```
foundation/   （地基——不依赖任何人）
    ↓
platform/     （平台——只依赖 foundation）
    ↓
features/     （功能——只依赖 foundation + platform）
    ↓
ui/           （界面——消费一切，不被任何人依赖）
```

**铁律**：方向不可逆。违反要向 Dalu 说明理由。

### 文件地图（42 个源文件）

**foundation/**
- `types.ts` — **所有类型定义 + 常量 + InteractionConfig 默认值 + 内置 provider 列表。** 改这里会波及所有引用方。卡片尺寸（CARD_W/H）、交互参数（dragFollowRatio、cardScale、uiScale、backgroundColor、gridColor）全在此
- `i18n.ts` — 中英双语字典。`t(key)` 函数。**所有用户可见文字必须走 t()。** 新增字符串 = 在 dict 里加 zh + en 两列

**platform/**
- `storage.ts` — **唯一 OPFS 入口。** 卡片 CRUD、球管理、索引读写、会话持久化、快照读取、文件 blob 读取。只有这个文件碰文件系统
- `settings.ts` — API Key AES-GCM 加密存储、当前模型管理

**features/（每个模块只通过 index.ts 暴露接口）**
- `ai/index.ts` — AI 通讯主入口。`streamChat(modelId, messages, signal?, tools?)` 返回 AsyncGenerator。模型选择路由、错误处理
- `ai/adapters/openai.ts` — 7 个 OpenAI 兼容 provider（DeepSeek/Kimi/Qwen/Zhipu/Groq/OpenAI/custom）
- `ai/adapters/anthropic.ts` — Anthropic 原生 Messages API。消息格式转换（system 提取、tool_result 映射）、SSE event 解析
- `ai/adapters/gemini.ts` — Gemini 原生 API。role 映射（assistant→model）、functionDeclarations 格式
- `identity/index.ts` — ECDSA P-256 密钥生成/存储/签名/验签、`hashContent`、`hashSingleFile`、`exportIdentityKey`、`importIdentityKey`
- `identity/trust.ts` — localStorage 联系人信任列表。`getTrustRecord`、`setTrusted`
- `import/index.ts` — .card 解析（ZIP 解压、manifest 读取、内容校验）
- `export/index.ts` — `buildCardPackage`（JSZip 打包）、`downloadBlob`、`scanContent`（隐私扫描）、AES-256-GCM 加密/解密、密码强度
- `sandbox/index.ts` — Web Worker 沙箱。`CardSandbox.runScript(code)` 隔离执行。无 DOM、无网络、无文件系统
- `snapshot.ts` — 快照生成器。图片（Canvas 缩放）、文本（Canvas fillText）、CSV（迷你表格）
- `tool-registry.ts` — 6 个内置 tool 定义 + `buildTools`（含关键词自动推荐）+ `executeTool` + `requiresConfirmation`
- `mode/types.ts` — PipelineCard、TeamCard、OrchestratorCard 类型 + `validateModeCard`
- `mode/pipeline.ts` — 管线执行器（串行步骤、pause 暂停、contextMode）
- `mode/team.ts` — 团队执行器（并行成员、各自 persona）
- `mode/orchestrator.ts` — 编排执行器（总指挥 + model_call tool）
- `templates/index.ts` — 壳模板（导出面板用）

**ui/canvas/**
- `Canvas.tsx` — **主画布。** 无限平移/缩放、网格背景、拖放区管理、欢迎状态、多选/框选、卡片渲染、工作台浮窗管理、`registerZone` 中枢、快进预览、存储状态条
- `Minimap.tsx` — 右下小地图，≥3 张卡片时显示

**ui/card/**
- `CardView.tsx` — **卡片视图。** 拖拽物理（延迟拾起、40% 跟随、弹簧、惯性）、创建/删除动画、快照预览渲染、右键菜单、编辑模式、DetailView（详情浮层）。**拖拽行为在 `dragLoop`、`finishDrag`、`throwLoop` 三个函数中**

**ui/workbench/**
- `Workbench.tsx` — **工作台主组件。** 状态管理（消息、上下文、工具、临时文件、模式卡）、AI 发送循环（含 tool_call）、上下文注入（`buildContextMessages`）、思考链注入、会话持久化（2 秒防抖）、导出模板
- `types.ts` — WbMessage、TempFile、ContextItem、ToolItem、ZoneProps、WorkbenchSessionData
- `ContextZone.tsx` — 上下文区（标签 + 选择器 + 画布拖入 + 右键编辑）
- `ToolZone.tsx` — 工具区（标签 + 选择器 + 画布拖入 + RUN 角标）
- `FilesZone.tsx` — AI 临时文件区（建卡按钮）
- `TrayZone.tsx` — 卡片陈列区（缩略图 + 拖出）
- `HistoryZone.tsx` — 对话历史区（勾选、思考链折叠、流式输出、右键提取）
- `ContextEditDialog.tsx` — 上下文编辑浮层（注释 + 全内容/仅标题）
- `Drawer.tsx` — 左侧抽屉（按需渲染区组件）
- `ModeSlot.tsx` — 模式凹槽
- `ModeHelp.tsx` — 模式帮助面板

**ui/dock/**
- `Dock.tsx` — **卡座。** 磁吸交互（40/80px 两档）、拖入激活、拖出停用

**ui/pack/**
- `PackView.tsx` — 卡包（折叠/展开、包内缩略图、拖入出包）

**ui/panels/**
- `ExportPanel.tsx` — 打包面板（元信息、文件清单、README 生成、隐私扫描、加密/签名）
- `SettingsPanel.tsx` — 设置面板（API Key、持久化、身份密钥导出/导入、UI Scale 滑动条、卡片大小滑动条）
- `SearchPanel.tsx` — 搜索面板

**ui/dialogs/**
- `ImportDialog.tsx` — 导入流程（四步：解包→安全→签名→选择）+ 信任状态

**ui/components/**
- `ContextMenu.tsx` — 统一右键菜单组件
- `ShortcutHelp.tsx` — 快捷键帮助面板

**App.tsx** — 顶层入口。工具栏、面板路由、新建工作台、autoOpenWorkbenchId
**main.tsx** — React 渲染入口
**styles.css** — CSS 动画（cardBreathe、blinkCursor、spin、toastIn、panelIn、fadeIn）

## 五、Bug 定位指南

| 症状 | 先看 |
|------|------|
| 卡片拖拽不跟手/太慢 | `foundation/types.ts` → `dragFollowRatio`；`CardView.tsx` → `dragLoop` 的 `ratio` |
| 卡片太小/太大 | `foundation/types.ts` → `CARD_W`、`CARD_H`；`SettingsPanel.tsx` → `cardScale` 滑动条 |
| 工作台双击没反应 | `CardView.tsx` → `onDblClick` 的 `isWorkbench` 判断；`Canvas.tsx` → `openWorkbenches` Set |
| AI 没看到上下文卡片 | `Workbench.tsx` → `buildContextMessages`；确认卡片有 `sphereId` |
| AI 没调工具 | `tool-registry.ts` → `buildTools` 的关键词匹配；`KEYWORD_TOOLS` 数组 |
| 导出 .card 出错 | `export/index.ts` → `buildCardPackage`；确认卡片有 sphere |
| 导入 .card 失败 | `import/index.ts` → `parseCardFile`；`ImportDialog.tsx` → 四步流程 |
| 快照模糊 | `snapshot.ts` → quality 参数（当前 0.85）、font 字号（当前 14px）|
| 样式太乱/字号不对 | `Canvas.tsx` → 根节点 `fontSize: ${16 * uiScale}px`；各组件 `rem` 值 |
| 代理/网络错误 | git proxy 设对了吗（7897）？VPN 开了吗？ |
| 中文路径访问不了 | 用 `smelt-github/`（无中文）；或 PowerShell `Copy-Item` |

## 六、当前已知问题

1. **独立打包工具未做** —— 用户必须进空间才能创建 .card。等用户量起来再做
2. **画布底色仍偏白** —— 已改到 `#f5f5f5`，但用户反馈仍觉得太白
3. **卡片大小默认 150×210** —— 用户反馈太小。cardScale 滑动条可以调，默认值可能需要改
4. **快照只支持文本/图片/CSV** —— Excel、PDF、Word 文件回退为图标
5. **脚本沙箱只支持 JS** —— `new Function()` 执行，不支持 Python 或 WASM
6. **无实时协作** —— 单用户单浏览器
7. **npm run dev 有时端口冲突** —— Vite 会自动换端口，注意看终端输出

## 七、给新 AI 的操作清单

1. **读本文件** — 你现在在做的
2. **读 `README.md`** — 项目介绍
3. **读 `SPEC.md` 前两章** — 理解 .card 格式和交互规范
4. **跑 `npx tsc --noEmit`** — 确保零错误
5. **跑 `npm run dev`** — 确认能启动
6. **如果 Dalu 提到 bug**：按第五章的 Bug 定位指南定位文件
7. **如果 Dalu 给施工指令**：在本文档的架构地图里找到对应文件，按指令改
8. **改完代码后**：`npx tsc --noEmit` 验证 → 拷到 git 仓库 → `git add -A && git commit -m "..." && git push`
9. **回复 Dalu 时**：简洁、直接。先说问题再给方案。不要解释"什么"（代码已经很清楚了），说"为什么"

## 八、Dalu 的铁律（不可违反）

1. 一个文件只做一件事。能一句话说清楚职责
2. 不硬编码交互数字。所有参数从 `InteractionConfig` 读取
3. 功能通 ≠ 做完。必须对照交互规范逐条验证
4. 60fps 不可妥协。拖拽和滚动期间任何单帧超过 16ms = bug
5. 球不可渲染。球是 OPFS 数据实体，用户看不到
6. 卡片不分类型。行为由卡片位置决定（卡座里=通电，工作台里=AI 可见）
7. 判定只在松手。拖拽过程中不做状态变更
8. 所有用户可见文字走 `t()`。改 `foundation/i18n.ts`
9. 只有 `platform/storage.ts` 碰 OPFS
10. 四层单向引用不可逆
11. 每次改动后 `npx tsc --noEmit` 零新错误
12. 不要过度抽象。三个相似行好过一个过早的 helper

---

*本文件约 200 行。读完需要 3 分钟。读完回复 Dalu："醒来了。Smelt 就绪。"*
