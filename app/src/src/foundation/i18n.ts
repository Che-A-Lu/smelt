export type Lang = "zh" | "en";

const LANG_KEY = "card-space-lang";

const dict: Record<string, Record<Lang, string>> = {
  // 卡片
  "card.defaultLabel":       { zh: "未命名卡片",            en: "Untitled card" },
  "card.orphaned":           { zh: "数据源已删除",           en: "Data source deleted" },
  "card.interrupted":        { zh: "已中断",                en: "Interrupted" },
  "card.generating":         { zh: "生成中...",             en: "Generating..." },
  "card.hasScripts":         { zh: "包含可执行脚本",          en: "Contains executable scripts" },

  // 卡座
  "dock.empty":              { zh: "拖卡片或卡包到此处以激活",   en: "Drag cards or packs here to activate" },
  "dock.active":             { zh: "运行中",                en: "Running" },

  // 工作台
  "wb.newSession":           { zh: "新会话",                en: "New session" },
  "wb.thinking":             { zh: "思考中...",             en: "Thinking..." },
  "wb.send":                 { zh: "发给 AI",               en: "Send to AI" },
  "wb.newCard":              { zh: "新建卡片",               en: "New card" },
  "wb.archive":              { zh: "归档全部",               en: "Archive all" },
  "wb.clear":                { zh: "清除工作台",             en: "Clear workbench" },
  "wb.stop":                 { zh: "中断",                  en: "Stop" },
  "wb.retry":                { zh: "重试",                  en: "Retry" },
  "wb.interrupted":          { zh: "已中断",                en: "Interrupted" },
  "wb.thinkingTrace":        { zh: "思考过程",               en: "Thinking trace" },
  "wb.aiFiles":              { zh: "AI 文件",               en: "AI files" },
  "wb.cardTray":             { zh: "卡片陈列",               en: "Card tray" },
  "wb.toolZone":             { zh: "工具",                  en: "Tools" },
  "wb.contextOrder":         { zh: "AI 本轮会按此顺序看到：",   en: "AI will see in this order:" },
  "wb.createCard":           { zh: "建卡",                  en: "Create card" },
  "wb.startHint":            { zh: "开始对话",               en: "Start a conversation" },
  "wb.noKeyHint":            { zh: "请先在设置中配置 API Key",   en: "Configure API key in settings first" },
  "wb.roleUser":             { zh: "你",                    en: "You" },
  "wb.roleAI":               { zh: "AI",                   en: "AI" },
  "wb.inputPlaceholder":     { zh: "输入消息，Enter 发送，Shift+Enter 换行", en: "Type a message, Enter to send, Shift+Enter for new line" },
  "wb.autoMode":             { zh: "自动模式",               en: "Auto mode" },
  "wb.manualMode":           { zh: "手动模式",               en: "Manual mode" },
  "wb.confirmTitle":         { zh: "AI 想要执行 {0}",         en: "AI wants to execute {0}" },
  "wb.confirmDetail":        { zh: "修改卡片'{0}'。允许吗？",   en: "Modify card '{0}'. Allow?" },
  "wb.allow":                { zh: "允许",                  en: "Allow" },
  "wb.deny":                 { zh: "拒绝",                  en: "Deny" },
  "wb.allowAll":             { zh: "本次会话全部允许",         en: "Allow all this session" },
  "wb.toolExecuted":         { zh: "AI 调用了 {0}",          en: "AI called {0}" },
  "wb.newCardTitle":         { zh: "新建卡片",               en: "New card" },
  "wb.newCardLabel":         { zh: "卡片名称",               en: "Card name" },
  "wb.newCardType":          { zh: "类型",                  en: "Type" },
  "wb.archiveDone":          { zh: "工作记录已归档到画布",      en: "Work record archived to canvas" },
  "wb.cleared":              { zh: "工作台已清除",            en: "Workbench cleared" },
  "wb.executableScript":     { zh: "可执行脚本",             en: "Executable script" },
  "wb.modeButton":           { zh: "工作模式",               en: "Mode" },
  "wb.modePipeline":         { zh: "管线",                  en: "Pipeline" },
  "wb.modeTeam":             { zh: "团队",                  en: "Team" },
  "wb.modeOrchestrator":    { zh: "编排",                  en: "Orchestrator" },
  "wb.modeSlotHint":         { zh: "拖入工作模式卡",          en: "Drop mode card here" },
  "wb.modeInvalid":          { zh: "不是有效的工作模式卡",      en: "Not a valid mode card" },
  "wb.modePipelineDesc":     { zh: "串行步骤链。适合已知流程：数据分析→报告撰写→合规检查", en: "Sequential steps. For known workflows: analyze → report → verify" },
  "wb.modeTeamDesc":         { zh: "多角色并行。适合多视角碰撞：批评者+支持者+中立者同时评审", en: "Parallel roles. For diverse perspectives: critic + supporter + neutral" },
  "wb.modeOrchDesc":         { zh: "AI 调度。适合不确定怎么做：总指挥动态分工，中间产物可见", en: "AI orchestration. For uncertain tasks: dynamic delegation with visible intermediates" },
  "wb.modeHelpTitle":        { zh: "工作模式卡",              en: "Mode Cards" },
  "wb.modeHowTo":            { zh: "创建方式：复制示例 JSON → 在工作台里新建卡片 → 粘贴内容 → 拖入凹槽", en: "How to create: copy sample JSON → new card in workbench → paste → drag to slot" },
  "wb.ctxEditTitle":         { zh: "AI 将看到以下内容",        en: "AI will see the following content" },
  "wb.ctxEditNote":          { zh: "注释（可选）：",            en: "Note (optional):" },
  "wb.ctxEditNotePlaceholder":{ zh: "为什么放这张卡、AI 应该关注什么", en: "Why this card is here, what AI should pay attention to" },
  "wb.ctxEditContent":       { zh: "内容：",                  en: "Content:" },
  "wb.ctxEditFull":          { zh: "全内容发送",               en: "Send full content" },
  "wb.ctxEditTitleOnly":     { zh: "仅发送标题（AI 通过 card_read 获取）", en: "Send title only (AI uses card_read)" },
  "wb.ctxEditReset":         { zh: "恢复原始内容",             en: "Reset" },
  "wb.ctxEditSave":          { zh: "保存",                    en: "Save" },
  "wb.ctxEditMenuEdit":      { zh: "编辑此卡发给AI的内容",       en: "Edit how AI sees this" },
  "wb.extractCard":          { zh: "提取为卡片",               en: "Extract as card" },
  "wb.thinkLabel":           { zh: "思考链:",                 en: "Think:" },
  "wb.continueBtn":          { zh: "继续",                    en: "Continue" },
  "wb.extractedCardTitle":   { zh: "对话提取",                 en: "Extract" },
  "export.exportFile":       { zh: "导出文件",               en: "Export file" },
  "export.packCard":         { zh: "打包为 .card",            en: "Package as .card" },
  "export.packSelected":     { zh: "打包选中 {0} 张",          en: "Package {0} selected" },
  "export.panelTitle":       { zh: "打包为 .card",            en: "Package as .card" },
  "export.fileList":         { zh: "文件清单",                en: "File list" },
  "export.generateReadme":   { zh: "生成 README.md",          en: "Generate README.md" },
  "export.packDownload":     { zh: "打包下载",                en: "Package & download" },
  "export.editNote":         { zh: "修改说明（可选）：",        en: "Edit note (optional):" },
  "export.editNotePlaceholder": { zh: "更新了Q3数据，删除过时模板", en: "Updated Q3 data, removed outdated template" },
  "export.privacyScan":      { zh: "隐私扫描",                en: "Privacy scan" },
  "export.privacyIssue":     { zh: "发现 {0} 个问题",          en: "{0} issue(s) found" },
  "export.security":         { zh: "安全",                   en: "Security" },
  "export.useSignature":     { zh: "签名",                   en: "Sign" },
  "export.useEncryption":    { zh: "加密",                   en: "Encrypt" },
  "export.identity":         { zh: "身份",                   en: "Identity" },
  "export.fingerprint":      { zh: "当前指纹：{0}",            en: "Fingerprint: {0}" },
  "export.exportKey":        { zh: "导出身份密钥",             en: "Export identity key" },
  "export.importKey":        { zh: "导入身份密钥",             en: "Import identity key" },
  "export.keyImported":      { zh: "身份密钥已导入：{0}",       en: "Identity key imported: {0}" },
  "export.keyImportFailed":  { zh: "密钥导入失败",             en: "Key import failed" },
  "import.editsHistory":     { zh: "转手历史（{0} 次）",        en: "Edit history ({0})" },
  "import.firstSeen":        { zh: "首次见此签名者",           en: "First time seeing this signer" },
  "import.trusted":          { zh: "已信任（{0}次）",          en: "Trusted ({0} times)" },
  "import.trustAdd":         { zh: "加为信任联系人",           en: "Add to trusted contacts" },
  "import.trustRemove":      { zh: "移除信任",               en: "Remove trust" },
  "import.fileModified":     { zh: "文件已修改：{0}",          en: "File modified: {0}" },
  "import.fileMissing":      { zh: "文件缺失：{0}",            en: "File missing: {0}" },
  "wb.exportTemplate":       { zh: "导出模板",               en: "Export template" },
  "wb.noExportContent":      { zh: "没有可导出的内容",          en: "Nothing to export" },
  "wb.pauseHint":            { zh: "管线已暂停。检查中间结果后点击继续。", en: "Paused. Check results then continue." },
  "card.viewDetail":         { zh: "查看详情",               en: "View detail" },
  "card.cardName":           { zh: "卡片名称",               en: "Card name" },
  "export.authorLabel":      { zh: "作者",                  en: "Author" },
  "export.versionLabel":     { zh: "版本",                  en: "Version" },
  "export.tagsLabel":        { zh: "标签",                  en: "Tags" },
  "export.pwStrength":       { zh: "强度：{0}",              en: "Strength: {0}" },
  "shortcuts.title":         { zh: "键盘快捷键",              en: "Keyboard shortcuts" },
  "toast.saved":             { zh: "已保存",                en: "Saved" },
  "canvas.welcomeHint1":     { zh: "拖文件到此处，或 Ctrl+N 新建工作台", en: "Drag files here, or Ctrl+N for a new workbench" },
  "canvas.welcomeHint2":     { zh: "双击卡片打开工作台，右键卡片导出为 .card", en: "Double-click a card to open workbench, right-click to export as .card" },
  "canvas.welcomeHint3":     { zh: "这是一张无限画布——拖拽平移，滚轮缩放", en: "Infinite canvas — drag to pan, scroll to zoom" },

  // 卡包
  "pack.empty":              { zh: "空包。拖入卡片开始使用。",   en: "Empty. Drag cards here." },
  "pack.rename":             { zh: "重命名",                en: "Rename" },
  "pack.delete":             { zh: "删除包",                en: "Delete pack" },

  // 画布
  "canvas.dropHint":         { zh: "释放以导入",              en: "Drop to import" },

  // 搜索
  "search.title":            { zh: "搜索卡片",              en: "Search cards" },
  "search.placeholder":      { zh: "搜索卡片标题或标签...",     en: "Search card title or tags..." },
  "search.noResults":        { zh: "无匹配结果",             en: "No results" },

  // 设置
  "settings.title":          { zh: "AI 模型设置",            en: "AI Model Setup" },
  "settings.connected":      { zh: "已连接",                en: "Connected" },
  "settings.notConnected":   { zh: "未连接 API",             en: "No API connected" },
  "settings.model":          { zh: "模型",                  en: "Model" },
  "settings.apiKeys":        { zh: "API 密钥",              en: "API Keys" },
  "settings.customProvider": { zh: "自定义",                en: "Custom" },

  // 导出
  "export.title":            { zh: "导出工作台",             en: "Export Workbench" },
  "export.menuItem":         { zh: "导出",                  en: "Export" },
  "export.download":         { zh: "导出 .card",            en: "Export .card" },
  "export.exporting":        { zh: "打包中...",              en: "Packaging..." },

  // 导入
  "import.title":            { zh: "导入卡片",              en: "Import Card" },
  "import.parsing":          { zh: "解析中...",              en: "Parsing..." },
  "import.confirm":          { zh: "确认导入",               en: "Confirm import" },
  "import.cancel":           { zh: "取消",                  en: "Cancel" },
  "import.encrypted":        { zh: "此卡片已加密，请输入密码",    en: "This card is encrypted. Enter password." },
  "import.passwordPlaceholder": { zh: "输入密码...",         en: "Enter password..." },
  "import.badPassword":      { zh: "密码错误",               en: "Incorrect password" },
  "import.stepUnpack":       { zh: "解包",                  en: "Unpack" },
  "import.stepSecurity":     { zh: "安全检查",               en: "Security" },
  "import.stepSignature":    { zh: "签名验证",               en: "Signature" },
  "import.stepSelect":       { zh: "选择内容",               en: "Select" },
  "import.signed":           { zh: "已签名",                 en: "Signed" },
  "import.unsigned":         { zh: "未签名，来源不可验证",       en: "Unsigned, source not verifiable" },
  "import.sigOK":            { zh: "签名验证通过",             en: "Signature verified" },
  "import.sigFail":          { zh: "签名验证失败，内容可能被篡改", en: "Signature failed, content may be tampered" },
  "import.allFiles":         { zh: "全选",                  en: "Select all" },
  "import.artifactsOnly":    { zh: "仅导入产物",              en: "Artifacts only" },
  "import.processOnly":      { zh: "仅导入过程",              en: "Process only" },
  "import.badFile":          { zh: "不是有效的 .card 文件",    en: "Not a valid .card file" },
  "import.unknown":          { zh: "未知",                  en: "Unknown" },
  "import.next":             { zh: "下一步",                en: "Next" },
  "import.noIssues":         { zh: "未发现问题",              en: "No issues found" },

  // 通用
  "ui.loading":              { zh: "加载中...",              en: "Loading..." },
  "ui.settings":             { zh: "设置",                  en: "Settings" },
  "ui.search":               { zh: "搜索",                  en: "Search" },
  "ui.lang":                 { zh: "中/En",                 en: "中/En" },
  "ui.delete":               { zh: "删除",                  en: "Delete" },
  "ui.cancel":               { zh: "取消",                  en: "Cancel" },
  "ui.confirm":              { zh: "确认",                  en: "Confirm" },

  // Toast
  "toast.cardDeleted":       { zh: "卡片已删除",             en: "Card deleted" },
  "toast.saveFailed":        { zh: "保存失败",               en: "Save failed" },
  "toast.unknownError":      { zh: "未知错误",               en: "Unknown error" },
  "toast.quotaWarning":      { zh: "存储空间不足。请删除一些卡片或导出归档以释放空间。", en: "Storage full. Delete some cards or export to free up space." },
  "toast.multiTab":          { zh: "检测到另一个空间已在运行。请关闭此页面，使用已有的窗口。", en: "Another space is already open. Close this page and use the existing window." },
  "toast.filesImported":     { zh: "已导入 {0} 个文件",       en: "{0} files imported" },
  "toast.imported":          { zh: "已导入：{0}",             en: "Imported: {0}" },

  // 存储
  "storage.persistOk":       { zh: "持久化 ✓",               en: "Persist ✓" },
  "storage.persistNo":       { zh: "持久化 ✗  数据可能被清理",   en: "Persist ✗  Data may be cleaned" },
  "storage.usage":           { zh: "已用 {0}MB",             en: "{0}MB used" },

  // 右键菜单
  "ctx.export":              { zh: "导出",                  en: "Export" },
  "ctx.activate":            { zh: "激活",                  en: "Activate" },
  "ctx.removeFromPack":      { zh: "从包中移出",              en: "Remove from pack" },
  "ctx.delete":              { zh: "删除",                  en: "Delete" },
  "ctx.exportSelected":      { zh: "导出选中",               en: "Export selected" },
  "ctx.deleteSelected":      { zh: "删除选中",               en: "Delete selected" },
};

let lang: Lang = (localStorage.getItem(LANG_KEY) as Lang) ?? "zh";

export function t(key: string, ...args: string[]): string {
  let s = dict[key]?.[lang] ?? key;
  args.forEach((a, i) => { s = s.replace(`{${i}}`, a); });
  return s;
}

export function setLang(l: Lang): void {
  lang = l;
  localStorage.setItem(LANG_KEY, l);
}

export function getLang(): Lang {
  return lang;
}
