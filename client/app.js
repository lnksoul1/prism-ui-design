/**
 * Prism Dashboard — Client Application
 *
 * Handles WebSocket communication with the MCP server,
 * renders the real-time design canvas, and sends user
 * adjustments back to the server.
 */

// ===== Global State =====

let ws = null;
let currentState = null;
let activeTokenTab = "colors";
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;
const RECONNECT_DELAY = 3000;

// New feature state
let currentPlatform = "web-desktop";

// Platform presets: preview form factor + device chrome per platform
const PLATFORMS = {
  "web-desktop":     { name: "Web 桌面",   frame: "browser", device: "desktop", url: "https://prism.studio/preview" },
  "web-tablet":      { name: "Web 平板",   frame: "browser", device: "tablet",  url: "https://prism.studio/preview" },
  "web-mobile":      { name: "Web 手机",   frame: "browser", device: "mobile",  url: "https://prism.studio/preview" },
  "desktop-macos":   { name: "macOS 应用",  frame: "macos",   device: "desktop", title: "Prism Studio" },
  "desktop-windows": { name: "Windows 应用", frame: "windows", device: "desktop", title: "Prism Studio" },
  "mobile-ios":      { name: "iOS 应用",    frame: "ios",     device: "mobile",  url: "https://prism.studio" },
  "mobile-android":  { name: "Android 应用", frame: "android", device: "mobile",  url: "https://prism.studio" },
};
let draggedComponentId = null;
let currentExportFormat = "html";
let conflictCheckInterval = null;
let selectedComponentId = null;
let selectedIds = [];
let canvasZoom = 100;
// 默认自由模式：组件可任意移动/缩放（定位核心"精确自由调整"）。
// "流式"切换按钮保留，作为自动纵向排列的选项。
let canvasMode = "freeform";
let playMode = false;
let pendingDrawTool = null;
let myClientId = null;
const remoteCursors = new Map();
let lastCursorSent = 0;
const CURSOR_THROTTLE = 100;
let tokenSearchQuery = "";
let activitySearchQuery = "";
let activitySourceFilter = "";
let librarySearchQuery = "";
let currentToolTab = "library";

// ===== DOM Helpers =====

function $(id) {
  return document.getElementById(id);
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ===== i18n (F8) =====

/**
 * @typedef {Object.<string, string>} I18nDictionary
 * Bilingual i18n dictionary — zh and en MUST have identical keys.
 * Values may contain {placeholder} tokens replaced by t(key, vars).
 */

/**
 * Bilingual translation table.
 * @satisfies {{ zh: I18nDictionary, en: I18nDictionary }}
 */
const I18N = {
  zh: {
    connected: "已连接",
    disconnected: "已断开",
    connecting: "连接中",
    online: "{n} 人在线",
    layers: "图层",
    layerRenameHint: "双击重命名图层",
    libAnimations: "动效",
    libComponents: "组件",
    libInteractions: "交互",
    libInteractionsHint: "选中组件后点击，一键绑定交互",
    replaceSelected: "替换选中",
    replaceSelectedHint: "开启后点击组件块将替换画布中选中的组件（保持位置）",
    noSelectionForInteraction: "请先在画布中选中一个组件，再点击交互模板",
    activityLog: "活动日志",
    canvasLabel: "实时预览画布",
    flow: "流式",
    freeform: "自由",
    autoLayout: "自动排列",
    inspector: "属性检查器",
    designTokens: "设计令牌",
    tabColors: "色彩",
    tabType: "字体",
    tabSpacing: "间距",
    tabShadows: "阴影",
    tabRadii: "圆角",
    send: "发送",
    sent: "已发送",
    promptPlaceholder: "输入指令给 AI，如：把主色改成蓝色",
    tokenEmpty: "令牌将在 AI 初始化后出现",
    tokenEmptyCategory: "此分类暂无令牌",
    activityEmpty: "AI Agent 操作将显示在这里",
    layerEmpty: "组件图层将显示在这里",
    canvasEmpty: "等待 AI Agent 创建设计",
    canvasHint1: "AI 会通过 MCP 工具调用在此画布上构建 UI",
    canvasHint2: "你的调整会实时同步回 AI",
    ai: "AI",
    user: "用户",
    libraryLoading: "加载中...",
    inspectorEmpty: "点击画布上的组件",
    inspectorEmptyHint: "查看并编辑属性",
    noTextProps: "无文本属性",
    content: "内容",
    layout: "布局",
    animation: "动效",
    appearance: "外观",
    fill: "填充",
    textColor: "文字颜色",
    radius: "圆角",
    entry: "入场",
    hover: "悬停",
    duration: "时长",
    deleteComponent: "删除组件",
    width: "宽度",
    height: "高度",
    save: "保存",
    load: "加载",
    import: "导入",
    export: "导出",
    startDesigning: "开始你的设计",
    startWithAI: "用 AI 生成",
    startWithAIDesc: "描述需求，AI 自动搭建页面",
    startWithLibrary: "从设计库拖拽",
    startWithLibraryDesc: "把组件、风格或动效拖到画布",
    startWithTemplate: "从模板创建",
    startWithTemplateDesc: "一键生成 SaaS / 电商 / 博客等页面",
    contrastPass: "对比度检测通过",
    project: "项目",
    library: "设计库",
    versions: "版本",
    comments: "评论",
    createVersion: "+ 新建版本",
    versionEmpty: "暂无版本",
    commentEmpty: "暂无评论",
    commentPlaceholder: "评论选中的组件...",
    addComment: "添加",
    searchLibrary: "搜索组件/设计系统/动效...",
    searchActivity: "搜索操作...",
    searchTokens: "搜索令牌...",
    saveCurrent: "保存当前设计",
    projectEmpty: "暂无已保存项目",
    libTemplates: "模板",
    restoreVersion: "恢复",
    diffLatest: "对比最新",
    saveTemplate: "保存当前为模板",
    saveTemplatePrompt: "模板名称",
    savedTemplates: "已存模板",
    builtinTemplates: "内置模板",
    reload: "重新加载",
    conflictTitle: "设计已被其他客户端修改",
    openClientUi: "打开客户端界面",
    openClientUiDesc: "把 Prism 客户端 UI 导入画布进行调整",
    freeformHint: "拖动组件调整位置，拖边角调整大小",
    captureActualUi: "截取实际界面",
    captureActualUiDesc: "截取真实运行的 Dashboard 作为参考图",
    writeback: "写回",
    writebackConfirm: "将设计令牌写回 client/style.css（自动备份）并生成 design-writeback.html 预览？",
    writebackDone: "已写回 {count} 个令牌到 {files}，备份：{backup}",
    writebackError: "写回失败",
    previewMode: "预览",
    designMode: "画布",
    saveCanvas: "保存画布",
    applyCanvas: "应用到预览",
    canvasBehavior: "⚡ 交互",
    canvasBehaviorTitle: "给选中的形状/图片绑定交互（播放模式点击触发）",
    canvasBehaviorClear: "清除交互",
    canvasBehaviorNone: "请先在画布中选中一个形状或图片",
    exportCanvas: "写回页面文件",
    clearCanvas: "清空",
    canvasEditorHint: "无限画布：拖拽移动、滚轮缩放；用右侧工具栏画形状/文字/箭头/图片，完成后点“应用到预览”",
    templatePickerDesc: "选择一个起点，或直接在空白画布上开始绘制",
    tplSaaS: "SaaS 落地页",
    tplEcommerce: "电商首页",
    tplBlog: "博客文章",
    tplPortfolio: "作品集",
    tplDashboard: "数据看板",
    tplBlank: "空白画布",
    tplDescSaaS: "导航 + 首屏 + 功能 + 定价",
    tplDescEcommerce: "导航 + 首屏 + 商品 + CTA",
    tplDescBlog: "导航 + 正文 + 图片",
    tplDescPortfolio: "导航 + 首屏 + 作品",
    tplDescDashboard: "导航 + 数据 + 卡片",
    canvasSaved: "画布已保存",
    canvasApplied: "已应用到预览：{n} 个组件",
    canvasExported: "已写回页面文件：{file}",
    canvasCleared: "画布已清空",
    canvasSaveError: "保存画布失败",
    startWithCanvas: "打开画布编辑器",
    startWithCanvasDesc: "在无限画布上自由绘制、排版、加图",
    clearCanvasConfirm: "确定清空当前画布？清空后仍会自动保存空白画布。",
    canvasLoading: "画布引擎加载中…",
    canvasDrawsApplied: "已应用 {n} 条 AI 绘制",
    canvasAutoLayoutDone: "已自动排列 {n} 个形状",
    canvasComponentDropped: "已将 {name} 添加到画布",
    promptQueued: "指令已排队，等待 Agent 处理…",
    promptAccepted: "Agent 已接收指令",
    promptExecuted: "已执行：{summary}",
    helpTitle: "快捷键",
    helpGeneral: "常用",
    helpEdit: "编辑",
    scHelp: "打开快捷键帮助",
    scPalette: "打开命令面板",
    scPrompt: "聚焦指令输入",
    scCanvas: "画布 / 预览切换",
    scUndo: "撤销",
    scRedo: "重做",
    scDelete: "删除选中组件",
    cmdPlaceholder: "搜索命令或直接输入指令…",
    cmdHint: "↑↓ 选择 · Enter 执行 · Esc 关闭",
    cmdNoResults: "没有匹配的命令",
    cmdAddPage: "新建页面",
    cmdThemeDark: "切换深色模式",
    cmdThemeLight: "切换浅色模式",
    cmdTplSaaS: "应用 SaaS 模板",
    cmdTplEcommerce: "应用电商模板",
    cmdClear: "清空画布",
    cmdProject: "打开项目",
    cmdSaveProject: "保存项目",
    cmdExport: "导出代码",
    cmdCanvas: "打开画布编辑器",
    cmdScreenshot: "下载 PNG 截图",
    cmdHelp: "快捷键帮助",
    cmdUndo: "撤销",
    cmdRedo: "重做",
    chipDark: "深色模式",
    chipLight: "浅色模式",
    chipSaaS: "SaaS 模板",
    chipEcommerce: "电商模板",
    chipClear: "清空",
    inspectorPropsTab: "属性",
    inspectorCodeTab: "代码",
    copyCode: "复制代码",
    codeCopied: "已复制",
    codeLoading: "加载中…",
    codeEmpty: "暂无可复制的代码",
    libDesignSystems: "设计系统",
    dsApply: "应用",
    dsApplied: "已应用设计系统「{name}」",
    dsError: "应用设计系统失败",
    explainBtn: "解读",
    explainTitle: "用大白话解读你的设计",
    explainLoading: "解读中…",
    explainFailed: "解读失败",
    tryThese: "你可以这样说（点击试试）",
    openPreview: "新标签页打开",
    previewOpened: "已在独立标签页打开预览（可直接保存或分享这个网页文件）",
    promptNotUnderstood: "没有听懂这条指令（已排队给 AI）。你也可以直接说：",
    chipBigger: "字太小了，大一点",
    chipGlass: "玻璃拟态风格",
    chipPricing: "加一个定价表",
    chipUndo: "撤销",
    examplesHint: "或直接说一句话试试：",
    dismiss: "关闭",
    playLink: "页面跳转",
    playLinkPlaceholder: "选择目标页",
    playLinked: "点击此组件将跳转到「{page}」",
    playMode: "▶ 播放",
    playExit: "■ 退出播放",
    duplicate: "复制",
    duplicateDone: "已复制组件",
    moveUp: "上移",
    moveDown: "下移",
    zoomFit: "适应屏幕",
    zoom100: "100%",
    more: "更多",
    platform: "平台",
    toolSelect: "选择",
    toolHand: "抓手",
    toolPen: "画笔",
    toolShape: "形状",
    toolArrow: "箭头",
    toolText: "文字",
    toolNote: "便签",
    llmSettings: "AI 设置",
    llmDesc: "填写你自己的 API Key 后，直接在指令栏说需求即可让内置 AI 生成页面。Key 只保存在本机，不会上传到任何服务器。",
    llmProvider: "服务商",
    llmBaseUrl: "API 地址（OpenAI 兼容）",
    llmKey: "API Key",
    llmModel: "模型",
    llmTest: "测试连接",
    llmSave: "保存",
    llmSaved: "已保存",
    llmTesting: "正在测试…",
    llmTestOk: "连接成功：{reply}",
    llmTestFail: "连接失败：{error}",
    llmGenerating: "AI 正在生成页面…",
    llmFailed: "AI 生成失败：{error}",
    behavior: "交互",
    behaviorNone: "无",
    behaviorNavigate: "跳转页面",
    behaviorLink: "打开链接",
    behaviorToggle: "显示/隐藏",
    behaviorToast: "提示消息",
    behaviorSubmit: "表单提交",
    behaviorPrompt: "触发指令",
    behaviorUrl: "链接地址",
    behaviorTarget: "目标组件",
    behaviorMessage: "提示内容",
    behaviorPromptText: "指令内容",
    behaviorPlayHint: "在播放模式中点击生效",
    behaviorSubmitted: "表单已提交 ✓",
    behaviorToastDefault: "操作成功",
    alignLeft: "左对齐",
    alignCenterX: "水平居中",
    alignRight: "右对齐",
    alignTop: "顶对齐",
    alignCenterY: "垂直居中",
    alignBottom: "底对齐",
    distributeX: "水平分布",
    distributeY: "垂直分布",
    zFront: "置顶",
    zBack: "置底",
    importProduct: "导入你的产品",
    importProductDesc: "导入你自己做的网站或 App 页面，在画布上精确调整后，可以一键应用回产物。",
    importTabFolder: "项目文件夹",
    importTabUrl: "网页 URL",
    importTabHtml: "HTML 代码",
    importTabClient: "客户端界面",
    importTabCapture: "实际界面截图",
    importClientDesc: "把 Prism 客户端界面本身导入画布，你可以调整自己的产品 UI，再一键应用回产物。",
    importCaptureDesc: "截取真实运行的 Dashboard 界面作为参考图放入画布，边看边改。",
    importFile: "选择 HTML 文件",
    importStart: "开始导入",
    importDone: "导入完成",
    importFailed: "导入失败",
    importedBanner: "已导入：{source}（{n} 个组件）· 调整后点击「一键应用」写回产物",
    applyResultTitle: "✍ 已一键应用",
    applyResultDesc: "调整已写回产物目录，随时可以回滚。把 CSS 文件链接到你的产品 HTML 中即生效。",
    applyResultDone: "完成",
    applyAdjustments: "✍ 一键应用",
    applyRollback: "↺ 回滚上次应用",
    appliedResult: "已应用 {n} 个文件到产品目录（备份：{backup}）",
    appliedError: "应用失败",
    rolledBack: "已回滚：{file}",
    rollbackNone: "没有可回滚的备份",
  },
  en: {
    connected: "Connected",
    disconnected: "Disconnected",
    connecting: "Connecting",
    online: "{n} online",
    layers: "Layers",
    layerRenameHint: "Double-click to rename the layer",
    libAnimations: "Motion",
    libComponents: "Components",
    libInteractions: "Interactions",
    libInteractionsHint: "Select a component, then click to bind an interaction",
    replaceSelected: "Replace selected",
    replaceSelectedHint: "When on, clicking a block replaces the selected component (keeps position)",
    noSelectionForInteraction: "Select a component on the canvas first, then click an interaction template",
    activityLog: "Activity",
    canvasLabel: "Live Canvas",
    flow: "Flow",
    freeform: "Free",
    autoLayout: "Auto Layout",
    inspector: "Inspector",
    designTokens: "Tokens",
    tabColors: "Colors",
    tabType: "Type",
    tabSpacing: "Spacing",
    tabShadows: "Shadows",
    tabRadii: "Radius",
    send: "Send",
    sent: "Sent",
    promptPlaceholder: "Tell the AI what to change, e.g. make the primary color blue",
    tokenEmpty: "Tokens appear after AI initializes",
    tokenEmptyCategory: "No tokens in this category",
    activityEmpty: "AI agent actions appear here",
    layerEmpty: "Component layers appear here",
    canvasEmpty: "Waiting for the AI agent to create a design",
    canvasHint1: "The AI builds the UI here via MCP tools",
    canvasHint2: "Your edits sync back to the AI in real time",
    ai: "AI",
    user: "User",
    libraryLoading: "Loading...",
    inspectorEmpty: "Click a component on the canvas",
    inspectorEmptyHint: "View and edit properties",
    noTextProps: "No text properties",
    content: "Content",
    layout: "Layout",
    animation: "Animation",
    appearance: "Appearance",
    fill: "Fill",
    textColor: "Text color",
    radius: "Radius",
    entry: "Entry",
    hover: "Hover",
    duration: "Duration",
    deleteComponent: "Delete",
    width: "Width",
    height: "Height",
    save: "Save",
    load: "Load",
    import: "Import",
    export: "Export",
    startDesigning: "Start designing",
    startWithAI: "Generate with AI",
    startWithAIDesc: "Describe what you want, the AI builds the page",
    startWithLibrary: "Drag from the library",
    startWithLibraryDesc: "Drop components, styles, or motion onto the canvas",
    startWithTemplate: "Start from a template",
    startWithTemplateDesc: "One click: SaaS, e-commerce, blog, and more",
    contrastPass: "Contrast check passed",
    project: "Projects",
    library: "Library",
    versions: "Versions",
    comments: "Comments",
    createVersion: "+ New version",
    versionEmpty: "No versions yet",
    commentEmpty: "No comments yet",
    commentPlaceholder: "Comment on the selected component...",
    addComment: "Add",
    searchLibrary: "Search components / styles / motion...",
    searchActivity: "Search activity...",
    searchTokens: "Search tokens...",
    saveCurrent: "Save current design",
    projectEmpty: "No saved projects yet",
    libTemplates: "Templates",
    restoreVersion: "Restore",
    diffLatest: "Diff latest",
    saveTemplate: "Save current as template",
    saveTemplatePrompt: "Template name",
    savedTemplates: "Saved templates",
    builtinTemplates: "Built-in templates",
    reload: "Reload",
    conflictTitle: "The design was changed by another client",
    openClientUi: "Open client UI",
    openClientUiDesc: "Import the Prism client UI into the canvas to adjust it",
    freeformHint: "Drag components to move, drag corners to resize",
    captureActualUi: "Capture actual UI",
    captureActualUiDesc: "Screenshot the live dashboard as a reference",
    writeback: "Write back",
    writebackConfirm: "Write design tokens back to client/style.css (auto-backup) and generate design-writeback.html?",
    writebackDone: "Wrote {count} tokens to {files}. Backup: {backup}",
    writebackError: "Write-back failed",
    previewMode: "Preview",
    designMode: "Draw",
    saveCanvas: "Save canvas",
    applyCanvas: "Apply to preview",
    canvasBehavior: "⚡ Interact",
    canvasBehaviorTitle: "Bind an interaction to the selected shape/image (triggers in play mode)",
    canvasBehaviorClear: "Clear interaction",
    canvasBehaviorNone: "Select a shape or image on the canvas first",
    exportCanvas: "Write back page file",
    clearCanvas: "Clear",
    canvasEditorHint: "Infinite canvas: drag to move, scroll to zoom. Use the right toolbar to draw shapes, text, arrows, and images, then click Apply",
    templatePickerDesc: "Pick a starting point, or start drawing on a blank canvas",
    tplSaaS: "SaaS landing",
    tplEcommerce: "E-commerce home",
    tplBlog: "Blog post",
    tplPortfolio: "Portfolio",
    tplDashboard: "Dashboard",
    tplBlank: "Blank canvas",
    tplDescSaaS: "Nav + hero + features + pricing",
    tplDescEcommerce: "Nav + hero + products + CTA",
    tplDescBlog: "Nav + article + image",
    tplDescPortfolio: "Nav + hero + portfolio",
    tplDescDashboard: "Nav + stats + cards",
    canvasSaved: "Canvas saved",
    canvasApplied: "Applied {n} components to preview",
    canvasExported: "Wrote page file: {file}",
    canvasCleared: "Canvas cleared",
    canvasSaveError: "Failed to save canvas",
    startWithCanvas: "Open the drawing canvas",
    startWithCanvasDesc: "Draw, arrange, and add images on an infinite canvas",
    clearCanvasConfirm: "Clear the current canvas? The blank canvas will still be saved.",
    canvasLoading: "Canvas engine loading…",
    canvasDrawsApplied: "Applied {n} AI drawings",
    canvasAutoLayoutDone: "Arranged {n} shapes",
    canvasComponentDropped: "Added {name} to the canvas",
    promptQueued: "Prompt queued, waiting for the agent…",
    promptAccepted: "Agent accepted the prompt",
    promptExecuted: "Executed: {summary}",
    helpTitle: "Keyboard shortcuts",
    helpGeneral: "General",
    helpEdit: "Editing",
    scHelp: "Open shortcut help",
    scPalette: "Open command palette",
    scPrompt: "Focus the prompt input",
    scCanvas: "Toggle canvas / preview",
    scUndo: "Undo",
    scRedo: "Redo",
    scDelete: "Delete selected component",
    cmdPlaceholder: "Search commands or type an instruction…",
    cmdHint: "↑↓ navigate · Enter run · Esc close",
    cmdNoResults: "No matching commands",
    cmdAddPage: "New page",
    cmdThemeDark: "Switch to dark mode",
    cmdThemeLight: "Switch to light mode",
    cmdTplSaaS: "Apply SaaS template",
    cmdTplEcommerce: "Apply e-commerce template",
    cmdClear: "Clear canvas",
    cmdProject: "Open projects",
    cmdSaveProject: "Save project",
    cmdExport: "Export code",
    cmdCanvas: "Open canvas editor",
    cmdScreenshot: "Download PNG screenshot",
    cmdHelp: "Keyboard shortcut help",
    cmdUndo: "Undo",
    cmdRedo: "Redo",
    chipDark: "Dark mode",
    chipLight: "Light mode",
    chipSaaS: "SaaS template",
    chipEcommerce: "E-commerce template",
    chipClear: "Clear",
    inspectorPropsTab: "Props",
    inspectorCodeTab: "Code",
    copyCode: "Copy code",
    codeCopied: "Copied",
    codeLoading: "Loading…",
    codeEmpty: "No code available",
    libDesignSystems: "Design systems",
    dsApply: "Apply",
    dsApplied: "Applied design system \"{name}\"",
    dsError: "Failed to apply design system",
    explainBtn: "Explain",
    explainTitle: "Your design in plain language",
    explainLoading: "Explaining…",
    explainFailed: "Explain failed",
    tryThese: "Try saying (click one)",
    openPreview: "Open in new tab",
    previewOpened: "Preview opened in a separate tab (you can save or share this single-file page)",
    promptNotUnderstood: "I didn't understand that (queued for the AI). You can also say:",
    chipBigger: "Make the text bigger",
    chipGlass: "Glassmorphism style",
    chipPricing: "Add a pricing table",
    chipUndo: "Undo",
    examplesHint: "Or just say something like:",
    dismiss: "Dismiss",
    playLink: "Page link",
    playLinkPlaceholder: "Choose target page",
    playLinked: "Clicking this component opens {page}",
    playMode: "▶ Play",
    playExit: "■ Exit play",
    duplicate: "Duplicate",
    duplicateDone: "Component duplicated",
    moveUp: "Move up",
    moveDown: "Move down",
    zoomFit: "Fit to screen",
    zoom100: "100%",
    more: "More",
    platform: "Platform",
    toolSelect: "Select",
    toolHand: "Hand",
    toolPen: "Pen",
    toolShape: "Shape",
    toolArrow: "Arrow",
    toolText: "Text",
    toolNote: "Note",
    llmSettings: "AI settings",
    llmDesc: "Add your own API key and the built-in AI can generate pages right from the prompt bar. The key stays on this machine and is never uploaded.",
    llmProvider: "Provider",
    llmBaseUrl: "API base URL (OpenAI-compatible)",
    llmKey: "API key",
    llmModel: "Model",
    llmTest: "Test connection",
    llmSave: "Save",
    llmSaved: "Saved",
    llmTesting: "Testing…",
    llmTestOk: "Connected: {reply}",
    llmTestFail: "Connection failed: {error}",
    llmGenerating: "AI is generating the page…",
    llmFailed: "AI generation failed: {error}",
    behavior: "Interaction",
    behaviorNone: "None",
    behaviorNavigate: "Navigate to page",
    behaviorLink: "Open link",
    behaviorToggle: "Show / hide",
    behaviorToast: "Toast message",
    behaviorSubmit: "Submit form",
    behaviorPrompt: "Trigger instruction",
    behaviorUrl: "Link URL",
    behaviorTarget: "Target component",
    behaviorMessage: "Message",
    behaviorPromptText: "Instruction",
    behaviorPlayHint: "Triggers in play mode",
    behaviorSubmitted: "Form submitted ✓",
    behaviorToastDefault: "Done",
    alignLeft: "Align left",
    alignCenterX: "Align center X",
    alignRight: "Align right",
    alignTop: "Align top",
    alignCenterY: "Align center Y",
    alignBottom: "Align bottom",
    distributeX: "Distribute X",
    distributeY: "Distribute Y",
    zFront: "Bring to front",
    zBack: "Send to back",
    importProduct: "Import your product",
    importProductDesc: "Import a page of your own website or app, adjust it precisely on the canvas, then apply the changes back to the product with one click.",
    importTabFolder: "Project folder",
    importTabUrl: "Webpage URL",
    importTabHtml: "HTML code",
    importTabClient: "Client UI",
    importTabCapture: "Capture actual UI",
    importClientDesc: "Import the Prism client UI itself into the canvas so you can adjust your own product UI, then apply it back with one click.",
    importCaptureDesc: "Capture a screenshot of the running dashboard as a reference image on the canvas.",
    importFile: "Choose HTML file",
    importStart: "Start import",
    importDone: "Imported",
    importFailed: "Import failed",
    importedBanner: "Imported: {source} ({n} components) · adjust, then click Apply to write back",
    applyResultTitle: "✍ Applied",
    applyResultDesc: "Changes were written back to the product directory; you can roll back anytime. Link the CSS file into your product HTML to take effect.",
    applyResultDone: "Done",
    applyAdjustments: "✍ Apply",
    applyRollback: "↺ Roll back",
    appliedResult: "Applied {n} files to the product directory (backup: {backup})",
    appliedError: "Apply failed",
    rolledBack: "Rolled back: {file}",
    rollbackNone: "No backup to roll back",
  },
};

// Runtime key-parity assertion: zh and en must have identical keys.
(function assertI18nParity() {
  const zhKeys = Object.keys(I18N.zh).sort();
  const enKeys = Object.keys(I18N.en).sort();
  const zhMissing = zhKeys.filter((k) => !(k in I18N.en));
  const enMissing = enKeys.filter((k) => !(k in I18N.zh));
  if (zhMissing.length || enMissing.length) {
    console.warn(
      "[i18n] key parity violated — zh-only:", zhMissing, "en-only:", enMissing
    );
  }
})();

let uiLang = "zh";
try {
  uiLang = localStorage.getItem("prism-lang") || "zh";
} catch (err) {
  uiLang = "zh";
}

/**
 * Translate a key in the current UI language, with optional {placeholder} interpolation.
 * @param {keyof typeof I18N.zh} key - translation key (validated against zh dictionary)
 * @param {Object.<string, string|number>=} vars - placeholder values
 * @returns {string}
 */
function t(key, vars) {
  const table = I18N[uiLang] || I18N.zh;
  let text = table[key] !== undefined ? table[key] : I18N.zh[key] !== undefined ? I18N.zh[key] : key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = String(text).replace(`{${k}}`, String(v));
    });
  }
  return text;
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  const toggle = $("lang-toggle");
  if (toggle) toggle.textContent = uiLang === "zh" ? "EN" : "中";
}

function setupI18n() {
  const toggle = $("lang-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      uiLang = uiLang === "zh" ? "en" : "zh";
      try {
        localStorage.setItem("prism-lang", uiLang);
      } catch (err) {
        // ignore storage errors
      }
      applyI18n();
      setupPromptChips();
      renderHelpShortcuts();
      if (canvasEditorMode && $("canvas-editor-hint")) {
        $("canvas-editor-hint").textContent = t("canvasEditorHint");
      }
      renderCanvasTemplateCards();
      renderAll();
    });
  }
  applyI18n();
}

// ===== WebSocket Connection =====

function connect() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    reconnectAttempts = 0;
    updateStatus("connected");
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = () => {
    updateStatus("disconnected");
    if (reconnectAttempts < MAX_RECONNECT) {
      reconnectAttempts++;
      setTimeout(connect, RECONNECT_DELAY);
    }
  };

  ws.onerror = () => {
    updateStatus("disconnected");
  };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const payload = { ...msg };
    // Optimistic concurrency: attach the revision the client last saw (C5).
    if (msg.type !== "cursor" && currentState && typeof currentState.revision === "number") {
      payload.base_revision = currentState.revision;
    }
    ws.send(JSON.stringify(payload));
  }
}

function setupLiveCursors() {
  const scrollWrap = $("canvas-scroll-wrap");
  if (!scrollWrap) return;
  scrollWrap.addEventListener("mousemove", (e) => {
    const now = Date.now();
    if (now - lastCursorSent < CURSOR_THROTTLE) return;
    lastCursorSent = now;
    const frame = $("canvas-frame");
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    send({ type: "cursor", x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) });
  });
}

function renderRemoteCursors() {
  const frame = $("canvas-frame");
  if (!frame) return;
  let overlay = $("cursor-overlay");
  if (remoteCursors.size === 0) {
    if (overlay) overlay.remove();
    return;
  }
  if (!overlay) {
    overlay = el("div", "cursor-overlay");
    overlay.id = "cursor-overlay";
    frame.appendChild(overlay);
  }
  overlay.innerHTML = "";
  remoteCursors.forEach((pos, clientId) => {
    const cursor = el("div", "remote-cursor");
    cursor.style.left = pos.x + "px";
    cursor.style.top = pos.y + "px";
    cursor.appendChild(el("span", "remote-cursor-caret"));
    cursor.appendChild(el("span", "remote-cursor-label", clientId.slice(-6)));
    overlay.appendChild(cursor);
  });
}

function showConflictWarning(msg) {
  const container = $("conflict-warnings");
  if (!container) return;
  const warning = el("div", "conflict-warning");
  warning.appendChild(el("span", "warn-icon", "!"));
  const text = el("span", "warn-text", msg.message || t("conflictTitle"));
  warning.appendChild(text);
  const reload = el("button", "conflict-reload", t("reload"));
  reload.addEventListener("click", () => {
    fetchInitialState();
    warning.remove();
  });
  warning.appendChild(reload);
  container.prepend(warning);
  // Auto-resync after 8s as a safety net; the reload button is instant.
  setTimeout(() => {
    if (warning.parentNode) {
      fetchInitialState();
      warning.remove();
    }
  }, 8000);
}

function updateStatus(status) {
  const dot = $("ws-status");
  const text = $("ws-status-text");
  if (status === "connected") {
    dot.className = "status-dot connected";
    text.textContent = t("connected");
  } else if (typeof status === "number") {
    dot.className = "status-dot connected";
    text.textContent = t("online", { n: status });
  } else if (status === "disconnected") {
    dot.className = "status-dot disconnected";
    text.textContent = t("disconnected");
  } else {
    dot.className = "status-dot";
    text.textContent = t("connecting");
  }
}

// ===== Message Handler =====

function handleMessage(msg) {
  switch (msg.type) {
    case "init":
      myClientId = msg.clientId || null;
      currentState = msg.state;
      renderAll();
      if (canvasEditorMode) {
        loadCanvasIntoEditor();
      }
      break;
    case "change":
      currentState = msg.state;
      handleChange(msg.change);
      break;
    case "activity":
      addActivityEntry(msg.entry);
      break;
    case "presence":
      updateStatus(typeof msg.count === "number" ? msg.count : "connected");
      break;
    case "cursor":
      if (!msg.client_id || msg.client_id === myClientId) return;
      remoteCursors.set(msg.client_id, { x: msg.x, y: msg.y });
      renderRemoteCursors();
      break;
    case "cursor_leave":
      if (msg.client_id) remoteCursors.delete(msg.client_id);
      renderRemoteCursors();
      break;
    case "conflict":
      showConflictWarning(msg);
      break;
    case "prompt_accepted":
      setPromptStatus(t("promptAccepted"), "accepted");
      break;
    case "prompt_executed":
      setPromptStatus(t("promptExecuted", { summary: msg.summary || "" }), "accepted");
      showToastMsg(t("promptExecuted", { summary: msg.summary || "" }));
      break;
    case "prompt_result":
      // Executed prompts already arrived as prompt_executed above; here we
      // surface the engine's example instructions when it could not act.
      if (msg.llm === "generating") {
        setPromptStatus(t("llmGenerating"), "queued");
        showToastMsg(t("llmGenerating"));
        break;
      }
      if (!msg.executed) {
        setPromptStatus(t("promptQueued"), "queued");
        if (Array.isArray(msg.suggestions) && msg.suggestions.length > 0) {
          showPromptSuggestions(msg.suggestions);
        }
      }
      break;
    case "llm_error":
      setPromptStatus(t("llmFailed", { error: msg.summary || "" }), "queued");
      showToastMsg(t("llmFailed", { error: msg.summary || "" }), true);
      break;
  }
}

function handleChange(change) {
  switch (change.type) {
    case "projectName":
      $("project-name").textContent = change.value;
      break;
    case "style":
      $("style-badge").textContent = change.value;
      break;
    case "token":
      renderTokenPanel();
      applyTokensToCanvas();
      checkConflicts();
      if (canvasEditorMode && window.PrismCanvas && window.PrismCanvas.isReady()) {
        window.PrismCanvas.setDesignContext({
          tokens: currentState.tokens,
          themeMode: currentState.themeMode,
        });
      }
      break;
    case "tokenBatch":
      renderTokenPanel();
      applyTokensToCanvas();
      checkConflicts();
      if (canvasEditorMode && window.PrismCanvas && window.PrismCanvas.isReady()) {
        window.PrismCanvas.setDesignContext({
          tokens: currentState.tokens,
          themeMode: currentState.themeMode,
        });
      }
      break;
    case "addComponent":
    case "updateComponent":
    case "removeComponent":
    case "reorderComponent":
    case "reorder_component":
    case "duplicateComponent":
    case "setBehavior":
      renderCanvas();
      renderLayerPanel();
      break;
    case "setAnimation":
      renderCanvas();
      break;
    case "clearAll":
      renderAll();
      break;
    // New: undo/redo
    case "undo":
    case "redo":
      updateUndoRedoButtons();
      renderCanvas();
      break;
    // New: page management
    case "addPage":
    case "switchPage":
    case "removePage":
    case "renamePage":
      renderPageSwitcher();
      renderCanvas();
      if (canvasEditorMode) {
        loadCanvasIntoEditor();
      }
      break;
    case "canvasSave":
      // A canvas document was saved (ours or another client's). Reload the
      // drawing for the current page unless this is our own recent echo.
      if (canvasEditorMode && !canvasLoading && Date.now() - canvasOwnSaveAt > 3000) {
        loadCanvasIntoEditor();
      }
      break;
    case "canvasDraw":
      // The AI queued drawing commands: apply them live if the canvas is open.
      if (canvasEditorMode && !canvasLoading) {
        applyPendingCanvasDraws();
      }
      break;
    case "canvasDrawsCleared":
      appliedDrawIds.clear();
      break;
    // New: theme
    case "setTheme":
      applyTheme();
      break;
    default:
      // Unknown change types: re-render canvas to be safe
      renderCanvas();
      break;
  }
  // Always refresh undo/redo availability after any change
  updateUndoRedoButtons();
}

// ===== Full Render =====

function renderAll() {
  if (!currentState) return;

  // Keep the canvas platform in sync with the server state (C2 seed)
  syncPlatformFromState();

  // Header
  $("project-name").textContent = currentState.projectName || "Untitled";
  $("style-badge").textContent = currentState.style || "--";

  // Pages
  renderPageSwitcher();

  // Canvas
  renderCanvas();
  applyCanvasMode($("canvas"));

  // Layers + inspector (skip inspector rebuild while the user is editing it)
  renderLayerPanel();
  if (!isInspectorFocused()) {
    renderInspector();
  }

  // Comments reflect design-state changes
  renderComments();

  // Tokens
  renderTokenPanel();

  // Activity log
  renderActivityLog();

  // Apply token CSS variables
  applyTokensToCanvas();

  // Apply theme
  applyTheme();

  // Update undo/redo buttons
  updateUndoRedoButtons();

  // Check conflicts
  checkConflicts();

  // 导入 → 一键应用 banner
  renderImportBanner();
}

function syncPlatformFromState() {
  if (!currentState || typeof currentState.activePlatform !== "string") return;
  if (currentState.activePlatform === currentPlatform) return;
  currentPlatform = currentState.activePlatform;
  const select = $("platform-select");
  if (select && select.value !== currentPlatform) select.value = currentPlatform;
}

// Helper: get current page's components (with backward compat)
function getCurrentComponents() {
  if (!currentState) return [];
  // New multi-page structure
  if (currentState.pages && Array.isArray(currentState.pages)) {
    const page = currentState.pages.find((p) => p.id === currentState.currentPageId);
    if (page) return page.components || [];
    // fallback to first page
    if (currentState.pages.length > 0) return currentState.pages[0].components || [];
    return [];
  }
  // Legacy single-page structure
  return currentState.components || [];
}

// ===== Canvas Rendering =====

// Starter instructions shown on the empty canvas so nobody faces a blank page.
const EXAMPLE_PROMPTS = [
  { id: "color", zh: "把主色改成蓝色", en: "make the primary color blue" },
  { id: "template", zh: "生成一个 SaaS 模板", en: "generate a SaaS template" },
  { id: "font", zh: "字太小了，大一点", en: "make the text bigger" },
  { id: "bright", zh: "整体调亮一点", en: "brighten the page a bit" },
];

function examplePromptText(p) {
  return p[uiLang] || p.zh;
}

function renderCanvas() {
  const canvas = $("canvas");
  const meta = $("canvas-meta");

  const components = getCurrentComponents();

  if (!currentState || components.length === 0) {
    canvas.innerHTML = `
      <div class="canvas-placeholder">
        <div class="placeholder-guide">
          <div class="placeholder-art">◈</div>
          <h2>${t("startDesigning")}</h2>
          <p class="placeholder-hint">${t("canvasHint1")}</p>
          <div class="placeholder-actions">
            <button class="placeholder-action" id="empty-ai">
              <span class="pa-icon">✦</span>
              <span><span class="pa-title">${t("startWithAI")}</span><br><span class="pa-desc">${t("startWithAIDesc")}</span></span>
            </button>
            <button class="placeholder-action" id="empty-library">
              <span class="pa-icon">▦</span>
              <span><span class="pa-title">${t("startWithLibrary")}</span><br><span class="pa-desc">${t("startWithLibraryDesc")}</span></span>
            </button>
            <button class="placeholder-action" id="empty-template">
              <span class="pa-icon">▤</span>
              <span><span class="pa-title">${t("startWithTemplate")}</span><br><span class="pa-desc">${t("startWithTemplateDesc")}</span></span>
            </button>
            <button class="placeholder-action" id="empty-client">
              <span class="pa-icon">◈</span>
              <span><span class="pa-title">${t("openClientUi")}</span><br><span class="pa-desc">${t("openClientUiDesc")}</span></span>
            </button>
            <button class="placeholder-action" id="empty-capture">
              <span class="pa-icon">▣</span>
              <span><span class="pa-title">${t("captureActualUi")}</span><br><span class="pa-desc">${t("captureActualUiDesc")}</span></span>
            </button>
            <button class="placeholder-action" id="empty-canvas">
              <span class="pa-icon">✎</span>
              <span><span class="pa-title">${t("startWithCanvas")}</span><br><span class="pa-desc">${t("startWithCanvasDesc")}</span></span>
            </button>
          </div>
          <div class="placeholder-examples">
            <span class="examples-hint">${t("examplesHint")}</span>
            ${EXAMPLE_PROMPTS.map((p) => `<button class="example-btn" data-ex="${p.id}">${examplePromptText(p)}</button>`).join("")}
          </div>
        </div>
      </div>
    `;
    const aiBtn = $("empty-ai");
    if (aiBtn) {
      aiBtn.addEventListener("click", () => {
        const input = $("prompt-input");
        if (input) input.focus();
      });
    }
    const libBtn = $("empty-library");
    if (libBtn) {
      libBtn.addEventListener("click", () => {
        const tab = document.querySelector('.lib-tab[data-lib="components"]');
        if (tab) tab.click();
        const hint = $("canvas-drop-hint");
        if (hint) {
          hint.textContent = t("startWithLibraryDesc");
          hint.style.display = "block";
          setTimeout(() => { hint.style.display = "none"; }, 2500);
        }
      });
    }
    const tplBtn = $("empty-template");
    if (tplBtn) {
      tplBtn.addEventListener("click", async () => {
        try {
          const response = await fetch("/api/template", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template: "saas_landing" }),
          });
          if (response.ok) {
            await fetchInitialState();
          }
        } catch (err) {
          console.error("Template create failed:", err);
        }
      });
    }
    const clientBtn = $("empty-client");
    if (clientBtn) {
      clientBtn.addEventListener("click", async () => {
        try {
          const response = await fetch("/api/import-client", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (response.ok) {
            await fetchInitialState();
          }
        } catch (err) {
          console.error("Client UI import failed:", err);
        }
      });
    }
    const captureBtn = $("empty-capture");
    if (captureBtn) {
      captureBtn.addEventListener("click", async () => {
        try {
          const response = await fetch("/api/capture-client", { method: "POST" });
          if (response.ok) {
            await fetchInitialState();
          } else {
            const data = await response.json().catch(() => ({}));
            alert(data.error || "截取失败");
          }
        } catch (err) {
          console.error("Capture failed:", err);
        }
      });
    }
    const canvasBtn = $("empty-canvas");
    if (canvasBtn) {
      canvasBtn.addEventListener("click", () => {
        setCanvasEditorMode(true);
      });
    }
    document.querySelectorAll(".example-btn").forEach((btn) => {
      const ex = EXAMPLE_PROMPTS.find((p) => p.id === btn.dataset.ex);
      if (ex) {
        btn.addEventListener("click", () => sendPrompt(examplePromptText(ex)));
      }
    });
    meta.textContent = "0 个组件";
    // Apply platform class even on placeholder
    applyPlatform(canvas);
    return;
  }

  canvas.innerHTML = "";
  applyPlatform(canvas);
  const count = countComponents(components);
  meta.textContent = `${count} 个组件`;

  // 自由模式：无布局坐标的组件自动获得坐标（含子组件），保证可移动/缩放。
  if (canvasMode === "freeform") {
    ensureFreeformLayouts();
  }

  components.forEach((comp) => {
    canvas.appendChild(renderComponent(comp));
  });
  // 标尺/参考线跟随画布尺寸刷新
  renderRulers();
  renderGuides();
}

/**
 * 自由模式下，为所有缺 layout 的顶层组件分配坐标。
 * 子组件相对其父容器排列（流式），无需画布级坐标，因此不在此处递归。
 */
function ensureFreeformLayouts() {
  const canvas = $("canvas");
  const width = canvas ? Math.max(320, Math.round(canvas.getBoundingClientRect().width) - 32) : 640;
  let cursor = 16;
  for (const comp of getCurrentComponents()) {
    if (!comp.layout) {
      comp.layout = { x: 16, y: cursor, w: width, h: 140 };
      sendUpdateComponent(comp.id, {}, comp.layout);
    }
    cursor = Math.max(cursor, (comp.layout.y || 0) + (comp.layout.h || 140) + 16);
  }
}

// Apply platform width class + device chrome to canvas
function applyPlatform(canvas) {
  const pf = PLATFORMS[currentPlatform] || PLATFORMS["web-desktop"];
  const deviceClass = `device-${pf.device}`;
  canvas.classList.remove("device-desktop", "device-tablet", "device-mobile");
  canvas.classList.add(deviceClass);
  const chrome = $("platform-chrome");
  if (chrome) {
    chrome.classList.remove("device-desktop", "device-tablet", "device-mobile");
    chrome.classList.add(deviceClass);
    chrome.dataset.chrome = pf.frame;
    const top = $("chrome-top");
    const bottom = $("chrome-bottom");
    if (top) top.innerHTML = buildChromeTop(pf);
    if (bottom) bottom.innerHTML = buildChromeBottom(pf);
  }
}

function buildChromeTop(pf) {
  if (pf.frame === "browser") {
    return `<span class="chrome-dot dot-r"></span><span class="chrome-dot dot-y"></span><span class="chrome-dot dot-g"></span><span class="chrome-url">${pf.url}</span>`;
  }
  if (pf.frame === "macos") {
    return `<span class="chrome-dot dot-r"></span><span class="chrome-dot dot-y"></span><span class="chrome-dot dot-g"></span><span class="chrome-title">${pf.title}</span>`;
  }
  if (pf.frame === "windows") {
    return `<span class="chrome-title">${pf.title}</span><span class="chrome-win-controls"><span>—</span><span>☐</span><span class="win-close">✕</span></span>`;
  }
  if (pf.frame === "ios") {
    return `<span class="chrome-status-time">9:41</span><span class="chrome-status-icons">● ●● ●</span>`;
  }
  if (pf.frame === "android") {
    return `<span class="chrome-status-time">9:41</span><span class="chrome-status-icons">100%</span>`;
  }
  return "";
}

function buildChromeBottom(pf) {
  if (pf.frame === "ios") {
    return `<span class="chrome-home-indicator"></span>`;
  }
  if (pf.frame === "android") {
    return `<span class="chrome-nav-btn">◯</span><span class="chrome-nav-btn">◻</span><span class="chrome-nav-btn">△</span>`;
  }
  return "";
}

function countComponents(components) {
  let count = 0;
  for (const comp of components) {
    count++;
    if (comp.children) count += countComponents(comp.children);
  }
  return count;
}

function applyStyleProps(wrapper, props) {
  if (!props) return;
  if (props.color) wrapper.style.color = String(props.color);
  if (props.bg) wrapper.style.background = String(props.bg);
  if (props.radius !== undefined && props.radius !== null && props.radius !== "") {
    const r = String(props.radius).replace(/px$/, "");
    wrapper.style.borderRadius = r + "px";
  }
  if (props.fontSize !== undefined && props.fontSize !== null && props.fontSize !== "") {
    const f = String(props.fontSize).replace(/px$/, "");
    wrapper.style.fontSize = f + "px";
  }
  if (props.spacing !== undefined && props.spacing !== null && props.spacing !== "") {
    const s = String(props.spacing).replace(/px$/, "");
    wrapper.style.padding = s + "px";
  }
}

function renderComponent(comp) {
  const wrapper = el("div", "comp-wrapper");
  wrapper.dataset.id = comp.id;
  applyStyleProps(wrapper, comp.props);
  if (comp.visible === false) {
    wrapper.style.display = "none";
  }
  wrapper.addEventListener("click", (e) => {
    // Ignore clicks on overlay controls and active inline editing
    if (e.target.closest(".comp-delete") || e.target.closest(".comp-drag-handle")) return;
    if (e.target.closest("[contenteditable='true']")) return;
    // 子组件点击不再冒泡到父组件：否则选中的是父组件，内部组成部分无法调整。
    e.stopPropagation();
    // Play mode: dispatch the bound behavior (行为模型 P1), with a legacy
    // fallback to page links saved by older versions.
    if (playMode) {
      if (hasClickableBehavior(comp)) {
        dispatchBehavior(comp);
      } else {
        const link = ((currentState && currentState.pageLinks) || []).find(
          (l) => l.source_component_id === comp.id
        );
        if (link && link.to_page_id && link.to_page_id !== (currentState && currentState.currentPageId)) {
          send({ type: "switch_page", pageId: link.to_page_id });
        }
      }
      return;
    }
    selectComponent(comp.id, e.shiftKey);
  });

  let dragHandle = null;

  if (playMode) {
    // Components with a behavior (or a legacy page link) are click-through.
    if (hasClickableBehavior(comp)) {
      wrapper.classList.add("play-linked");
    } else {
      const link = ((currentState && currentState.pageLinks) || []).find(
        (l) => l.source_component_id === comp.id
      );
      if (link && link.to_page_id) wrapper.classList.add("play-linked");
    }
  } else {
    // Overlay with badge, drag handle, and delete button
    const overlay = el("div", "comp-overlay");
    const badge = el("span", "comp-badge", `${comp.type}${comp.variant ? "/" + comp.variant : ""}`);
    overlay.appendChild(badge);

    // Drag handle for reorder (instead of making entire wrapper draggable)
    dragHandle = el("span", "comp-drag-handle", "⠿");
    dragHandle.title = "拖拽排序";
    dragHandle.draggable = true;
    overlay.appendChild(dragHandle);

    const deleteBtn = el("button", "comp-delete", "删除");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteComponent(comp.id);
    });
    overlay.appendChild(deleteBtn);

    wrapper.appendChild(overlay);
  }

  // Render the actual component
  const content = renderComponentContent(comp);
  if (content) wrapper.appendChild(content);

  // Freeform layout: absolute positioning + drag/resize
  if (canvasMode === "freeform" && comp.layout) {
    const L = comp.layout;
    wrapper.style.position = "absolute";
    wrapper.style.left = L.x + "px";
    wrapper.style.top = L.y + "px";
    if (L.w > 0) wrapper.style.width = L.w + "px";
    if (L.h > 0) wrapper.style.minHeight = L.h + "px";
    if (!comp.locked) {
      attachFreeformDrag(wrapper, comp.id);
      attachResizeHandles(wrapper, comp.id);
    }
  }

  // Apply animation if set
  if (comp.animation) {
    applyAnimation(wrapper, comp.animation);
  }

  // Render children if any
  if (comp.children && comp.children.length > 0) {
    comp.children.forEach((child) => {
      wrapper.appendChild(renderComponent(child));
    });
  }

  if (!playMode) {
    // Attach drag & drop handlers (using drag handle, not wrapper)
    attachDragHandlers(wrapper, comp.id, dragHandle);
    // Setup inline editing for data-editable elements
    setupInlineEditing(wrapper, comp.id);
  }

  if (comp.id === selectedComponentId) {
    wrapper.classList.add("selected");
  }

  return wrapper;
}

// ===== Freeform Canvas (B6) =====

function attachFreeformDrag(wrapper, compId) {
  wrapper.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    // Only exclude actual controls; dragging from the badge/overlay strip is allowed.
    if (e.target.closest(".comp-delete") || e.target.closest(".comp-drag-handle")) return;
    if (e.target.closest(".resize-handle")) return;
    if (e.target.closest("[contenteditable='true']")) return;
    // 内联编辑文字：mousedown 不启动拖动，否则双击编辑会被打断。
    if (e.target.closest("[data-editable='true']")) return;
    e.preventDefault();
    selectComponent(compId);
    const startX = e.clientX;
    const startY = e.clientY;
    const comp = getCompById(compId);
    const origX = (comp && comp.layout ? comp.layout.x : 0);
    const origY = (comp && comp.layout ? comp.layout.y : 0);
    const origW = (comp && comp.layout ? comp.layout.w : 0);
    const origH = (comp && comp.layout ? comp.layout.h : 0);
    wrapper.style.transition = "none";

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      // 吸附 (snapping): align to guides / canvas edges / other components.
      const snapped = snapLayout(
        { x: Math.max(0, origX + dx), y: Math.max(0, origY + dy), w: origW, h: origH },
        compId,
        { all: true }
      );
      wrapper.style.left = snapped.x + "px";
      wrapper.style.top = snapped.y + "px";
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      wrapper.style.transition = "";
      clearSnapLines();
      const x = parseFloat(wrapper.style.left) || 0;
      const y = parseFloat(wrapper.style.top) || 0;
      const compNow = getCompById(compId);
      sendUpdateComponent(compId, {}, { x, y });
      if (compNow) {
        compNow.layout = { ...(compNow.layout || {}), x, y };
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

const RESIZE_DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

function attachResizeHandles(wrapper, compId) {
  RESIZE_DIRS.forEach((dir) => {
    const handle = el("div", `resize-handle rh-${dir}`);
    handle.dataset.dir = dir;
    handle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const comp = getCompById(compId);
      const L = comp && comp.layout ? { ...comp.layout } : { x: 0, y: 0, w: 0, h: 0 };

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let { x, y, w, h } = L;
        if (dir.includes("e")) w = Math.max(60, (L.w || 320) + dx);
        if (dir.includes("s")) h = Math.max(40, (L.h || 140) + dy);
        if (dir.includes("w")) {
          w = Math.max(60, (L.w || 320) - dx);
          x = (L.x || 0) + ((L.w || 320) - w);
        }
        if (dir.includes("n")) {
          h = Math.max(40, (L.h || 140) - dy);
          y = (L.y || 0) + ((L.h || 140) - h);
        }
        // 吸附 (snapping): only the edges being moved snap.
        const edges = {
          left: dir.includes("w"),
          right: dir.includes("e"),
          top: dir.includes("n"),
          bottom: dir.includes("s"),
        };
        const snapped = snapLayout({ x, y, w, h }, compId, edges);
        ({ x, y, w, h } = snapped);
        wrapper.style.left = x + "px";
        wrapper.style.top = y + "px";
        wrapper.style.width = w + "px";
        wrapper.style.minHeight = h + "px";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        clearSnapLines();
        const rect = wrapper.getBoundingClientRect();
        const canvasRect = $("canvas").getBoundingClientRect();
        const layout = {
          x: Math.round(rect.left - canvasRect.left),
          y: Math.round(rect.top - canvasRect.top),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        };
        sendUpdateComponent(compId, {}, layout);
        const compNow = getCompById(compId);
        if (compNow) compNow.layout = layout;
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    wrapper.appendChild(handle);
  });
}

// ===== 精确编辑 P0: 标尺 / 参考线 / 吸附 =====

/** Session-scoped guides (canvas units, same space as comp.layout). */
let canvasGuides = { h: [], v: [] };
const SNAP_THRESHOLD = 5; // canvas px

function rulerZoom() {
  return (canvasZoom || 100) / 100;
}

/** Frame's on-screen position in wrap-logical coords (zoom/scroll independent). */
function frameRectInWrap() {
  const wrap = $("canvas-scroll-wrap");
  const frame = $("canvas-frame");
  if (!wrap || !frame) return null;
  const wrapRect = wrap.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const z = rulerZoom();
  return {
    left: (frameRect.left - wrapRect.left) / z,
    top: (frameRect.top - wrapRect.top) / z,
    width: frameRect.width / z,
    height: frameRect.height / z,
  };
}

function renderRulers() {
  const h = $("ruler-h");
  const v = $("ruler-v");
  const frame = frameRectInWrap();
  if (!h || !v || !frame) return;
  // Rulers are pinned at the viewport top-left (sticky stage); the frame
  // scrolls beneath. Ticks offset by the frame's current position so labels
  // stay aligned with canvas coordinates (all in wrap-logical px; CSS zoom
  // scales ruler + frame together).
  h.style.left = Math.max(0, frame.left) + "px";
  h.style.width = frame.width + "px";
  v.style.top = Math.max(0, frame.top) + "px";
  v.style.height = frame.height + "px";

  const STEP = 50;
  let hHtml = "";
  for (let x = 0; x <= frame.width; x += STEP) {
    const major = x % 100 === 0;
    const pos = x + Math.max(0, frame.left);
    hHtml += `<div class="ruler-line" style="left:${pos}px;${major ? "height:100%" : "height:6px"}"></div>`;
    if (major && x > 0) hHtml += `<div class="ruler-tick" style="left:${pos}px">${x}</div>`;
  }
  h.innerHTML = hHtml;
  let vHtml = "";
  for (let y = 0; y <= frame.height; y += STEP) {
    const major = y % 100 === 0;
    const pos = y + Math.max(0, frame.top);
    vHtml += `<div class="ruler-line" style="top:${pos}px;${major ? "width:100%" : "width:6px"}"></div>`;
    if (major && y > 0) vHtml += `<div class="ruler-tick" style="top:${pos}px">${y}</div>`;
  }
  v.innerHTML = vHtml;
}

function renderGuides() {
  const layer = $("canvas-guides");
  if (!layer) return;
  // Preserve snap lines while re-rendering guides.
  layer.querySelectorAll(".canvas-guide").forEach((g) => g.remove());
  canvasGuides.h.forEach((y) => {
    const el = el("div", "canvas-guide guide-h");
    el.style.top = y + "px";
    el.dataset.axis = "h";
    el.dataset.pos = String(y);
    attachGuideDrag(el, "h", y);
    layer.appendChild(el);
  });
  canvasGuides.v.forEach((x) => {
    const el = el("div", "canvas-guide guide-v");
    el.style.left = x + "px";
    el.dataset.axis = "v";
    el.dataset.pos = String(x);
    attachGuideDrag(el, "v", x);
    layer.appendChild(el);
  });
}

function clearSnapLines() {
  const layer = $("canvas-guides");
  if (layer) layer.querySelectorAll(".canvas-snap-line").forEach((s) => s.remove());
}

function showSnapLine(axis, pos) {
  const layer = $("canvas-guides");
  if (!layer) return;
  clearSnapLines();
  const line = el("div", "canvas-snap-line " + (axis === "h" ? "snap-h" : "snap-v"));
  if (axis === "h") line.style.top = pos + "px";
  else line.style.left = pos + "px";
  layer.appendChild(line);
}

/** Create a guide by dragging out of a ruler. */
function startGuideFromRuler(axis) {
  const frame = frameRectInWrap();
  if (!frame) return;
  const layer = $("canvas-guides");
  if (!layer) return;
  const guide = el("div", "canvas-guide guide-" + axis);
  guide.classList.add("dragging");
  const move = (ev) => {
    const z = rulerZoom();
    if (axis === "h") {
      const y = Math.round((ev.clientY - layer.getBoundingClientRect().top) / z);
      guide.style.top = Math.max(0, y) + "px";
    } else {
      const x = Math.round((ev.clientX - layer.getBoundingClientRect().left) / z);
      guide.style.left = Math.max(0, x) + "px";
    }
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    guide.classList.remove("dragging");
    guide.remove();
    const pos = axis === "h" ? parseFloat(guide.style.top) : parseFloat(guide.style.left);
    if (Number.isFinite(pos)) {
      canvasGuides[axis].push(pos);
      canvasGuides[axis].sort((a, b) => a - b);
      renderGuides();
    }
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
  layer.appendChild(guide);
}

/** Drag an existing guide to move it; dragging onto the ruler strip deletes it. */
function attachGuideDrag(guideEl, axis, initial) {
  let startClient = 0;
  let startPos = initial;
  guideEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    startClient = axis === "h" ? e.clientY : e.clientX;
    startPos = initial;
    guideEl.classList.add("dragging");
    const z = rulerZoom();
    const move = (ev) => {
      const d = ((axis === "h" ? ev.clientY : ev.clientX) - startClient) / z;
      const next = startPos + d;
      if (axis === "h") guideEl.style.top = next + "px";
      else guideEl.style.left = next + "px";
      // Dragging onto the ruler strip (negative coordinate) deletes on release.
      guideEl.dataset.draggingOut = String(next < 0);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      guideEl.classList.remove("dragging");
      if (guideEl.dataset.draggingOut === "true") {
        canvasGuides[axis] = canvasGuides[axis].filter((p) => Math.abs(p - startPos) > 0.01);
        renderGuides();
        return;
      }
      const pos = axis === "h" ? parseFloat(guideEl.style.top) : parseFloat(guideEl.style.left);
      if (Number.isFinite(pos)) {
        const idx = canvasGuides[axis].findIndex((p) => Math.abs(p - startPos) < 0.01);
        const value = Math.max(0, Math.round(pos));
        if (idx >= 0) canvasGuides[axis][idx] = value;
        guideEl.style[axis === "h" ? "top" : "left"] = value + "px";
        guideEl.dataset.pos = String(value);
      }
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
  // Double-click removes the guide.
  guideEl.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    canvasGuides[axis] = canvasGuides[axis].filter((p) => Math.abs(p - startPos) > 0.01);
    renderGuides();
  });
}

function setupRulersAndGuides() {
  const wrap = $("canvas-scroll-wrap");
  if (!wrap) return;
  // Re-render rulers on scroll (throttled) so ticks follow the frame.
  let ticking = false;
  wrap.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      renderRulers();
    });
  });
  window.addEventListener("resize", renderRulers);
  // Drag guides out of the rulers.
  const hRuler = $("ruler-h");
  const vRuler = $("ruler-v");
  if (hRuler) {
    hRuler.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startGuideFromRuler("h");
    });
  }
  if (vRuler) {
    vRuler.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startGuideFromRuler("v");
    });
  }
}

// ===== 吸附 (snapping) =====

/** Collect snap candidates for an axis in canvas units. */
function snapCandidates(axis, skipId) {
  const cands = new Set(canvasGuides[axis === "x" ? "v" : "h"]);
  const frame = frameRectInWrap();
  const frameW = frame ? frame.width : 800;
  const frameH = frame ? frame.height : 600;
  if (axis === "x") {
    cands.add(0);
    cands.add(frameW / 2);
    cands.add(frameW);
  } else {
    cands.add(0);
    cands.add(frameH / 2);
    cands.add(frameH);
  }
  findAllComponents(getCurrentComponents())
    .filter((c) => c.id !== skipId && c.layout)
    .forEach((c) => {
      const L = c.layout;
      if (axis === "x") {
        cands.add(L.x);
        cands.add(L.x + (L.w || 0) / 2);
        cands.add(L.x + (L.w || 0));
      } else {
        cands.add(L.y);
        cands.add(L.y + (L.h || 0) / 2);
        cands.add(L.y + (L.h || 0));
      }
    });
  return [...cands].filter((v) => Number.isFinite(v));
}

/**
 * Snap a value to the nearest candidate within the threshold.
 * Returns { value, snapped } where snapped is the candidate (or null).
 */
function snapValue(value, candidates) {
  let best = null;
  let bestDist = SNAP_THRESHOLD;
  for (const cand of candidates) {
    const d = Math.abs(value - cand);
    if (d <= bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best === null ? { value, snapped: null } : { value: best, snapped: best };
}

/**
 * Snap a freeform drag: given the proposed layout and which edges matter
 * (all for move; subset for resize), align to guides/edges and return the
 * adjusted layout plus snap lines to display.
 */
function snapLayout(layout, compId, edges) {
  const z = rulerZoom();
  const xCands = snapCandidates("x", compId);
  const yCands = snapCandidates("y", compId);
  let { x, y, w, h } = layout;
  let lineH = null;
  let lineV = null;
  const wantX = edges.x || edges.all;
  const wantY = edges.y || edges.all;
  if (wantX) {
    const edgesX = [];
    if (edges.left || edges.all) edgesX.push({ edge: x, key: "left" });
    if (edges.centerX || edges.all) edgesX.push({ edge: x + (w || 0) / 2, key: "cx" });
    if (edges.right || edges.all) edgesX.push({ edge: x + (w || 0), key: "right" });
    let bestDx = null;
    for (const { edge, key } of edgesX) {
      const res = snapValue(edge, xCands);
      if (res.snapped !== null) {
        const dx = res.snapped - edge;
        if (bestDx === null || Math.abs(dx) < Math.abs(bestDx)) bestDx = dx;
        lineV = res.snapped;
      }
    }
    if (bestDx !== null) x = x + bestDx;
  }
  if (wantY) {
    const edgesY = [];
    if (edges.top || edges.all) edgesY.push({ edge: y, key: "top" });
    if (edges.centerY || edges.all) edgesY.push({ edge: y + (h || 0) / 2, key: "cy" });
    if (edges.bottom || edges.all) edgesY.push({ edge: y + (h || 0), key: "bottom" });
    let bestDy = null;
    for (const { edge } of edgesY) {
      const res = snapValue(edge, yCands);
      if (res.snapped !== null) {
        const dy = res.snapped - edge;
        if (bestDy === null || Math.abs(dy) < Math.abs(bestDy)) bestDy = dy;
        lineH = res.snapped;
      }
    }
    if (bestDy !== null) y = y + bestDy;
  }
  if (lineH !== null) showSnapLine("h", lineH);
  if (lineV !== null) showSnapLine("v", lineV);
  return { x, y, w, h };
}

function getCompById(id) {
  if (!currentState) return null;
  return findCompDeep(getCurrentComponents(), id);
}

function findCompDeep(nodes, id) {
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findCompDeep(node.children, id);
    if (found) return found;
  }
  return null;
}

function findAllComponents(nodes) {
  const out = [];
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

// ===== Behavior model (P1): dispatch an interaction in play mode =====

function dispatchBehavior(comp) {
  const b = comp && comp.behavior;
  if (!b || !b.type) return;
  switch (b.type) {
    case "navigate":
      if (b.page_id && b.page_id !== (currentState && currentState.currentPageId)) {
        send({ type: "switch_page", pageId: b.page_id });
      }
      break;
    case "link":
      if (b.url) {
        window.open(b.url, b.new_tab === false ? "_self" : "_blank", "noopener");
      }
      break;
    case "toggle": {
      if (!b.target_component_id) break;
      const target = findCompDeep(getCurrentComponents(), b.target_component_id);
      if (target) {
        send({
          type: "update_component",
          id: target.id,
          props: {},
          visible: target.visible === false,
        });
      }
      break;
    }
    case "toast":
      showToastMsg(b.message || t("behaviorToastDefault"));
      break;
    case "submit":
      showToastMsg(t("behaviorSubmitted"));
      break;
    case "prompt":
      if (b.prompt) sendPrompt(b.prompt);
      break;
    default:
      break;
  }
}

function hasClickableBehavior(comp) {
  return !!(comp && comp.behavior && comp.behavior.type);
}

function sendUpdateComponent(id, props, layout) {
  send({ type: "update_component", id, props: props || {}, layout: layout || undefined });
}

function applyCanvasMode(canvas) {
  if (!canvas) return;
  canvas.classList.toggle("canvas-freeform", canvasMode === "freeform");
  const wrap = $("canvas-scroll-wrap");
  if (wrap) wrap.classList.toggle("freeform-active", canvasMode === "freeform");
  const btn = $("layout-mode-btn");
  if (btn) btn.textContent = canvasMode === "freeform" ? t("freeform") : t("flow");
  if (canvasMode === "freeform") {
    renderRulers();
    renderGuides();
  }
}

function initializeFreeformLayouts() {
  const canvas = $("canvas");
  const width = canvas ? Math.max(320, Math.round(canvas.getBoundingClientRect().width) - 32) : 640;
  let cursor = 16;
  // 顶层组件按列排列获得布局坐标（子组件相对父容器流式排列）。
  getCurrentComponents().forEach((comp) => {
    if (!comp.layout) {
      const layout = { x: 16, y: cursor, w: width, h: 140 };
      comp.layout = layout;
      sendUpdateComponent(comp.id, {}, layout);
    }
    cursor += (comp.layout.h || 140) + 16;
  });
}

function autoLayout() {
  const canvas = $("canvas");
  const width = canvas ? Math.max(320, Math.round(canvas.getBoundingClientRect().width) - 32) : 640;
  let cursor = 16;
  getCurrentComponents().forEach((comp) => {
    const layout = { x: 16, y: cursor, w: width, h: comp.layout && comp.layout.h ? comp.layout.h : 140 };
    comp.layout = layout;
    sendUpdateComponent(comp.id, {}, layout);
    cursor += layout.h + 16;
  });
}

function setupCanvasMode() {
  const modeBtn = $("layout-mode-btn");
  if (modeBtn) {
    modeBtn.addEventListener("click", () => {
      canvasMode = canvasMode === "flow" ? "freeform" : "flow";
      if (canvasMode === "freeform") {
        initializeFreeformLayouts();
        const hint = $("canvas-drop-hint");
        if (hint) {
          hint.textContent = t("freeformHint");
          hint.style.display = "block";
          setTimeout(() => { hint.style.display = "none"; }, 3000);
        }
      }
      renderCanvas();
      renderInspector();
      applyCanvasMode($("canvas"));
    });
  }
  const autoBtn = $("auto-layout-btn");
  if (autoBtn) {
    autoBtn.addEventListener("click", () => {
      if (canvasMode !== "freeform") {
        canvasMode = "freeform";
      }
      autoLayout();
      renderCanvas();
      applyCanvasMode($("canvas"));
    });
  }
  applyCanvasMode($("canvas"));
}

// ===== Selection / Inspector / Layers / Zoom =====

function getSelectedComp() {
  if (!selectedComponentId || !currentState) return null;
  return findCompDeep(getCurrentComponents(), selectedComponentId);
}

/** 子组件的父级路径（"parent → child"），用于检查器标识内部组成部分。 */
function componentParentPath(id) {
  if (!currentState) return null;
  const parts = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.id === id) {
        parts.push(node.type);
        return true;
      }
      if (node.children && node.children.length > 0) {
        parts.push(node.type);
        if (walk(node.children)) return true;
        parts.pop();
      }
    }
    return false;
  };
  if (walk(getCurrentComponents()) && parts.length > 1) {
    return "↳ " + parts.join(" / ");
  }
  return null;
}

function getSelectedComps() {
  if (!currentState || selectedIds.length === 0) return [];
  const all = getCurrentComponents();
  return selectedIds
    .map((id) => findCompDeep(all, id))
    .filter(Boolean);
}

function selectComponent(id, additive) {
  if (additive) {
    const idx = selectedIds.indexOf(id);
    if (idx >= 0) {
      selectedIds.splice(idx, 1);
    } else {
      selectedIds.push(id);
    }
    if (selectedIds.length === 0) {
      selectedComponentId = null;
    } else if (!selectedIds.includes(selectedComponentId)) {
      selectedComponentId = selectedIds[selectedIds.length - 1];
    }
  } else {
    selectedIds = [id];
    selectedComponentId = id;
  }
  document.querySelectorAll(".comp-wrapper.selected").forEach((w) => w.classList.remove("selected"));
  selectedIds.forEach((sid) => {
    const wrapper = document.querySelector(`.comp-wrapper[data-id="${CSS.escape(sid)}"]`);
    if (wrapper) wrapper.classList.add("selected");
  });
  renderInspector();
  renderLayerPanel();
  renderComments();
  renderSelectionToolbar();
}

function deselectAll() {
  selectedComponentId = null;
  selectedIds = [];
  document.querySelectorAll(".comp-wrapper.selected").forEach((w) => w.classList.remove("selected"));
  renderInspector();
  renderLayerPanel();
  renderSelectionToolbar();
}

// ===== Selection floating toolbar (Pixso/Figma-style contextual actions) =====

const ALIGN_ACTIONS = [
  ["left", "⇤", "alignLeft"],
  ["center_x", "⇹", "alignCenterX"],
  ["right", "⇥", "alignRight"],
  ["top", "⇧", "alignTop"],
  ["center_y", "⇵", "alignCenterY"],
  ["bottom", "⇩", "alignBottom"],
  ["distribute_x", "⋮⇤⇥", "distributeX"],
  ["distribute_y", "⋮⇧⇩", "distributeY"],
];

function renderSelectionToolbar() {
  const bar = $("selection-toolbar");
  if (!bar) return;
  bar.innerHTML = "";
  const comps = getSelectedComps();
  if (comps.length === 0) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "flex";

  const add = (label, icon, fn, title) => {
    const btn = el("button", "sel-tool-btn", icon);
    btn.type = "button";
    btn.title = title || label;
    btn.addEventListener("click", fn);
    bar.appendChild(btn);
  };

  if (comps.length === 1) {
    const comp = comps[0];
    add(t("duplicate"), "⧉", () => duplicateSelected(comp.id), t("duplicate") + " (Ctrl+D)");
    add(t("moveUp"), "↑", () => moveSelected(comp.id, -1), t("moveUp"));
    add(t("moveDown"), "↓", () => moveSelected(comp.id, +1), t("moveDown"));
    add(t("zFront"), "⤒", () => zOrderSelected(comp.id, "front"), t("zFront"));
    add(t("zBack"), "⤓", () => zOrderSelected(comp.id, "back"), t("zBack"));
    add(t("deleteComponent"), "✕", () => {
      handleDeleteComponent(comp.id);
      deselectAll();
    }, t("deleteComponent"));
  } else {
    // Multi-select: alignment / distribution (freeform only) + bulk delete
    const ids = comps.map((c) => c.id);
    if (canvasMode === "freeform") {
      ALIGN_ACTIONS.forEach(([mode, icon, key]) => {
        add(t(key), icon, () => alignSelected(ids, mode), t(key));
      });
    }
    add(t("deleteComponent"), "✕", () => {
      ids.forEach((id) => handleDeleteComponent(id));
      deselectAll();
    }, t("deleteComponent"));
  }
}

function alignSelected(ids, mode) {
  fetch("/api/align", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, mode }),
  })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .catch((err) => console.error("Align failed:", err));
}

function zOrderSelected(id, mode) {
  fetch(`/api/component/${id}/z-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  }).catch((err) => console.error("Z-order failed:", err));
}

function duplicateSelected(id) {
  send({ type: "duplicate_component", id });
  showToastMsg(t("duplicateDone"));
}

function moveSelected(id, delta) {
  const components = getCurrentComponents();
  const idx = components.findIndex((c) => c.id === id);
  if (idx === -1) return;
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= components.length) return;
  send({
    type: "reorder_component",
    fromId: id,
    toId: components[targetIdx].id,
    position: delta < 0 ? "before" : "after",
  });
}

function isInspectorFocused() {
  const active = document.activeElement;
  return !!active && !!active.closest && !!active.closest("#inspector-body");
}

function renderInspector() {
  const panel = $("inspector-body");
  if (!panel) return;
  const comp = getSelectedComp();

  if (!comp) {
    panel.innerHTML = `
      <div class="inspector-empty">
        <div class="inspector-empty-icon">◈</div>
    <p>${t("inspectorEmpty")}</p>
    <p class="inspector-empty-hint">${t("inspectorEmptyHint")}</p>
      </div>`;
    return;
  }

  panel.innerHTML = "";
  const tabs = el("div", "inspector-tabs");
  const propsBtn = el("button", "inspector-tab active", t("inspectorPropsTab"));
  propsBtn.type = "button";
  const codeBtn = el("button", "inspector-tab", t("inspectorCodeTab"));
  codeBtn.type = "button";
  tabs.appendChild(propsBtn);
  tabs.appendChild(codeBtn);
  panel.appendChild(tabs);
  const content = el("div", "inspector-tab-content");
  panel.appendChild(content);
  renderInspectorProps(content, comp);

  propsBtn.addEventListener("click", () => {
    codeBtn.classList.remove("active");
    propsBtn.classList.add("active");
    renderInspectorProps(content, comp);
  });
  codeBtn.addEventListener("click", () => {
    propsBtn.classList.remove("active");
    codeBtn.classList.add("active");
    renderInspectorCode(content, comp);
  });
}

function renderInspectorProps(panel, comp) {
  const props = comp.props || {};

  // Header
  const header = el("div", "inspector-section");
  const title = el("div", "inspector-section-title");
  title.textContent = `${comp.type}${comp.variant ? " / " + comp.variant : ""}`;
  header.appendChild(title);
  const idLine = el("div", "inspector-id", `ID: ${comp.id}`);
  header.appendChild(idLine);
  // 子组件显示父级路径，让用户知道正在调整内部组成部分
  const parentPath = componentParentPath(comp.id);
  if (parentPath) {
    const pathLine = el("div", "inspector-id inspector-parent-path", parentPath);
    pathLine.style.opacity = "0.7";
    header.appendChild(pathLine);
  }
  panel.appendChild(header);

  // Appearance (Pixso-style fill / text / radius) — always available.
  const appearance = el("div", "inspector-section");
  appearance.appendChild(el("div", "inspector-section-title", t("appearance")));
  const addAppearanceColor = (label, key) => {
    const row = el("div", "prop-row");
    row.appendChild(el("div", "prop-label", label));
    const group = el("div", "prop-color-row");
    const swatch = el("div", "prop-color-swatch");
    swatch.style.background = props[key] || "transparent";
    const input = el("input", "prop-text-input");
    input.value = props[key] || "";
    input.spellcheck = false;
    input.placeholder = "#hex";
    input.addEventListener("input", () => {
      swatch.style.background = input.value || "transparent";
    });
    input.addEventListener("change", () => {
      sendUpdateComponent(comp.id, { [key]: input.value });
      if (input.value) swatch.style.background = input.value;
    });
    group.appendChild(swatch);
    group.appendChild(input);
    row.appendChild(group);
    appearance.appendChild(row);
  };
  addAppearanceColor(t("fill"), "bg");
  addAppearanceColor(t("textColor"), "color");
  const radiusRow = el("div", "prop-row");
  radiusRow.appendChild(el("div", "prop-label", t("radius")));
  const radiusInput = el("input", "prop-text-input");
  radiusInput.value = props.radius || "";
  radiusInput.placeholder = "8px";
  radiusInput.spellcheck = false;
  radiusInput.addEventListener("change", () => {
    sendUpdateComponent(comp.id, { radius: radiusInput.value });
  });
  radiusRow.appendChild(radiusInput);
  appearance.appendChild(radiusRow);
  panel.appendChild(appearance);

  // Layout section (freeform mode, top-level components only — children flow
  // inside their parent container and use no canvas coordinates).
  if (canvasMode === "freeform" && !componentParentPath(comp.id)) {
    const layoutSection = el("div", "inspector-section");
  layoutSection.appendChild(el("div", "inspector-section-title", t("layout")));
    const L = comp.layout || { x: 0, y: 0, w: 0, h: 0 };
    ["x", "y", "w", "h"].forEach((key) => {
      const row = el("div", "prop-row");
  row.appendChild(el("div", "prop-label", key === "w" ? t("width") : key === "h" ? t("height") : key.toUpperCase()));
      const input = el("input", "prop-num-input");
      input.type = "number";
      input.value = String(L[key] || 0);
      input.addEventListener("change", () => {
        const value = Math.max(0, parseInt(input.value, 10) || 0);
        const next = { ...(comp.layout || { x: 0, y: 0, w: 0, h: 0 }), [key]: value };
        comp.layout = next;
        sendUpdateComponent(comp.id, {}, { [key]: value });
        renderCanvas();
      });
      row.appendChild(input);
      layoutSection.appendChild(row);
    });
    panel.appendChild(layoutSection);
  }

  // Content (string props)
  const contentSection = el("div", "inspector-section");
  contentSection.appendChild(el("div", "inspector-section-title", t("content")));
  let textRows = 0;
  Object.entries(props).forEach(([key, value]) => {
    if (typeof value !== "string") return;
    const row = el("div", "prop-row");
    row.appendChild(el("div", "prop-label", key));
    if (isColorValue(value)) {
      const group = el("div", "prop-color-row");
      const swatch = el("div", "prop-color-swatch");
      swatch.style.background = value;
      const input = el("input", "prop-text-input");
      input.value = value;
      input.spellcheck = false;
      input.addEventListener("change", () => sendUpdateComponent(comp.id, { [key]: input.value }));
      group.appendChild(swatch);
      group.appendChild(input);
      row.appendChild(group);
    } else {
      const input = el("input", "prop-text-input");
      input.value = value;
      input.addEventListener("change", () => sendUpdateComponent(comp.id, { [key]: input.value }));
      row.appendChild(input);
    }
    contentSection.appendChild(row);
    textRows++;
  });
  if (textRows === 0) {
    contentSection.appendChild(el("div", "inspector-hint", t("noTextProps")));
  }
  panel.appendChild(contentSection);

  // Animation
  const animSection = el("div", "inspector-section");
  animSection.appendChild(el("div", "inspector-section-title", t("animation")));
  const anim = comp.animation || {};

  const entryRow = el("div", "prop-row");
  entryRow.appendChild(el("div", "prop-label", t("entry")));
  const entrySelect = el("select", "prop-select");
  entrySelect.innerHTML = '<option value="">无</option>' +
    LIBRARY_ANIMATIONS.filter((a) => a.entry).map((a) => `<option value="${a.entry}" ${anim.entry === a.entry ? "selected" : ""}>${a.name}</option>`).join("");
  entrySelect.addEventListener("change", () => {
    sendSetAnimation(comp.id, { entry: entrySelect.value || undefined });
  });
  entryRow.appendChild(entrySelect);
  animSection.appendChild(entryRow);

  const hoverRow = el("div", "prop-row");
  hoverRow.appendChild(el("div", "prop-label", t("hover")));
  const hoverSelect = el("select", "prop-select");
  hoverSelect.innerHTML = '<option value="">无</option>' +
    LIBRARY_ANIMATIONS.filter((a) => a.hover).map((a) => `<option value="${a.hover}" ${anim.hover === a.hover ? "selected" : ""}>${a.name}</option>`).join("");
  hoverSelect.addEventListener("change", () => {
    sendSetAnimation(comp.id, { hover: hoverSelect.value || undefined });
  });
  hoverRow.appendChild(hoverSelect);
  animSection.appendChild(hoverRow);

  const durRow = el("div", "prop-row");
  durRow.appendChild(el("div", "prop-label", t("duration")));
  const durGroup = el("div", "prop-input-group");
  const durSlider = el("input", "prop-slider");
  durSlider.type = "range";
  durSlider.min = "0.1";
  durSlider.max = "2";
  durSlider.step = "0.05";
  durSlider.value = String(anim.duration || 0.4);
  const durInput = el("input", "prop-num-input");
  durInput.type = "number";
  durInput.min = "0.1";
  durInput.max = "2";
  durInput.step = "0.05";
  durInput.value = String(anim.duration || 0.4);
  const applyDuration = () => {
    const v = Math.min(2, Math.max(0.1, parseFloat(durSlider.value) || 0.4));
    sendSetAnimation(comp.id, { duration: v });
  };
  durSlider.addEventListener("change", () => {
    durInput.value = durSlider.value;
    applyDuration();
  });
  durInput.addEventListener("change", () => {
    durSlider.value = durInput.value;
    applyDuration();
  });
  durGroup.appendChild(durSlider);
  durGroup.appendChild(durInput);
  durRow.appendChild(durGroup);
  animSection.appendChild(durRow);
  panel.appendChild(animSection);

  // Behavior (行为模型 P1): bind an interaction triggered in play mode
  const behaviorSection = el("div", "inspector-section");
  behaviorSection.appendChild(el("div", "inspector-section-title", t("behavior")));
  const behavior = comp.behavior || null;
  const pages = (currentState && currentState.pages) || [];
  const otherPages = pages.filter((p) => p.id !== (currentState && currentState.currentPageId));
  const allComponents = findAllComponents(getCurrentComponents());

  const behaviorTypeSelect = el("select", "prop-select");
  const behaviorTypes = [
    ["", t("behaviorNone")],
    ["navigate", t("behaviorNavigate")],
    ["link", t("behaviorLink")],
    ["toggle", t("behaviorToggle")],
    ["toast", t("behaviorToast")],
    ["submit", t("behaviorSubmit")],
    ["prompt", t("behaviorPrompt")],
  ];
  behaviorTypeSelect.innerHTML = behaviorTypes
    .map(([value, label]) => `<option value="${value}" ${behavior && behavior.type === value ? "selected" : ""}>${label}</option>`)
    .join("");
  const behaviorTypeRow = el("div", "prop-row");
  behaviorTypeRow.appendChild(el("div", "prop-label", t("behavior")));
  behaviorTypeRow.appendChild(behaviorTypeSelect);
  behaviorSection.appendChild(behaviorTypeRow);

  // Parameter rows per type (rebuilt on type change)
  const paramsWrap = el("div", "behavior-params");
  behaviorSection.appendChild(paramsWrap);

  const saveBehavior = (next) => {
    fetch(`/api/component/${comp.id}/behavior`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ behavior: next }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then(() => {
        comp.behavior = next || undefined;
        fetchInitialState();
        renderInspector();
        renderCanvas();
      })
      .catch((err) => {
        console.error("Set behavior failed:", err);
        showToastMsg(t("dsError"), true);
      });
  };

  const renderParams = () => {
    paramsWrap.innerHTML = "";
    const type = behaviorTypeSelect.value;
    if (!type) return;
    if (type === "navigate") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorNavigate")));
      const select = el("select", "prop-select");
      select.innerHTML =
        `<option value="">${t("playLinkPlaceholder")}</option>` +
        otherPages
          .map((p) => `<option value="${p.id}" ${behavior && behavior.page_id === p.id ? "selected" : ""}>${p.name}</option>`)
          .join("");
      select.addEventListener("change", () => {
        saveBehavior(
          select.value
            ? { type: "navigate", page_id: select.value }
            : null
        );
      });
      row.appendChild(select);
      paramsWrap.appendChild(row);
    } else if (type === "link") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorUrl")));
      const input = el("input", "prop-text-input");
      input.value = (behavior && behavior.url) || "";
      input.placeholder = "https://…";
      input.spellcheck = false;
      input.addEventListener("change", () => {
        const url = input.value.trim();
        saveBehavior(url ? { type: "link", url, new_tab: true } : null);
      });
      row.appendChild(input);
      paramsWrap.appendChild(row);
    } else if (type === "toggle") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorTarget")));
      const select = el("select", "prop-select");
      select.innerHTML =
        `<option value="">${t("behaviorTarget")}…</option>` +
        allComponents
          .filter((c) => c.id !== comp.id)
          .map((c) => `<option value="${c.id}" ${behavior && behavior.target_component_id === c.id ? "selected" : ""}>${c.type} · ${c.id.slice(-6)}</option>`)
          .join("");
      select.addEventListener("change", () => {
        saveBehavior(select.value ? { type: "toggle", target_component_id: select.value } : null);
      });
      row.appendChild(select);
      paramsWrap.appendChild(row);
    } else if (type === "toast") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorMessage")));
      const input = el("input", "prop-text-input");
      input.value = (behavior && behavior.message) || "";
      input.placeholder = t("behaviorToastDefault");
      input.addEventListener("change", () => {
        const message = input.value.trim();
        saveBehavior(message ? { type: "toast", message } : null);
      });
      row.appendChild(input);
      paramsWrap.appendChild(row);
    } else if (type === "submit") {
      const hint = el("div", "inspector-hint", t("behaviorPlayHint") + " · " + t("behaviorSubmitted"));
      paramsWrap.appendChild(hint);
    } else if (type === "prompt") {
      const row = el("div", "prop-row");
      row.appendChild(el("div", "prop-label", t("behaviorPromptText")));
      const input = el("input", "prop-text-input");
      input.value = (behavior && behavior.prompt) || "";
      input.placeholder = t("promptPlaceholder");
      input.addEventListener("change", () => {
        const prompt = input.value.trim();
        saveBehavior(prompt ? { type: "prompt", prompt } : null);
      });
      row.appendChild(input);
      paramsWrap.appendChild(row);
    }
  };

  behaviorTypeSelect.addEventListener("change", () => {
    const type = behaviorTypeSelect.value;
    if (!type) {
      saveBehavior(null);
      paramsWrap.innerHTML = "";
      return;
    }
    // Preserve prior params where sensible when switching types.
    const base = behavior && behavior.type === type ? behavior : { type };
    saveBehavior(base);
    renderParams();
  });
  renderParams();

  const behaviorInfo = el("div", "inspector-link-info");
  if (behavior) {
    const label = behaviorTypes.find(([v]) => v === behavior.type);
    behaviorInfo.textContent = `${label ? label[1] : behavior.type} · ${t("behaviorPlayHint")}`;
    behaviorInfo.style.display = "block";
  }
  behaviorSection.appendChild(behaviorInfo);
  panel.appendChild(behaviorSection);

  // Actions
  const actions = el("div", "inspector-actions");
  const dupBtn = el("button", "inspector-action-btn", t("duplicate"));
  dupBtn.title = t("duplicate") + " (Ctrl+D)";
  dupBtn.addEventListener("click", () => duplicateSelected(comp.id));
  actions.appendChild(dupBtn);
  const delBtn = el("button", "inspector-delete-btn", t("deleteComponent"));
  delBtn.addEventListener("click", () => {
    handleDeleteComponent(comp.id);
    deselectAll();
  });
  actions.appendChild(delBtn);
  panel.appendChild(actions);
}

let inspectorCodeFormat = "html";

async function renderInspectorCode(panel, comp) {
  panel.innerHTML = "";
  const toolbar = el("div", "inspector-code-toolbar");
  ["html", "react", "css"].forEach((fmt) => {
    const btn = el("button", "inspector-code-fmt" + (fmt === inspectorCodeFormat ? " active" : ""), fmt);
    btn.type = "button";
    btn.addEventListener("click", () => {
      inspectorCodeFormat = fmt;
      renderInspectorCode(panel, comp);
    });
    toolbar.appendChild(btn);
  });
  const copyBtn = el("button", "inspector-copy-btn", t("copyCode"));
  copyBtn.type = "button";
  copyBtn.disabled = true;
  toolbar.appendChild(copyBtn);
  panel.appendChild(toolbar);

  const pre = el("pre", "inspector-code");
  pre.textContent = t("codeLoading");
  panel.appendChild(pre);

  try {
    const res = await fetch(
      `/api/component/${encodeURIComponent(comp.id)}/code?format=${encodeURIComponent(inspectorCodeFormat)}`
    );
    if (!res.ok) {
      pre.textContent = t("codeEmpty");
      return;
    }
    const data = await res.json();
    pre.textContent = data.code || t("codeEmpty");
    copyBtn.disabled = false;
    copyBtn.addEventListener("click", () => {
      copyToClipboard(data.code || "");
      flashButton(copyBtn, t("codeCopied"), 1200);
    });
  } catch (err) {
    console.error("Inspect code failed:", err);
    pre.textContent = t("codeEmpty");
  }
}

function sendSetAnimation(id, patch) {
  send({ type: "set_animation", component_id: id, ...patch });
}

function renderLayerPanel() {
  const list = $("layer-tree");
  if (!list) return;
  const components = getCurrentComponents();
  if (components.length === 0) {
  list.innerHTML = `<div class="layer-empty">${t("layerEmpty")}</div>`;
    return;
  }
  list.innerHTML = "";
  // 递归渲染：子组件以缩进层级显示，也可选中/重命名/删除（自由编辑补缺）。
  const renderItem = (comp, depth) => {
    const item = el("div", "layer-item" + (selectedIds.includes(comp.id) ? " selected" : ""));
    item.dataset.id = comp.id;
    if (depth > 0) item.style.paddingLeft = `${8 + depth * 14}px`;
    item.appendChild(el("span", "layer-icon", depth > 0 ? "↳" : "◈"));
    const nameSpan = el("span", "layer-name", comp.name || `${comp.type}${comp.variant ? "/" + comp.variant : ""}`);
    nameSpan.title = t("layerRenameHint");
    item.appendChild(nameSpan);
    // 图层重命名 (精确编辑 P0): double-click the name to rename inline.
    attachLayerRenameDoubleClick(nameSpan, comp.id);
    // Drag to reorder layers (top-level stacking, 精确编辑 P0)
    item.draggable = true;
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", comp.id);
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      item.classList.add("drop-target");
    });
    item.addEventListener("dragleave", () => item.classList.remove("drop-target"));
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("drop-target");
      const fromId = e.dataTransfer.getData("text/plain");
      if (!fromId || fromId === comp.id) return;
      send({
        type: "reorder_component",
        fromId,
        toId: comp.id,
        position: "before",
      });
    });
    const del = el("button", "layer-del", "✕");
  del.title = t("deleteComponent");
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteComponent(comp.id);
      if (selectedComponentId === comp.id) deselectAll();
    });
    item.appendChild(del);
    list.appendChild(item);
    if (comp.children && comp.children.length > 0) {
      [...comp.children].reverse().forEach((child) => renderItem(child, depth + 1));
    }
  };
  [...components].reverse().forEach((comp) => renderItem(comp, 0));
}

// 图层重命名 (精确编辑 P0): double-click the name (delegated — the first click
// re-renders the layer panel, so a raw dblclick target would be destroyed).
let layerLastClickId = null;
let layerLastClickAt = 0;

function attachLayerRenameDoubleClick(nameSpan, compId) {
  nameSpan.addEventListener("click", (e) => {
    e.stopPropagation();
    const now = Date.now();
    if (layerLastClickId === compId && now - layerLastClickAt < 350) {
      layerLastClickId = null;
      startLayerRename(nameSpan, compId);
    } else {
      layerLastClickId = compId;
      layerLastClickAt = now;
      selectComponent(compId, e.shiftKey || e.ctrlKey || e.metaKey);
    }
  });
}

// 图层重命名 (精确编辑 P0): swap the name span for an input, commit on Enter/blur.
function startLayerRename(nameSpan, compId) {
  const input = el("input", "layer-rename-input");
  input.type = "text";
  input.value = nameSpan.textContent;
  input.maxLength = 60;
  input.spellcheck = false;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const name = input.value.trim();
    send({ type: "rename_component", id: compId, name });
    // Optimistic local update; full state refresh follows via WS broadcast.
    const comp = getCompById(compId);
    if (comp) {
      if (name) comp.name = name;
      else delete comp.name;
    }
    renderLayerPanel();
  };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      input.removeEventListener("blur", commit);
      renderLayerPanel();
    }
  });
}

function setupZoom() {
  const zoomOut = $("zoom-out");
  const zoomIn = $("zoom-in");
  const reset = $("zoom-reset");
  const fit = $("zoom-fit");
  const apply = (z) => {
    canvasZoom = Math.max(25, Math.min(200, z));
    const valueEl = $("zoom-value");
    if (valueEl) valueEl.textContent = canvasZoom + "%";
    const wrap = $("canvas-scroll-wrap");
    if (wrap) wrap.style.zoom = canvasZoom / 100;
    // 标尺刻度跟随缩放
    renderRulers();
  };
  const fitCanvas = () => {
    const wrap = $("canvas-scroll-wrap");
    const frame = $("canvas-frame") || $("canvas");
    if (!wrap || !frame) return;
    const cw = wrap.clientWidth;
    const fw = frame.scrollWidth || frame.offsetWidth || cw;
    if (cw > 0 && fw > 0) {
      apply(Math.round((cw / fw) * 100));
    }
  };
  if (zoomOut) zoomOut.addEventListener("click", () => apply(canvasZoom - 10));
  if (zoomIn) zoomIn.addEventListener("click", () => apply(canvasZoom + 10));
  if (reset) reset.addEventListener("click", () => apply(100));
  if (fit) fit.addEventListener("click", fitCanvas);
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "=" || e.key === "+") { e.preventDefault(); apply(canvasZoom + 10); }
    else if (e.key === "-") { e.preventDefault(); apply(canvasZoom - 10); }
    else if (e.key === "0" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); apply(100); }
  });
  apply(100);
}

function setupCanvasShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (
      e.target.tagName === "INPUT" ||
      e.target.tagName === "SELECT" ||
      e.target.tagName === "TEXTAREA" ||
      e.target.contentEditable === "true"
    ) {
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && (selectedComponentId || selectedIds.length > 0)) {
      e.preventDefault();
      const comps = getSelectedComps();
      if (comps.length === 0) return;
      if (comps.length === 1) {
        handleDeleteComponent(comps[0].id);
      } else {
        comps.forEach((c) => handleDeleteComponent(c.id));
      }
      deselectAll();
    }
    // Ctrl+D duplicates the selected component (Pixso/Figma convention).
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selectedComponentId) {
      e.preventDefault();
      duplicateSelected(selectedComponentId);
    }
  });
}

// ===== Inline Property Editing =====

function setupInlineEditing(wrapper, compId) {
  const editables = wrapper.querySelectorAll("[data-editable='true']");
  // Only handle direct (non-nested) editable elements to avoid double-binding
  editables.forEach((elm) => {
    // Skip if this element is inside a nested comp-wrapper
    if (elm.closest(".comp-wrapper") !== wrapper) return;

    elm.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      elm.contentEditable = "true";
      elm.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(elm);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    const commitEdit = () => {
      elm.contentEditable = "false";
      const newValue = elm.textContent.trim();
      const prop = elm.getAttribute("data-prop");
      if (!prop) return;
      // 支持点路径（如 "items.0.title"）：更新嵌套数组内的字段。
      if (prop.includes(".")) {
        const comp = getCompById(compId);
        if (!comp) return;
        const parts = prop.split(".");
        let cursor = comp.props;
        for (let i = 0; i < parts.length - 1; i++) {
          const key = parts[i];
          const idx = /^\d+$/.test(key) ? parseInt(key, 10) : key;
          if (cursor == null) return;
          cursor = cursor[idx];
        }
        if (cursor == null) return;
        const leafKey = parts[parts.length - 1];
        cursor[leafKey] = newValue;
        send({
          type: "update_component",
          id: compId,
          props: JSON.parse(JSON.stringify(comp.props)),
        });
        return;
      }
      send({
        type: "update_component",
        id: compId,
        props: { [prop]: newValue },
      });
    };

    elm.addEventListener("blur", commitEdit);

    elm.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        elm.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        elm.blur();
      }
    });
  });
}

// ===== Drag & Drop for Component Reorder =====

function attachDragHandlers(wrapper, compId, dragHandle) {
  // Use drag handle for initiating drag, not the entire wrapper
  // This allows text editing (dblclick) to work on content elements
  const dragSource = dragHandle || wrapper;
  if (dragHandle) {
    dragHandle.addEventListener("dragstart", (e) => {
      draggedComponentId = compId;
      wrapper.classList.add("dragging");
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", compId); } catch (err) {}
    });

    dragHandle.addEventListener("dragend", () => {
      wrapper.classList.remove("dragging");
      clearDragIndicators();
      draggedComponentId = null;
    });
  }

  // Allow drop on this wrapper for reorder
  wrapper.addEventListener("dragover", (e) => {
    // Only handle if this is a component reorder drag (not a library drag)
    if (!draggedComponentId) return;
    if (draggedComponentId === compId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    wrapper.classList.add("drag-over");

    const rect = wrapper.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    clearDragIndicators(wrapper);
    const indicator = el("div", "drag-indicator");
    if (e.clientY < midY) {
      indicator.classList.add("top");
    } else {
      indicator.classList.add("bottom");
    }
    wrapper.appendChild(indicator);
  });

  wrapper.addEventListener("dragleave", (e) => {
    wrapper.classList.remove("drag-over");
    clearDragIndicators(wrapper);
  });

  wrapper.addEventListener("drop", (e) => {
    // Only handle component reorder, not library drags
    if (!draggedComponentId) {
      // Library drag — let it bubble to canvas
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    wrapper.classList.remove("drag-over");

    if (draggedComponentId === compId) {
      clearDragIndicators();
      return;
    }

    const rect = wrapper.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? "before" : "after";

    send({
      type: "reorder_component",
      fromId: draggedComponentId,
      toId: compId,
      position: position,
    });

    clearDragIndicators();
    draggedComponentId = null;
  });
}

function clearDragIndicators(scope) {
  const root = scope || document;
  const indicators = root.querySelectorAll(".drag-indicator");
  indicators.forEach((ind) => ind.remove());
  const over = document.querySelectorAll(".comp-wrapper.drag-over");
  over.forEach((w) => w.classList.remove("drag-over"));
}

function renderComponentContent(comp) {
  const props = comp.props || {};
  const variant = comp.variant || "";

  switch (comp.type) {
    case "hero":
      return renderHero(props, variant);
    case "navbar":
      return renderNavbar(props, variant);
    case "card_grid":
      return renderCardGrid(props, variant);
    case "card":
      return renderCard(props, variant);
    case "cta":
      return renderCta(props, variant);
    case "footer":
      return renderFooter(props);
    case "text_section":
      return renderTextSection(props);
    case "feature_list":
      return renderFeatureList(props);
    case "button":
      return renderButton(props, variant);
    case "stats":
      return renderStats(props);
    case "pricing":
      return renderPricing(props, variant);
    case "testimonial":
      return renderTestimonial(props);
    case "banner":
      return renderBanner(props);
    case "timeline":
      return renderTimeline(props);
    case "faq":
      return renderFaq(props);
    case "form":
      return renderForm(props);
    case "image":
      return renderImage(props);
    // Canvas-first fidelity types (created by shapesToComponents)
    case "text":
      return renderText(props);
    case "section":
      return renderSection(props);
    case "container":
      return renderContainer(props);
    // New component types
    case "tabs":
      return renderTabs(props);
    case "accordion":
      return renderAccordion(props);
    case "carousel":
      return renderCarousel(props);
    case "modal":
      return renderModalComponent(props);
    case "sidebar":
      return renderSidebar(props);
    case "breadcrumb":
      return renderBreadcrumb(props);
    case "pagination":
      return renderPagination(props);
    case "progress":
      return renderProgress(props, variant);
    case "badge":
      return renderBadge(props, variant);
    case "avatar":
      return renderAvatar(props);
    // Spec 3.4 — new component types
    case "input":
      return renderInput(props);
    case "grid":
      return renderGrid(props, variant);
    case "table":
      return renderTable(props);
    case "alert":
      return renderAlert(props, variant);
    case "tooltip":
      return renderTooltip(props);
    case "bento_grid":
      return renderBentoGrid(props);
    case "skeleton":
      return renderSkeleton(props);
    case "command_palette":
      return renderCommandPalette(props);
    case "glass_card":
      return renderGlassCard(props);
    case "fab":
      return renderFab(props);
    case "marquee":
      return renderMarquee(props);
    case "feature_grid":
      return renderFeatureGrid(props, variant);
    case "cookie_banner":
      return renderCookieBanner(props);
    case "toggle":
      return renderToggle(props);
    default:
      return renderGeneric(comp);
  }
}

// ===== Component Renderers =====

// Helper: create an inline-editable text element
function editableText(tag, className, text, prop) {
  const e = el(tag, className, text);
  e.setAttribute("data-editable", "true");
  e.setAttribute("data-prop", prop);
  e.draggable = false; // Prevent drag interference with editing
  return e;
}

function renderHero(props, variant) {
  const div = el("div", "comp-hero");
  if (variant === "split") {
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "32px";
    div.style.textAlign = "left";
  }

  const content = el("div");
  content.style.flex = "1";

  if (props.title) {
    content.appendChild(editableText("h1", null, props.title, "title"));
  }
  if (props.subtitle) {
    content.appendChild(editableText("p", null, props.subtitle, "subtitle"));
  }
  if (props.button_text) {
    const btn = el("div", "btn", props.button_text);
    content.appendChild(btn);
  }
  div.appendChild(content);

  if (variant === "split" && props.image_url) {
    const img = el("div");
    img.style.cssText = `flex:1;height:200px;border-radius:12px;background:url('${props.image_url}') center/cover;`;
    div.appendChild(img);
  }

  return div;
}

function renderNavbar(props, variant) {
  const nav = el("div", "comp-navbar");
  const brand = editableText("span", "nav-brand", props.brand || "Logo", "brand");
  nav.appendChild(brand);

  const links = el("div", "nav-links");
  const items = props.links || ["Home", "About", "Services", "Contact"];
  if (Array.isArray(items)) {
    items.forEach((item, i) => {
      const link = typeof item === "string" ? item : (item.label || item.text || "");
      links.appendChild(editableText("span", null, link, `links.${i}`));
    });
  }
  nav.appendChild(links);

  if (variant === "with_cta" && props.cta_text) {
    const cta = editableText("span", "btn", props.cta_text, "cta_text");
    cta.style.cssText = "padding:6px 16px;font-size:13px;border-radius:6px;";
    nav.appendChild(cta);
  }

  return nav;
}

function renderCardGrid(props, variant) {
  const grid = el("div", "comp-card-grid");
  const cols = variant.includes("2") ? "cols-2" : variant.includes("4") ? "cols-4" : "cols-3";
  grid.classList.add(cols);

  const items = props.items || [];
  const count = cols === "cols-2" ? 2 : cols === "cols-4" ? 4 : 3;

  for (let i = 0; i < Math.max(items.length, count); i++) {
    const item = items[i] || {};
    const card = renderCard(item, "product");
    // 卡片网格内每个 item 的文字可独立编辑（路径指向 items[i]）。
    const t = card.querySelector(".card-title");
    if (t) { t.setAttribute("data-editable", "true"); t.setAttribute("data-prop", `items.${i}.title`); }
    const d = card.querySelector(".card-desc");
    if (d) { d.setAttribute("data-editable", "true"); d.setAttribute("data-prop", `items.${i}.description`); }
    const p = card.querySelector(".card-price");
    if (p) { p.setAttribute("data-editable", "true"); p.setAttribute("data-prop", `items.${i}.price`); }
    grid.appendChild(card);
  }

  return grid;
}

function renderCard(props, variant) {
  const card = el("div", "comp-card");
  if (variant === "elevated") {
    card.style.boxShadow = "0 12px 28px rgba(0,0,0,0.14)";
    card.style.transform = "translateY(-2px)";
  } else if (variant === "outlined") {
    card.style.background = "transparent";
    card.style.border = "2px solid var(--border-strong)";
    card.style.boxShadow = "none";
  }

  if (props.image_url || props.image) {
    const img = el("div", "card-img");
    img.style.background = `url('${props.image_url || props.image}') center/cover`;
    card.appendChild(img);
  }

  if (props.title) {
    card.appendChild(el("div", "card-title", props.title));
  }
  if (props.description || props.desc) {
    card.appendChild(el("div", "card-desc", props.description || props.desc));
  }
  if (props.price) {
    card.appendChild(el("div", "card-price", props.price));
  }
  if (props.button_text) {
    const btn = el("div", "btn", props.button_text);
    btn.style.cssText = "padding:6px 16px;font-size:12px;border-radius:6px;margin-top:8px;display:inline-block;";
    card.appendChild(btn);
  }

  return card;
}

function renderCta(props, variant) {
  const cta = el("div", "comp-cta");
  if (props.title) cta.appendChild(editableText("h2", null, props.title, "title"));
  if (props.subtitle || props.text) cta.appendChild(editableText("p", null, props.subtitle || props.text, "subtitle"));
  if (props.button_text) {
    const btn = el("div", "btn", props.button_text);
    cta.appendChild(btn);
  }
  return cta;
}

function renderFooter(props) {
  const footer = el("div", "comp-footer");
  const text = props.text || props.copyright || "© 2024 All rights reserved.";
  footer.appendChild(el("p", null, text));
  if (props.links && Array.isArray(props.links)) {
    const linksDiv = el("div");
    linksDiv.style.cssText = "display:flex;gap:16px;justify-content:center;margin-top:8px;";
    props.links.forEach((link) => {
      linksDiv.appendChild(el("span", null, typeof link === "string" ? link : (link.label || "")));
    });
    footer.appendChild(linksDiv);
  }
  return footer;
}

function renderTextSection(props) {
  const section = el("div", "comp-text-section");
  if (props.title) section.appendChild(editableText("h2", null, props.title, "title"));
  if (props.text || props.body) section.appendChild(editableText("p", null, props.text || props.body, "text"));
  return section;
}

function renderFeatureList(props) {
  const list = el("div", "comp-feature-list");
  const items = props.items || [];
  items.forEach((item, i) => {
    const feature = el("div", "comp-feature-item");
    const icon = el("div", "feature-icon", item.icon || "✦");
    feature.appendChild(icon);
    const text = el("div");
    text.style.flex = "1";
    if (item.title) text.appendChild(editableText("div", "card-title", item.title, `items.${i}.title`));
    if (item.description) text.appendChild(editableText("div", "card-desc", item.description, `items.${i}.description`));
    feature.appendChild(text);
    list.appendChild(feature);
  });
  return list;
}

function renderButton(props, variant) {
  const btn = el("div", "comp-button", props.text || props.label || "Button");
  if (variant === "secondary") {
    btn.style.background = "transparent";
    btn.style.border = "2px solid currentColor";
  } else if (variant === "ghost") {
    btn.style.background = "transparent";
    btn.style.color = "currentColor";
  } else if (variant === "danger") {
    btn.style.background = "var(--danger, #EF4444)";
    btn.style.borderColor = "transparent";
  }
  return btn;
}

function renderStats(props) {
  const container = el("div");
  container.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;padding:24px;border-radius:10px;";
  const items = props.items || [];
  items.forEach((item, i) => {
    const stat = el("div");
    stat.style.cssText = "text-align:center;padding:16px;border-radius:8px;";
    stat.appendChild(el("div", null, ""));
    const num = stat.firstChild;
    num.style.cssText = "font-size:28px;font-weight:700;margin-bottom:4px;";
    num.textContent = item.value || "0";
    num.setAttribute("data-editable", "true");
    num.setAttribute("data-prop", `items.${i}.value`);
    num.draggable = false;
    const label = el("div", null, item.label || "");
    label.style.cssText = "font-size:11px;opacity:0.7;";
    label.setAttribute("data-editable", "true");
    label.setAttribute("data-prop", `items.${i}.label`);
    label.draggable = false;
    stat.appendChild(label);
    container.appendChild(stat);
  });
  return container;
}

function renderPricing(props, variant) {
  const grid = el("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;";
  const plans = props.plans || [];
  plans.forEach((plan, i) => {
    const card = el("div", "comp-card");
    if (plan.featured) {
      card.style.cssText = "border:2px solid var(--accent);position:relative;";
    }
    if (plan.name) card.appendChild(editableText("div", "card-title", plan.name, `plans.${i}.name`));
    if (plan.price) {
      const price = editableText("div", "card-price", plan.price, `plans.${i}.price`);
      price.style.fontSize = "24px";
      card.appendChild(price);
    }
    if (plan.features && Array.isArray(plan.features)) {
      const features = el("div");
      features.style.cssText = "margin-top:8px;";
      plan.features.forEach((f, fi) => {
        features.appendChild(editableText("div", "card-desc", `✓ ${f}`, `plans.${i}.features.${fi}`));
      });
      card.appendChild(features);
    }
    if (plan.button_text) {
      const btn = editableText("div", "btn", plan.button_text, `plans.${i}.button_text`);
      btn.style.cssText = "padding:8px 20px;font-size:13px;border-radius:6px;margin-top:12px;text-align:center;";
      card.appendChild(btn);
    }
    grid.appendChild(card);
  });
  return grid;
}

function renderTestimonial(props) {
  const container = el("div");
  container.style.cssText = "padding:24px;border-radius:10px;";
  if (props.quote) {
    const quote = el("p", null, `"${props.quote}"`);
    quote.style.cssText = "font-size:15px;line-height:1.8;font-style:italic;margin-bottom:12px;";
    container.appendChild(quote);
  }
  const author = el("div");
  author.style.cssText = "display:flex;align-items:center;gap:12px;";
  if (props.avatar) {
    const avatar = el("div");
    avatar.style.cssText = `width:40px;height:40px;border-radius:50%;background:url('${props.avatar}') center/cover;`;
    author.appendChild(avatar);
  }
  const info = el("div");
  if (props.author) info.appendChild(el("div", "card-title", props.author));
  if (props.role) info.appendChild(el("div", "card-desc", props.role));
  author.appendChild(info);
  container.appendChild(author);
  return container;
}

function renderBanner(props) {
  const banner = el("div");
  banner.style.cssText = "padding:16px 24px;border-radius:8px;text-align:center;";
  if (props.text) {
    const text = el("span", null, props.text);
    text.style.fontSize = "14px";
    banner.appendChild(text);
  }
  if (props.button_text) {
    const btn = el("span", "btn", props.button_text);
    btn.style.cssText = "margin-left:12px;padding:4px 12px;font-size:12px;border-radius:4px;";
    banner.appendChild(btn);
  }
  return banner;
}

function renderTimeline(props) {
  const timeline = el("div");
  timeline.style.cssText = "padding:24px;";
  const items = props.items || [];
  items.forEach((item, i) => {
    const entry = el("div");
    entry.style.cssText = `display:flex;gap:16px;padding-bottom:16px;${i < items.length - 1 ? "border-left:2px solid var(--border);margin-left:8px;padding-left:16px;" : "padding-left:18px;"}`;
    const dot = el("div");
    dot.style.cssText = "width:12px;height:12px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:4px;margin-left:-22px;";
    entry.appendChild(dot);
    const content = el("div");
    content.style.flex = "1";
    if (item.date) {
      const date = el("div", "card-desc", item.date);
      date.style.fontFamily = "var(--mono)";
      content.appendChild(date);
    }
    if (item.title) content.appendChild(el("div", "card-title", item.title));
    if (item.description) content.appendChild(el("div", "card-desc", item.description));
    entry.appendChild(content);
    timeline.appendChild(entry);
  });
  return timeline;
}

function renderFaq(props) {
  const container = el("div");
  container.style.cssText = "padding:24px;display:flex;flex-direction:column;gap:8px;";
  const items = props.items || [];
  items.forEach((item) => {
    const qa = el("div");
    qa.style.cssText = "padding:12px;border-radius:8px;";
    if (item.question) {
      const q = el("div", "card-title", item.question);
      q.style.marginBottom = "4px";
      qa.appendChild(q);
    }
    if (item.answer) qa.appendChild(el("div", "card-desc", item.answer));
    container.appendChild(qa);
  });
  return container;
}

function renderForm(props) {
  const form = el("div");
  form.style.cssText = "padding:24px;border-radius:10px;";
  const fields = props.fields || [];
  fields.forEach((field) => {
    const wrapper = el("div");
    wrapper.style.cssText = "margin-bottom:12px;";
    if (field.label) {
      const label = el("label", null, field.label);
      label.style.cssText = "display:block;font-size:12px;margin-bottom:4px;";
      wrapper.appendChild(label);
    }
    const input = el("input");
    input.type = field.type || "text";
    input.placeholder = field.placeholder || "";
    input.style.cssText = "width:100%;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;";
    wrapper.appendChild(input);
    form.appendChild(wrapper);
  });
  if (props.button_text) {
    const btn = el("button", "btn", props.button_text);
    btn.style.cssText = "padding:10px 24px;border:none;border-radius:6px;font-weight:600;cursor:pointer;margin-top:8px;";
    form.appendChild(btn);
  }
  return form;
}

function renderImage(props) {
  const wrapper = el("div");
  wrapper.style.cssText = "border-radius:10px;overflow:hidden;";
  if (props.src || props.url) {
    const img = el("img");
    img.src = props.src || props.url;
    img.style.cssText = "width:100%;display:block;border-radius:10px;";
    img.alt = props.alt || "";
    wrapper.appendChild(img);
  }
  return wrapper;
}

// ===== New Component Renderers =====

function renderTabs(props) {
  const container = el("div", "comp-tabs");
  const items = props.items || props.tabs || [];
  const nav = el("div", "tabs-nav");
  const content = el("div", "tab-content");

  if (items.length === 0) {
    nav.appendChild(el("button", "tab-item active", "Tab 1"));
    content.textContent = "暂无内容";
  } else {
    items.forEach((item, i) => {
      const label = typeof item === "string" ? item : (item.label || item.title || `Tab ${i + 1}`);
      const tabBtn = el("button", "tab-item" + (i === 0 ? " active" : ""), label);
      const body = typeof item === "string" ? item : (item.content || item.body || "");
      tabBtn.addEventListener("click", () => {
        nav.querySelectorAll(".tab-item").forEach((t) => t.classList.remove("active"));
        tabBtn.classList.add("active");
        content.textContent = body;
      });
      nav.appendChild(tabBtn);
      if (i === 0) content.textContent = body;
    });
  }
  container.appendChild(nav);
  container.appendChild(content);
  return container;
}

function renderAccordion(props) {
  const container = el("div", "comp-accordion");
  const items = props.items || [];
  if (items.length === 0) {
    const item = el("div", "acc-item open");
    const header = el("div", "acc-header");
    header.appendChild(el("span", null, "Section 1"));
    header.appendChild(el("span", "acc-arrow", "▶"));
    const body = el("div", "acc-body", "暂无内容");
    item.appendChild(header);
    item.appendChild(body);
    container.appendChild(item);
  } else {
    items.forEach((itemData, i) => {
      const item = el("div", "acc-item" + (i === 0 ? " open" : ""));
      const header = el("div", "acc-header");
      header.appendChild(el("span", null, itemData.title || itemData.question || `Section ${i + 1}`));
      header.appendChild(el("span", "acc-arrow", "▶"));
      const body = el("div", "acc-body", itemData.content || itemData.answer || itemData.description || "");
      header.addEventListener("click", () => {
        item.classList.toggle("open");
      });
      item.appendChild(header);
      item.appendChild(body);
      container.appendChild(item);
    });
  }
  return container;
}

function renderCarousel(props) {
  const container = el("div", "comp-carousel");
  const slides = props.slides || props.items || [];
  const track = el("div", "carousel-track");
  let currentIndex = 0;

  const slideData = slides.length > 0 ? slides : [
    { title: "Slide 1", text: "第一张幻灯片" },
    { title: "Slide 2", text: "第二张幻灯片" },
    { title: "Slide 3", text: "第三张幻灯片" },
  ];

  slideData.forEach((s) => {
    const slide = el("div", "carousel-slide");
    if (s.title) slide.appendChild(el("h3", null, s.title));
    if (s.text || s.description) slide.appendChild(el("p", null, s.text || s.description));
    track.appendChild(slide);
  });
  container.appendChild(track);

  const prevBtn = el("button", "carousel-btn prev", "‹");
  const nextBtn = el("button", "carousel-btn next", "›");
  container.appendChild(prevBtn);
  container.appendChild(nextBtn);

  const dots = el("div", "carousel-dots");
  slideData.forEach((_, i) => {
    const dot = el("button", "carousel-dot" + (i === 0 ? " active" : ""));
    dot.addEventListener("click", () => goToSlide(i));
    dots.appendChild(dot);
  });
  container.appendChild(dots);

  function goToSlide(index) {
    currentIndex = index;
    track.style.transform = `translateX(-${currentIndex * 100}%)`;
    dots.querySelectorAll(".carousel-dot").forEach((d, i) => {
      d.classList.toggle("active", i === currentIndex);
    });
  }

  prevBtn.addEventListener("click", () => {
    goToSlide((currentIndex - 1 + slideData.length) % slideData.length);
  });
  nextBtn.addEventListener("click", () => {
    goToSlide((currentIndex + 1) % slideData.length);
  });

  return container;
}

function renderModalComponent(props) {
  const container = el("div", "comp-modal-preview");
  const mask = el("div", "modal-mask");
  container.appendChild(mask);

  const card = el("div", "modal-card");
  if (props.title) card.appendChild(el("h3", null, props.title));
  if (props.text || props.body || props.description) {
    card.appendChild(el("p", null, props.text || props.body || props.description));
  }
  const actions = el("div", "modal-actions");
  const cancelBtn = el("button", "btn-copy");
  cancelBtn.style.cssText = "background:var(--surface-hover);color:var(--text);";
  cancelBtn.textContent = props.cancel_text || "取消";
  const confirmBtn = el("button", "btn-copy", props.confirm_text || "确定");
  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  card.appendChild(actions);
  container.appendChild(card);

  return container;
}

function renderSidebar(props) {
  const container = el("div", "comp-sidebar");
  if (props.title) {
    container.appendChild(el("div", "sidebar-title", props.title));
  }
  const links = props.links || props.items || [
    { label: "Dashboard", icon: "▣" },
    { label: "Projects", icon: "▤" },
    { label: "Settings", icon: "○" },
  ];
  links.forEach((link, i) => {
    const label = typeof link === "string" ? link : (link.label || link.text || "");
    const icon = typeof link === "string" ? "•" : (link.icon || "•");
    const linkEl = el("div", "sidebar-link" + (i === 0 ? " active" : ""));
    linkEl.appendChild(el("span", "link-icon", icon));
    linkEl.appendChild(el("span", null, label));
    linkEl.addEventListener("click", () => {
      container.querySelectorAll(".sidebar-link").forEach((l) => l.classList.remove("active"));
      linkEl.classList.add("active");
    });
    container.appendChild(linkEl);
  });
  return container;
}

function renderBreadcrumb(props) {
  const container = el("div", "comp-breadcrumb");
  const items = props.items || props.crumbs || ["Home", "Category", "Current"];
  items.forEach((item, i) => {
    const label = typeof item === "string" ? item : (item.label || item.text || "");
    const isLast = i === items.length - 1;
    const crumb = el("span", "crumb" + (isLast ? " current" : ""), label);
    container.appendChild(crumb);
    if (!isLast) {
      container.appendChild(el("span", "crumb-sep", "/"));
    }
  });
  return container;
}

function renderPagination(props) {
  const container = el("div", "comp-pagination");
  const total = props.total || props.totalPages || 5;
  const current = props.current || props.currentPage || 1;

  const prevBtn = el("button", "page-btn", "‹");
  prevBtn.disabled = current <= 1;
  container.appendChild(prevBtn);

  for (let i = 1; i <= total; i++) {
    // Show ellipsis for large page counts
    if (total > 7 && i > 3 && i < total - 1) {
      if (i === 4) container.appendChild(el("span", "page-ellipsis", "…"));
      continue;
    }
    const btn = el("button", "page-btn" + (i === current ? " active" : ""), String(i));
    btn.addEventListener("click", () => {
      container.querySelectorAll(".page-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
    container.appendChild(btn);
  }

  const nextBtn = el("button", "page-btn", "›");
  nextBtn.disabled = current >= total;
  container.appendChild(nextBtn);

  return container;
}

function renderProgress(props, variant) {
  const container = el("div", "comp-progress");
  const label = el("div", "progress-label");
  const labelText = props.label || "Progress";
  const value = props.value !== undefined ? props.value : (props.percent !== undefined ? props.percent : 50);
  label.appendChild(el("span", null, labelText));
  label.appendChild(el("span", null, value + "%"));
  container.appendChild(label);

  const track = el("div", "progress-track");
  const fill = el("div", "progress-fill");
  if (variant === "striped" || props.striped) fill.classList.add("striped");
  fill.style.width = Math.min(100, Math.max(0, value)) + "%";
  track.appendChild(fill);
  container.appendChild(track);

  return container;
}

function renderBadge(props, variant) {
  const v = variant || props.variant || "default";
  const badge = el("span", "comp-badge variant-" + v);
  if (props.icon) badge.appendChild(el("span", null, props.icon + " "));
  badge.appendChild(document.createTextNode(props.text || props.label || "Badge"));
  return badge;
}

function renderAvatar(props) {
  const container = el("div", "comp-avatar-group");
  const avatars = props.avatars || props.items || [];
  const max = props.max || 5;
  const colors = ["#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#EC4899"];

  if (avatars.length === 0) {
    // Default avatars
    const names = ["AB", "CD", "EF"];
    names.forEach((name, i) => {
      const av = el("div", "comp-avatar", name);
      av.style.background = colors[i % colors.length];
      container.appendChild(av);
    });
  } else {
    const shown = avatars.slice(0, max);
    shown.forEach((av, i) => {
      const name = typeof av === "string" ? av : (av.name || av.label || "?");
      const initials = name.substring(0, 2).toUpperCase();
      const avatarEl = el("div", "comp-avatar", initials);
      if (typeof av === "object" && av.image) {
        avatarEl.style.background = `url('${av.image}') center/cover`;
      } else {
        avatarEl.style.background = colors[i % colors.length];
      }
      container.appendChild(avatarEl);
    });
    if (avatars.length > max) {
      const more = el("div", "comp-avatar comp-avatar-more", "+" + (avatars.length - max));
      container.appendChild(more);
    }
  }
  return container;
}

// ===== Spec 3.4 — New Component Renderers =====

function renderInput(props) {
  const wrap = el("div", "comp-input");
  if (props.label) wrap.appendChild(el("label", "input-label", props.label));
  const input = el("input", "input-field");
  input.type = props.type || "text";
  input.placeholder = props.placeholder || "";
  input.value = props.value || "";
  input.readOnly = true;
  wrap.appendChild(input);
  if (props.hint) wrap.appendChild(el("div", "input-hint", props.hint));
  return wrap;
}

function renderGrid(props, variant) {
  const grid = el("div", "comp-grid");
  const cols = variant.includes("2") ? "2" : variant.includes("4") ? "4" : "3";
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  const items = props.items || Array.from({ length: parseInt(cols, 10) }, (_, i) => ({ title: `单元格 ${i + 1}` }));
  items.forEach((item) => {
    const cell = el("div", "grid-cell");
    cell.appendChild(el("div", "grid-cell-title", typeof item === "string" ? item : (item.title || "单元格")));
    if (item && item.description) cell.appendChild(el("div", "grid-cell-desc", item.description));
    grid.appendChild(cell);
  });
  return grid;
}

function renderTable(props) {
  const container = el("div", "comp-table-wrap");
  const table = el("table", "comp-table");
  const columns = props.columns || ["列 1", "列 2"];
  const rows = props.rows || [];
  const thead = el("thead");
  const headRow = el("tr");
  columns.forEach((c) => headRow.appendChild(el("th", null, c)));
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = el("tbody");
  rows.forEach((row) => {
    const tr = el("tr");
    (Array.isArray(row) ? row : []).forEach((cell) => tr.appendChild(el("td", null, String(cell))));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
  return container;
}

function renderAlert(props, variant) {
  const type = variant || props.type || "info";
  const alert = el("div", `comp-alert alert-${type}`);
  const icons = { info: "i", success: "OK", warning: "!", error: "×" };
  alert.appendChild(el("span", `alert-icon alert-icon-${type}`, icons[type] || "i"));
  const body = el("div", "alert-body");
  if (props.title) body.appendChild(el("div", "alert-title", props.title));
  if (props.text) body.appendChild(el("div", "alert-text", props.text));
  alert.appendChild(body);
  return alert;
}

function renderTooltip(props) {
  const wrap = el("div", "comp-tooltip");
  const trigger = el("span", "tooltip-trigger", props.trigger || "悬停查看");
  const bubble = el("div", "tooltip-bubble", props.text || "");
  wrap.appendChild(trigger);
  wrap.appendChild(bubble);
  return wrap;
}

function renderBentoGrid(props) {
  const grid = el("div", "comp-bento");
  const items = props.items || [{ title: "主卡片", size: "large" }, { title: "小卡片", size: "small" }];
  items.forEach((item) => {
    const tile = el("div", `bento-tile bento-${item.size || "medium"}`);
    if (item.title) tile.appendChild(el("div", "bento-title", item.title));
    if (item.text) tile.appendChild(el("div", "bento-text", item.text));
    grid.appendChild(tile);
  });
  return grid;
}

function renderSkeleton(props) {
  const wrap = el("div", "comp-skeleton");
  const rows = props.rows || 3;
  wrap.appendChild(el("div", "skel-line skel-avatar"));
  for (let i = 0; i < rows; i++) {
    const line = el("div", "skel-line");
    line.style.width = `${92 - i * 14}%`;
    wrap.appendChild(line);
  }
  return wrap;
}

function renderCommandPalette(props) {
  const wrap = el("div", "comp-command");
  const search = el("div", "command-search");
  search.appendChild(el("span", null, "⌘"));
  search.appendChild(el("span", null, props.placeholder || "搜索或输入命令…"));
  wrap.appendChild(search);
  const items = props.items || ["新建页面", "切换主题", "导出代码"];
  items.forEach((item) => {
    const row = el("div", "command-item");
    row.appendChild(el("span", null, typeof item === "string" ? item : item.label));
    if (typeof item === "object" && item.shortcut) row.appendChild(el("span", "command-kbd", item.shortcut));
    wrap.appendChild(row);
  });
  return wrap;
}

function renderGlassCard(props) {
  const card = el("div", "comp-glass-card");
  if (props.title) card.appendChild(el("div", "glass-title", props.title));
  if (props.text) card.appendChild(el("div", "glass-text", props.text));
  if (props.button_text) card.appendChild(el("div", "btn", props.button_text));
  return card;
}

function renderFab(props) {
  const wrap = el("div", "comp-fab-wrap");
  const fab = el("button", "comp-fab", props.label || "+");
  fab.title = props.hint || "浮动操作";
  wrap.appendChild(fab);
  return wrap;
}

function renderMarquee(props) {
  const wrap = el("div", "comp-marquee");
  const track = el("div", "marquee-track");
  const items = props.items || ["特性一", "特性二", "特性三"];
  const doubled = [...items, ...items];
  doubled.forEach((item) => {
    const span = el("span", "marquee-item", typeof item === "string" ? item : item.title);
    track.appendChild(span);
  });
  wrap.appendChild(track);
  return wrap;
}

function renderFeatureGrid(props, variant) {
  const grid = el("div", "comp-feature-grid");
  const cols = variant.includes("2") ? "2" : variant.includes("4") ? "4" : "3";
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  const items = props.items || [];
  items.forEach((item) => {
    const cell = el("div", "fg-cell");
    cell.appendChild(el("div", "fg-icon", item.icon || "✦"));
    if (item.title) cell.appendChild(el("div", "fg-title", item.title));
    if (item.description) cell.appendChild(el("div", "fg-desc", item.description));
    grid.appendChild(cell);
  });
  return grid;
}

function renderCookieBanner(props) {
  const banner = el("div", "comp-cookie");
  banner.appendChild(el("span", "cookie-icon", "◉"));
  banner.appendChild(el("span", "cookie-text", props.text || "我们使用 Cookie 提升体验"));
  const actions = el("div", "cookie-actions");
  if (props.decline_text) actions.appendChild(el("span", "btn btn-ghost", props.decline_text));
  if (props.accept_text) actions.appendChild(el("span", "btn", props.accept_text));
  banner.appendChild(actions);
  return banner;
}

function renderToggle(props) {
  const wrap = el("label", "comp-toggle");
  const track = el("span", "toggle-track" + (props.checked ? " on" : ""));
  track.appendChild(el("span", "toggle-thumb"));
  wrap.appendChild(track);
  if (props.label) wrap.appendChild(el("span", "toggle-label", props.label));
  return wrap;
}

function renderGeneric(comp) {
  const div = el("div");
  div.style.cssText = "padding:20px;border-radius:10px;border:1px dashed var(--border);";
  div.appendChild(el("div", "card-title", `${comp.type}`));
  const json = el("pre");
  json.style.cssText = "font-size:11px;font-family:var(--mono);white-space:pre-wrap;word-break:break-all;overflow:hidden;max-height:200px;";
  json.textContent = JSON.stringify(comp.props, null, 2);
  div.appendChild(json);
  return div;
}

function renderText(props) {
  const p = el("div", "comp-text");
  p.textContent = props.text || "";
  if (props.fontSize) p.style.fontSize = String(props.fontSize).replace(/px$/, "") + "px";
  if (props.fontFamily) p.style.fontFamily = String(props.fontFamily);
  if (props.align) p.style.textAlign = String(props.align);
  return p;
}

function renderSection(props) {
  const p = el("div", "comp-section");
  if (props.title) p.appendChild(el("div", "section-title", props.title));
  return p;
}

function renderContainer(props) {
  const p = el("div", "comp-container");
  if (props.text) p.appendChild(el("div", "container-label", props.text));
  return p;
}

// ===== Animation =====

function applyAnimation(element, anim) {
  if (!anim) return;
  const duration = anim.duration || 0.3;
  const delay = anim.delay || 0;
  const curve = anim.curve || "ease-out";
  const stagger = anim.stagger || 0;

  const entryMap = {
    fadeUp: "translateY(20px)",
    fadeIn: "none",
    scaleIn: "scale(0.9)",
    slideRight: "translateX(-20px)",
    slideLeft: "translateX(20px)",
    slideUp: "translateY(20px)",
    spring: "scale(0.8)",
  };

  if (anim.entry && entryMap[anim.entry]) {
    element.style.opacity = "0";
    element.style.transform = entryMap[anim.entry];

    requestAnimationFrame(() => {
      element.style.transition = `opacity ${duration}s ${curve} ${delay}s, transform ${duration}s ${curve} ${delay}s`;
      element.style.opacity = "1";
      element.style.transform = "none";
    });
  } else if (anim.entry) {
    // CSS keyframe entry animations (bounceIn, flipIn, cinematic, shimmer, glitch, morphBlob)
    element.classList.add(`anim-${anim.entry}`);
    element.style.animationDuration = `${duration}s`;
    element.style.animationDelay = `${delay}s`;
    element.style.animationTimingFunction = curve === "spring" ? "cubic-bezier(0.34, 1.56, 0.64, 1)" : curve;
  }

  // Child stagger: offset each direct child's transition/animations
  if (stagger > 0) {
    const kids = element.querySelectorAll(":scope > *");
    kids.forEach((kid, i) => {
      kid.style.animationDelay = `${(i + 1) * stagger}s`;
      kid.style.transitionDelay = `${(i + 1) * stagger}s`;
    });
  }

  if (anim.hover) {
    const hoverMap = {
      scaleUp: "scale(1.05)",
      lift: "translateY(-4px)",
      glow: "drop-shadow(0 0 12px var(--accent))",
    };
    if (hoverMap[anim.hover]) {
      element.addEventListener("mouseenter", () => {
        element.style.transform = hoverMap[anim.hover];
      });
      element.addEventListener("mouseleave", () => {
        element.style.transform = "none";
      });
    } else if (anim.hover === "magnetic") {
      element.classList.add("anim-hover-magnetic");
      element.addEventListener("mousemove", (e) => {
        const r = element.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * 0.2;
        const dy = (e.clientY - (r.top + r.height / 2)) * 0.2;
        element.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      });
      element.addEventListener("mouseleave", () => {
        element.style.transform = "";
      });
    } else if (anim.hover === "tilt") {
      element.classList.add("anim-hover-tilt");
      element.addEventListener("mousemove", (e) => {
        const r = element.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        element.style.transform = `perspective(600px) rotateY(${(px * 8).toFixed(1)}deg) rotateX(${(-py * 8).toFixed(1)}deg)`;
      });
      element.addEventListener("mouseleave", () => {
        element.style.transform = "";
      });
    } else {
      // ripple / spotlight via CSS classes
      element.classList.add(`anim-hover-${anim.hover}`);
    }
  }
}

// ===== Token Panel =====

function renderTokenPanel() {
  const list = $("token-list");

  if (!currentState || !currentState.tokens) {
    list.innerHTML = `<div class="token-empty">${t("tokenEmpty")}</div>`;
    return;
  }

  const tokens = currentState.tokens[activeTokenTab] || {};
  let keys = Object.keys(tokens);
  if (tokenSearchQuery) {
    keys = keys.filter((key) => {
      const token = tokens[key];
      return (
        key.toLowerCase().includes(tokenSearchQuery) ||
        String(token.value).toLowerCase().includes(tokenSearchQuery)
      );
    });
  }

  if (keys.length === 0) {
    list.innerHTML = `<div class="token-empty">${t("tokenEmptyCategory")}</div>`;
    return;
  }

  list.innerHTML = "";

  keys.forEach((key) => {
    const token = tokens[key];
    const item = el("div", "token-item");

    const row = el("div", "token-row");

    // Color swatch for color tokens
    if (activeTokenTab === "colors" && isColorValue(token.value)) {
      const swatch = el("div", "token-color-swatch");
      swatch.style.background = token.value;
      swatch.title = "点击选择颜色";
      swatch.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "color";
        input.value = normalizeColorForPicker(token.value);
        input.style.position = "absolute";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.click();
        input.addEventListener("change", () => {
          sendTokenUpdate(activeTokenTab, key, input.value);
          document.body.removeChild(input);
        });
      });
      row.appendChild(swatch);
    }

    const label = el("span", "token-label", key);
    row.appendChild(label);

    const source = el("span", `token-source ${token.source || "preset"}`, token.source || "preset");
    row.appendChild(source);

    item.appendChild(row);

    // Value input
    const input = el("input", "token-value-input");
    input.value = token.value;
    input.dataset.category = activeTokenTab;
    input.dataset.key = key;

    // Debounced send on change
    let debounceTimer = null;
    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        sendTokenUpdate(activeTokenTab, key, input.value);
      }, 500);
    });

    input.addEventListener("blur", () => {
      clearTimeout(debounceTimer);
      sendTokenUpdate(activeTokenTab, key, input.value);
    });

    item.appendChild(input);

    // Slider for numeric values
    if (isNumericToken(key, token.value)) {
      const slider = el("input", "token-slider");
      slider.type = "range";
      const { min, max, val } = getSliderRange(key, token.value);
      slider.min = min;
      slider.max = max;
      slider.value = val;

      let sliderDebounce = null;
      slider.addEventListener("input", () => {
        input.value = slider.value + (token.value.includes("rem") ? "rem" : "px");
        clearTimeout(sliderDebounce);
        sliderDebounce = setTimeout(() => {
          sendTokenUpdate(activeTokenTab, key, input.value);
        }, 200);
      });

      item.appendChild(slider);
    }

    list.appendChild(item);
  });
}

function isColorValue(value) {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value) ||
         /^rgb/.test(value) ||
         /^hsl/.test(value);
}

function normalizeColorForPicker(value) {
  // Convert to #RRGGBB for the color input
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value;
  if (/^#[0-9A-Fa-f]{3}$/.test(value)) {
    return "#" + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
  }
  // Try to parse rgb/hsl via a temporary element
  const temp = document.createElement("div");
  temp.style.color = value;
  document.body.appendChild(temp);
  const computed = getComputedStyle(temp).color;
  document.body.removeChild(temp);
  const match = computed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, "0");
    const g = parseInt(match[2]).toString(16).padStart(2, "0");
    const b = parseInt(match[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return "#000000";
}

function isNumericToken(key, value) {
  if (key.startsWith("space-") || key.startsWith("radius-") || key.startsWith("text-")) {
    return /\d/.test(value);
  }
  return false;
}

function getSliderRange(key, value) {
  const numMatch = value.match(/([\d.]+)/);
  if (!numMatch) return { min: 0, max: 100, val: 50 };
  const val = parseFloat(numMatch[1]);
  const unit = value.includes("rem") ? "rem" : "px";
  const isPx = unit === "px";

  if (key.startsWith("space-")) {
    return { min: 0, max: isPx ? 128 : 8, val: Math.min(val, isPx ? 128 : 8) };
  }
  if (key.startsWith("radius-")) {
    return { min: 0, max: isPx ? 48 : 3, val: Math.min(val, isPx ? 48 : 3) };
  }
  if (key.startsWith("text-")) {
    return { min: isPx ? 10 : 0.5, max: isPx ? 64 : 4, val: Math.min(val, isPx ? 64 : 4) };
  }
  return { min: 0, max: 100, val };
}

// ===== Activity Log =====

function renderActivityLog() {
  const list = $("activity-list");

  if (!currentState || !currentState.activityLog || currentState.activityLog.length === 0) {
    list.innerHTML = `<div class="activity-empty">${t("activityEmpty")}</div>`;
    return;
  }

  list.innerHTML = "";
  let entries = currentState.activityLog;
  if (activitySourceFilter) {
    entries = entries.filter((e) => e.source === activitySourceFilter);
  }
  if (activitySearchQuery) {
    entries = entries.filter((e) =>
      String(e.detail || "").toLowerCase().includes(activitySearchQuery) ||
      String(e.action || "").toLowerCase().includes(activitySearchQuery)
    );
  }
  if (entries.length === 0) {
    list.innerHTML = `<div class="activity-empty">—</div>`;
    return;
  }
  entries.forEach((entry) => {
    addActivityEntry(entry, list);
  });
}

function addActivityEntry(entry, container) {
  const list = container || $("activity-list");

  // Remove empty state
  const empty = list.querySelector(".activity-empty");
  if (empty) empty.remove();

  const div = el("div", `activity-entry ${entry.source}`);

  const header = el("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:start;";

  const left = el("div");
  left.appendChild(el("span", "act-source", entry.source === "ai" ? t("ai") : t("user")));
  left.appendChild(el("span", "act-detail", entry.detail));
  header.appendChild(left);

  const time = el("span", "act-time", formatTime(entry.timestamp));
  header.appendChild(time);

  div.appendChild(header);
  list.insertBefore(div, list.firstChild);

  // Keep max 100 entries
  while (list.children.length > 100) {
    list.removeChild(list.lastChild);
  }
}

function formatTime(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

// ===== Apply Tokens to Canvas =====

function applyTokensToCanvas() {
  if (!currentState || !currentState.tokens) return;

  const root = document.documentElement;

  // Apply all token categories as CSS variables
  const categories = ["colors", "typography", "spacing", "shadows", "radii", "transitions"];
  categories.forEach((cat) => {
    const tokens = currentState.tokens[cat] || {};
    Object.entries(tokens).forEach(([key, token]) => {
      root.style.setProperty(`--${key}`, token.value);
    });
  });

  // Apply primary color to accent
  const primary = currentState.tokens.colors?.["color-primary"];
  if (primary) {
    root.style.setProperty("--accent", primary.value);
  }
  const primaryLight = currentState.tokens.colors?.["color-primary-light"];
  if (primaryLight) {
    root.style.setProperty("--accent-light", primaryLight.value);
  }
  const bg = currentState.tokens.colors?.["color-bg"];
  if (bg) {
    root.style.setProperty("--bg", bg.value);
  }
  const surface = currentState.tokens.colors?.["color-surface"];
  if (surface) {
    root.style.setProperty("--surface", surface.value);
  }
  const text = currentState.tokens.colors?.["color-text"];
  if (text) {
    root.style.setProperty("--text", text.value);
  }
  const textMuted = currentState.tokens.colors?.["color-text-muted"];
  if (textMuted) {
    root.style.setProperty("--text-muted", textMuted.value);
  }
  const border = currentState.tokens.colors?.["color-border"];
  if (border) {
    root.style.setProperty("--border", border.value);
  }

  // Re-render canvas to pick up new token values
  // Only if there are components
  if (currentState.components && currentState.components.length > 0) {
    // Apply font families — use BODY font for --font, DISPLAY font for --font-display
    // Always include CJK fallback fonts so Chinese characters render correctly
    const cjkFallback = "'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'WenQuanYi Micro Hei', sans-serif";
    const fontDisplay = currentState.tokens.typography?.["font-display"];
    if (fontDisplay) {
      root.style.setProperty("--font-display", fontDisplay.value + ", " + cjkFallback);
    }
    const fontBody = currentState.tokens.typography?.["font-body"];
    if (fontBody) {
      root.style.setProperty("--font", fontBody.value + ", " + cjkFallback);
    }
  }
}

// ===== User Actions =====

function sendTokenUpdate(category, key, value) {
  send({
    type: "set_token",
    category,
    key,
    value,
  });
}

function handleDeleteComponent(id) {
  send({
    type: "remove_component",
    id,
  });
}

// ===== Tab Switching =====

function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTokenTab = tab.dataset.tab;
      renderTokenPanel();
    });
  });
}

// ===== Platform Switcher =====

function setupPlatformSwitcher() {
  const select = $("platform-select");
  if (!select) return;
  select.value = currentPlatform;
  select.addEventListener("change", () => {
    currentPlatform = select.value;
    const canvas = $("canvas");
    applyPlatform(canvas);
    send({ type: "set_platform", platform: currentPlatform });
  });
}

// ===== Undo / Redo =====

function setupUndoRedo() {
  const undoBtn = $("undo-btn");
  const redoBtn = $("redo-btn");

  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      send({ type: "undo" });
    });
  }
  if (redoBtn) {
    redoBtn.addEventListener("click", () => {
      send({ type: "redo" });
    });
  }

  // Global keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;
    if (ctrlKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        send({ type: "redo" });
      } else {
        send({ type: "undo" });
      }
    }
    // Also support Ctrl+Y for redo
    if (ctrlKey && e.key.toLowerCase() === "y") {
      e.preventDefault();
      send({ type: "redo" });
    }
  });
}

function updateUndoRedoButtons() {
  const undoBtn = $("undo-btn");
  const redoBtn = $("redo-btn");
  if (!currentState) return;
  // Use canUndo/canRedo if provided by server, otherwise default to enabled
  const canUndo = currentState.canUndo !== undefined ? currentState.canUndo : true;
  const canRedo = currentState.canRedo !== undefined ? currentState.canRedo : true;
  if (undoBtn) undoBtn.disabled = !canUndo;
  if (redoBtn) redoBtn.disabled = !canRedo;
}

// ===== Theme Toggle =====

function setupThemeToggle() {
  const toggle = $("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const newMode = (currentState && currentState.themeMode === "dark") ? "light" : "dark";
      send({ type: "set_theme", mode: newMode });
    });
  }
}

function applyTheme() {
  if (!currentState) return;
  const mode = currentState.themeMode || "light";
  const toggle = $("theme-toggle");
  if (mode === "dark") {
    document.body.classList.add("theme-dark");
    if (toggle) toggle.textContent = "主题";
  } else {
    document.body.classList.remove("theme-dark");
    if (toggle) toggle.textContent = "主题";
  }
}

// ===== Page Switcher =====

function renderPageSwitcher() {
  const container = $("page-tabs");
  if (!container) return;

  if (!currentState || !currentState.pages || currentState.pages.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = "";
  const currentId = currentState.currentPageId;

  currentState.pages.forEach((page) => {
    const tab = el("div", "page-tab" + (page.id === currentId ? " active" : ""));
    tab.dataset.pageId = page.id;

    const name = el("span", "page-name", page.name || "未命名");
    tab.appendChild(name);

    const delBtn = el("button", "page-del", "✕");
    delBtn.title = "删除页面";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Don't allow deleting if only one page left
      if (currentState.pages.length <= 1) return;
      send({ type: "remove_page", pageId: page.id });
    });
    // Disable delete if only one page
    if (currentState.pages.length <= 1) {
      delBtn.style.opacity = "0.3";
      delBtn.style.cursor = "not-allowed";
    }
    tab.appendChild(delBtn);

    // Click to switch page
    tab.addEventListener("click", () => {
      if (page.id !== currentState.currentPageId) {
        send({ type: "switch_page", pageId: page.id });
      }
    });

    // Double-click to rename
    name.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startPageRename(name, page.id);
    });

    container.appendChild(tab);
  });
}

function startPageRename(nameEl, pageId) {
  nameEl.contentEditable = "true";
  nameEl.focus();
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const commit = () => {
    nameEl.contentEditable = "false";
    const newName = nameEl.textContent.trim();
    if (newName) {
      send({ type: "rename_page", pageId: pageId, name: newName });
    } else {
      // Restore name
      const page = currentState.pages.find((p) => p.id === pageId);
      nameEl.textContent = page ? page.name : "未命名";
    }
  };

  nameEl.addEventListener("blur", commit, { once: true });
  nameEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nameEl.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      const page = currentState.pages.find((p) => p.id === pageId);
      nameEl.textContent = page ? page.name : "未命名";
      nameEl.blur();
    }
  });
}

function setupPageSwitcher() {
  const addBtn = $("page-add-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const name = "页面 " + (currentState && currentState.pages ? currentState.pages.length + 1 : 1);
      send({ type: "add_page", name: name });
    });
  }
}

// ===== Export Modal =====

function setupExportModal() {
  const exportBtn = $("export-btn");
  const modal = $("export-modal");
  const closeBtn = $("export-close");
  const copyBtn = $("export-copy");
  const openBtn = $("export-open");
  const tabs = document.querySelectorAll(".export-tab");

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      modal.style.display = "flex";
      fetchExportCode(currentExportFormat);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  // Close on overlay click
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentExportFormat = tab.dataset.format;
      fetchExportCode(currentExportFormat);
    });
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const code = $("export-code").textContent;
      copyToClipboard(code);
      copyBtn.textContent = "已复制!";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.textContent = "复制代码";
        copyBtn.classList.remove("copied");
      }, 2000);
    });
  }

  // Open the exported HTML as a standalone page in a new tab — the fastest
  // way for non-coders to see, save, or share what they built.
  if (openBtn) {
    openBtn.addEventListener("click", async () => {
      try {
        const response = await fetch("/api/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format: "html" }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        const blob = new Blob([String(data.code || "")], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, "_blank");
        if (!win) {
          alert(t("previewOpened") + " (弹窗被拦截)");
        } else {
          showToastMsg(t("previewOpened"));
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) {
        console.error("Open preview failed:", err);
        showToastMsg(t("explainFailed") + ": " + err.message, true);
      }
    });
  }

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display === "flex") {
      modal.style.display = "none";
    }
  });
}

async function fetchExportCode(format) {
  const codeEl = $("export-code");
  if (!codeEl) return;
  codeEl.textContent = "正在生成代码...";
  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: format }),
    });
    if (response.ok) {
      const data = await response.json();
      codeEl.textContent = data.code || data.output || JSON.stringify(data, null, 2);
    } else {
      codeEl.textContent = "导出失败: " + response.status;
    }
  } catch (err) {
    codeEl.textContent = "导出失败: " + err.message;
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    // Fallback
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand("copy"); } catch (err) {}
    document.body.removeChild(textarea);
  }
}

// ===== Screenshot =====

function setupScreenshot() {
  const btn = $("screenshot-btn");
  if (!btn) return;
  btn.addEventListener("click", takeScreenshot);
}

async function takeScreenshot() {
  const canvas = $("canvas");
  if (!canvas) return;

  // Real PNG via the server render pipeline (Playwright); fall back to HTML.
  try {
    const response = await fetch("/api/render?format=png&viewport=desktop");
    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "prism-preview.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return;
    }
  } catch (err) {
    console.warn("PNG screenshot failed, falling back to HTML preview:", err);
  }
  openHtmlScreenshot();
}

function openHtmlScreenshot() {
  const canvas = $("canvas");
  if (!canvas) return;

  // Simplified approach: open a new window with canvas HTML + inline styles
  const canvasHTML = canvas.innerHTML;
  const computedStyle = window.getComputedStyle(document.documentElement);
  const cssVars = [];
  const varProps = ["--bg", "--surface", "--surface-hover", "--border", "--text", "--text-muted", "--text-dim", "--accent", "--accent-light", "--accent-bg", "--success", "--warning", "--danger", "--radius", "--font", "--mono"];
  varProps.forEach((v) => {
    const val = computedStyle.getPropertyValue(v).trim();
    if (val) cssVars.push(`${v}: ${val};`);
  });

  const win = window.open("", "_blank");
  if (!win) {
    alert("无法打开新窗口，请允许弹出窗口后重试");
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Prism 截图预览</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
:root { ${cssVars.join(" ")} }
body { font-family: var(--font); background: var(--bg); color: var(--text); padding: 24px; }
.toolbar { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 999; }
.toolbar button { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; font-size: 13px; }
.toolbar button:hover { border-color: var(--accent); }
.screenshot-container { max-width: 100%; }
.comp-wrapper { position: relative; margin-bottom: 16px; }
.comp-overlay { display: none; }
${getCanvasInlineStyles()}
</style>
</head>
<body>
<div class="toolbar">
  <button onclick="window.print()">打印 / 保存为 PDF</button>
  <button onclick="downloadHTML()">下载 HTML</button>
</div>
<div class="screenshot-container">
${canvasHTML}
</div>
<script>
function downloadHTML() {
  const html = document.documentElement.outerHTML;
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'prism-screenshot.html';
  a.click();
}
<\/script>
</body>
</html>`);
  win.document.close();
}

function getCanvasInlineStyles() {
  // Collect inline styles from style.css that affect canvas components
  const styles = document.querySelectorAll("style");
  let css = "";
  // Try to extract component styles from the loaded stylesheet
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.cssText && (
          rule.cssText.includes(".comp-") ||
          rule.cssText.includes(".btn") ||
          rule.cssText.includes(".card-") ||
          rule.cssText.includes(".nav-") ||
          rule.cssText.includes(".feature-") ||
          rule.cssText.includes("[data-editable") ||
          rule.cssText.includes(".tabs") ||
          rule.cssText.includes(".acc-") ||
          rule.cssText.includes(".carousel-") ||
          rule.cssText.includes(".modal-") ||
          rule.cssText.includes(".sidebar-") ||
          rule.cssText.includes(".crumb") ||
          rule.cssText.includes(".page-btn") ||
          rule.cssText.includes(".progress-") ||
          rule.cssText.includes(".comp-badge") ||
          rule.cssText.includes(".comp-avatar")
        )) {
          css += rule.cssText + "\n";
        }
      }
    } catch (e) {
      // Cross-origin stylesheet, skip
    }
  }
  return css;
}

// ===== Explain Design (plain-language, for non-professionals) =====

function setupExplain() {
  const btn = $("explain-btn");
  const modal = $("explain-modal");
  const closeBtn = $("explain-close");
  if (!btn || !modal) return;

  btn.addEventListener("click", openExplainModal);

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display === "flex") {
      modal.style.display = "none";
    }
  });
}

function openExplainModal() {
  const modal = $("explain-modal");
  const content = $("explain-content");
  if (!modal || !content) return;
  modal.style.display = "flex";
  content.innerHTML = `<p class="explain-loading">${t("explainLoading")}</p>`;
  const lang = uiLang === "en" ? "en" : "zh";
  fetch(`/api/explain?lang=${lang}`)
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((data) => renderExplain(data))
    .catch((err) => {
      console.error("Explain failed:", err);
      content.innerHTML = `<p class="explain-failed">${t("explainFailed")}</p>`;
    });
}

function renderExplain(data) {
  const content = $("explain-content");
  if (!content) return;
  content.innerHTML = "";

  content.appendChild(el("p", "explain-summary", String(data.summary || "")));

  if (Array.isArray(data.facts) && data.facts.length > 0) {
    const facts = el("ul", "explain-facts");
    data.facts.forEach((fact) => facts.appendChild(el("li", "explain-fact", String(fact))));
    content.appendChild(facts);
  }

  if (Array.isArray(data.conflicts) && data.conflicts.length > 0) {
    const box = el("div", "explain-conflicts");
    data.conflicts.forEach((c) => box.appendChild(el("div", "explain-conflict", "⚠ " + String(c))));
    content.appendChild(box);
  }

  if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
    content.appendChild(el("div", "explain-try", t("tryThese")));
    const list = el("div", "explain-suggestions");
    data.suggestions.forEach((s) => {
      const row = el("button", "explain-suggest", String(s.phrase));
      row.type = "button";
      const effect = el("span", "explain-suggest-effect", String(s.effect || ""));
      row.appendChild(effect);
      row.addEventListener("click", () => {
        const modal = $("explain-modal");
        if (modal) modal.style.display = "none";
        const input = $("prompt-input");
        if (input) {
          input.value = String(s.phrase);
          input.focus();
        }
      });
      list.appendChild(row);
    });
    content.appendChild(list);
  }
}

// ===== AI Prompt Bar =====

let promptStatusTimer = null;
let promptSuggestTimer = null;

function setPromptStatus(text, cls) {
  const status = $("prompt-status");
  if (!status) return;
  status.textContent = text;
  status.className = "prompt-status show" + (cls ? " " + cls : "");
  clearTimeout(promptStatusTimer);
  promptStatusTimer = setTimeout(() => {
    status.className = "prompt-status";
  }, cls === "accepted" ? 4000 : 20000);
}

function setupPromptBar() {
  const input = $("prompt-input");
  const sendBtn = $("prompt-send");
  if (!input || !sendBtn) return;

  sendBtn.addEventListener("click", () => sendPrompt());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendPrompt();
    }
  });
  input.addEventListener("input", () => hidePromptSuggestions());
}

/** Show clickable example instructions when the built-in engine cannot act. */
function showPromptSuggestions(suggestions) {
  const container = $("prompt-suggest");
  if (!container || !Array.isArray(suggestions) || suggestions.length === 0) return;
  container.innerHTML = "";
  const label = el("span", "suggest-label", t("promptNotUnderstood"));
  container.appendChild(label);
  suggestions.slice(0, 4).forEach((phrase) => {
    const chip = el("button", "suggest-chip", String(phrase));
    chip.type = "button";
    chip.addEventListener("click", () => {
      hidePromptSuggestions();
      sendPrompt(String(phrase));
    });
    container.appendChild(chip);
  });
  const dismiss = el("button", "suggest-dismiss", "×");
  dismiss.type = "button";
  dismiss.title = t("dismiss") || "关闭";
  dismiss.addEventListener("click", hidePromptSuggestions);
  container.appendChild(dismiss);
  container.style.display = "flex";
  // Auto-hide so the bar never blocks the canvas for long.
  clearTimeout(promptSuggestTimer);
  promptSuggestTimer = setTimeout(hidePromptSuggestions, 45000);
}

function hidePromptSuggestions() {
  const container = $("prompt-suggest");
  if (container) container.style.display = "none";
  clearTimeout(promptSuggestTimer);
}

function applyPromptResult(result) {
  if (!result) return;
  if (result.executed) {
    setPromptStatus(t("promptExecuted", { summary: result.summary || "" }), "accepted");
    showToastMsg(t("promptExecuted", { summary: result.summary || "" }));
  } else if (result.llm === "generating") {
    setPromptStatus(t("llmGenerating"), "queued");
    showToastMsg(t("llmGenerating"));
  } else {
    setPromptStatus(t("promptQueued"), "queued");
    if (Array.isArray(result.suggestions) && result.suggestions.length > 0) {
      showPromptSuggestions(result.suggestions);
    }
  }
}

function sendPrompt(text) {
  const input = $("prompt-input");
  const sendBtn = $("prompt-send");
  const value = (text !== undefined ? String(text) : input ? input.value : "").trim();
  if (!value) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    send({ type: "prompt", prompt: value });
  } else {
    // WebSocket unavailable: fall back to the REST prompt endpoint so the
    // instruction still reaches the agent queue, and surface its result.
    fetch("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: value }),
    })
      .then((response) => response.json())
      .then((data) => applyPromptResult(data))
      .catch((err) => {
        console.error("Prompt fallback failed:", err);
        setPromptStatus(t("promptQueued") + " (WS↓)", "queued");
      });
  }
  setPromptStatus(t("promptQueued"), "queued");
  if (input) input.value = "";
  // Visual feedback
  if (sendBtn) {
    sendBtn.classList.add("sent");
    sendBtn.textContent = t("sent");
    setTimeout(() => {
      sendBtn.classList.remove("sent");
      sendBtn.textContent = t("send");
    }, 1200);
  }
}

// ===== Quick actions: prompt chips, shortcuts help, command palette =====

const QUICK_CHIP_PROMPTS = [
  { key: "chipDark", prompts: { zh: "深色模式", en: "dark mode" } },
  { key: "chipLight", prompts: { zh: "浅色模式", en: "light mode" } },
  { key: "chipSaaS", prompts: { zh: "应用 SaaS 模板", en: "apply the SaaS template" } },
  { key: "chipEcommerce", prompts: { zh: "应用电商模板", en: "apply the e-commerce template" } },
  { key: "chipBigger", prompts: { zh: "字太小了，大一点", en: "make the text bigger" } },
  { key: "chipGlass", prompts: { zh: "换成玻璃拟态风格", en: "switch to the glassmorphism style" } },
  { key: "chipPricing", prompts: { zh: "添加一个定价表", en: "add a pricing table" } },
  { key: "chipUndo", prompts: { zh: "撤销", en: "undo" } },
  { key: "chipClear", prompts: { zh: "清空", en: "clear all" } },
];

function setupPromptChips() {
  const container = $("prompt-chips");
  if (!container) return;
  container.innerHTML = "";
  QUICK_CHIP_PROMPTS.forEach((chip) => {
    const btn = el("button", "prompt-chip", t(chip.key));
    btn.type = "button";
    btn.addEventListener("click", () => sendPrompt(chip.prompts[uiLang] || chip.prompts.zh));
    container.appendChild(btn);
  });
}

function renderHelpShortcuts() {
  const grid = $("help-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const groups = [
    {
      title: t("helpGeneral"),
      items: [
        { keys: ["?"], labelKey: "scHelp" },
        { keys: ["Ctrl", "K"], labelKey: "scPalette" },
        { keys: ["/"], labelKey: "scPrompt" },
        { keys: ["P"], labelKey: "scCanvas" },
      ],
    },
    {
      title: t("helpEdit"),
      items: [
        { keys: ["Ctrl", "Z"], labelKey: "scUndo" },
        { keys: ["Ctrl", "Shift", "Z"], labelKey: "scRedo" },
        { keys: ["Del"], labelKey: "scDelete" },
      ],
    },
  ];
  groups.forEach((group) => {
    const section = el("div", "help-section");
    section.appendChild(el("div", "help-section-title", group.title));
    group.items.forEach((item) => {
      const row = el("div", "help-row");
      const kbdWrap = el("div", "help-keys");
      item.keys.forEach((k, i) => {
        if (i > 0) kbdWrap.appendChild(el("span", "help-key-plus", "+"));
        kbdWrap.appendChild(el("kbd", "help-key", k));
      });
      row.appendChild(kbdWrap);
      row.appendChild(el("span", "help-row-label", t(item.labelKey)));
      section.appendChild(row);
    });
    grid.appendChild(section);
  });
}

function toggleHelp(force) {
  const overlay = $("help-overlay");
  if (!overlay) return false;
  const show = force !== undefined ? force : overlay.style.display !== "flex";
  overlay.style.display = show ? "flex" : "none";
  return show;
}

function buildCommands() {
  const pageCount = currentState && currentState.pages ? currentState.pages.length + 1 : 1;
  return [
    {
      id: "add_page",
      label: t("cmdAddPage"),
      icon: "▤",
      run: () => send({ type: "add_page", name: "页面 " + pageCount }),
    },
    { id: "theme_dark", label: t("cmdThemeDark"), icon: "◑", run: () => send({ type: "set_theme", mode: "dark" }) },
    { id: "theme_light", label: t("cmdThemeLight"), icon: "○", run: () => send({ type: "set_theme", mode: "light" }) },
    { id: "tpl_saas", label: t("cmdTplSaaS"), icon: "▲", run: () => sendPrompt("应用 SaaS 模板") },
    { id: "tpl_ecommerce", label: t("cmdTplEcommerce"), icon: "▣", run: () => sendPrompt("应用电商模板") },
    { id: "clear", label: t("cmdClear"), icon: "✕", run: () => sendPrompt("清空") },
    { id: "project", label: t("cmdProject"), icon: "▤", run: () => { const b = $("project-btn"); if (b) b.click(); } },
    { id: "save", label: t("cmdSaveProject"), icon: "▣", run: saveCurrentProject },
    { id: "export", label: t("cmdExport"), icon: "↑", run: () => { const b = $("export-btn"); if (b) b.click(); } },
    { id: "canvas", label: t("cmdCanvas"), icon: "✎", run: () => setCanvasEditorMode(true) },
    { id: "screenshot", label: t("cmdScreenshot"), icon: "▣", run: takeScreenshot },
    { id: "help", label: t("cmdHelp"), icon: "?", run: () => toggleHelp(true) },
    { id: "undo", label: t("cmdUndo"), icon: "↩", run: () => send({ type: "undo" }) },
    { id: "redo", label: t("cmdRedo"), icon: "↪", run: () => send({ type: "redo" }) },
  ];
}

function saveCurrentProject() {
  const projectBtn = $("project-btn");
  const saveBtn = $("project-save-btn");
  if (projectBtn) projectBtn.click();
  if (saveBtn) saveBtn.click();
}

let commandActiveIndex = -1;
let commandItems = [];

function commandPaletteOpen() {
  const overlay = $("command-overlay");
  return overlay && overlay.style.display === "flex";
}

function closeCommandPalette() {
  const overlay = $("command-overlay");
  const input = $("command-input");
  if (overlay) overlay.style.display = "none";
  if (input) input.blur();
}

function toggleCommandPalette() {
  const overlay = $("command-overlay");
  const input = $("command-input");
  if (!overlay) return;
  const open = overlay.style.display !== "flex";
  overlay.style.display = open ? "flex" : "none";
  if (open) {
    commandActiveIndex = -1;
    if (input) input.value = "";
    renderCommandList("");
    if (input) setTimeout(() => input.focus(), 0);
  } else if (input) {
    input.blur();
  }
}

function runCommandItem(item) {
  closeCommandPalette();
  try {
    item.run();
  } catch (err) {
    console.error("Command failed:", err);
    showToastMsg(err.message || t("cmdNoResults"), true);
  }
}

function renderCommandList(filter) {
  const list = $("command-list");
  if (!list) return;
  const q = (filter || "").trim().toLowerCase();
  let items = buildCommands().filter(
    (c) => !q || c.label.toLowerCase().includes(q) || c.id.includes(q)
  );
  if (q) {
    const raw = filter.trim();
    items = [
      { id: "run_prompt", label: raw, icon: "↑", run: () => sendPrompt(raw) },
      ...items,
    ];
  }
  commandItems = items;
  list.innerHTML = "";
  if (items.length === 0) {
    list.appendChild(el("div", "command-empty", t("cmdNoResults")));
    return;
  }
  items.forEach((item, i) => {
    const row = el("button", "command-row" + (i === commandActiveIndex ? " active" : ""));
    row.type = "button";
    row.appendChild(el("span", "command-row-icon", item.icon || ""));
    row.appendChild(el("span", "command-row-label", item.label));
    row.addEventListener("click", () => runCommandItem(item));
    row.addEventListener("mousemove", () => {
      commandActiveIndex = i;
      updateCommandActive();
    });
    list.appendChild(row);
  });
}

function moveCommandActive(delta) {
  if (commandItems.length === 0) return;
  commandActiveIndex = (commandActiveIndex + delta + commandItems.length) % commandItems.length;
  updateCommandActive();
}

function updateCommandActive() {
  const list = $("command-list");
  if (!list) return;
  Array.from(list.children).forEach((row, i) => {
    row.classList.toggle("active", i === commandActiveIndex);
  });
  const active = list.children[commandActiveIndex];
  if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
}

function setupCommandPalette() {
  const overlay = $("command-overlay");
  const input = $("command-input");
  if (!overlay || !input) return;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeCommandPalette();
  });
  input.addEventListener("input", () => {
    commandActiveIndex = -1;
    renderCommandList(input.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveCommandActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveCommandActive(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = commandItems[commandActiveIndex] || commandItems[0];
      if (item) runCommandItem(item);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      closeCommandPalette();
    }
  });
}

function setupQuickActions() {
  setupPromptChips();
  renderHelpShortcuts();
  const helpOverlay = $("help-overlay");
  const helpClose = $("help-close");
  if (helpClose) helpClose.addEventListener("click", () => toggleHelp(false));
  if (helpOverlay) {
    helpOverlay.addEventListener("click", (e) => {
      if (e.target === helpOverlay) toggleHelp(false);
    });
  }

  document.addEventListener("keydown", (e) => {
    const tag = e.target && e.target.tagName;
    const typing =
      tag === "INPUT" ||
      tag === "SELECT" ||
      tag === "TEXTAREA" ||
      (e.target && e.target.contentEditable === "true");
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

    if (ctrlKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      toggleCommandPalette();
      return;
    }
    if (e.key === "Escape") {
      if (commandPaletteOpen()) {
        closeCommandPalette();
        return;
      }
      if (helpOverlay && helpOverlay.style.display === "flex") {
        toggleHelp(false);
        return;
      }
      return;
    }
    if (typing) return;
    if (e.key === "?") {
      e.preventDefault();
      toggleHelp();
      return;
    }
    if (e.key === "/") {
      e.preventDefault();
      const input = $("prompt-input");
      if (input) input.focus();
      return;
    }
    if (e.key.toLowerCase() === "p") {
      e.preventDefault();
      setCanvasEditorMode(!canvasEditorMode);
    }
  });
}

// ===== Conflict Warnings =====

function setupConflictCheck() {
  // Check conflicts periodically (every 30s) and after token changes
  if (conflictCheckInterval) clearInterval(conflictCheckInterval);
  conflictCheckInterval = setInterval(checkConflicts, 30000);
}

async function checkConflicts() {
  const container = $("conflict-warnings");
  if (!container) return;

  try {
    const response = await fetch("/api/conflicts");
    if (!response.ok) {
      container.innerHTML = "";
      return;
    }
    const data = await response.json();
    const conflicts = data.conflicts || data || [];
    renderConflictWarnings(container, Array.isArray(conflicts) ? conflicts : []);
  } catch (err) {
    // Silently clear if endpoint not available
    container.innerHTML = "";
  }
}

function renderConflictWarnings(container, conflicts) {
  container.innerHTML = "";
  if (conflicts.length === 0) {
    // Premium pass state (spec §5.3): green card with the real WCAG ratio
    const hasTokens =
      currentState && currentState.tokens && Object.keys(currentState.tokens.colors || {}).length > 0;
    if (hasTokens) {
      const textColor = currentState.tokens.colors["color-text"]?.value;
      const bgColor = currentState.tokens.colors["color-bg"]?.value;
      let ratio = null;
      if (textColor && bgColor) {
        ratio = wcagContrastRatio(textColor, bgColor);
      }
      const card = el("div", "conflict-pass");
      card.appendChild(el("span", null, "✓ " + t("contrastPass")));
      if (ratio !== null) {
        card.appendChild(el("span", "cp-ratio", `WCAG AA ${ratio.toFixed(1)}:1`));
      }
      container.appendChild(card);
    }
    return;
  }

  conflicts.forEach((conflict) => {
    const warning = el("div", "conflict-warning");
    const icon = el("span", "warn-icon", "!");
    const text = el("span", "warn-text", conflict.message || conflict.description || `令牌冲突: ${conflict.key || conflict.token || ""}`);
    warning.appendChild(icon);
    warning.appendChild(text);

    // Click to jump to the token
    if (conflict.key || conflict.token || conflict.category) {
      warning.addEventListener("click", () => {
        const category = conflict.category || "colors";
        // Switch to the relevant token tab
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${category}"]`);
        if (tabBtn) tabBtn.click();
      });
      warning.title = "点击查看相关令牌";
    }

    container.appendChild(warning);
  });
}

// ===== WCAG contrast (client-side) =====

function parseHex(hex) {
  let value = String(hex).trim();
  if (value.startsWith("#")) value = value.slice(1);
  if (value.length === 3) {
    value = value.split("").map((c) => c + c).join("");
  }
  const int = parseInt(value, 16);
  if (Number.isNaN(int)) return null;
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
}

function wcagContrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

// ===== Health Check Fallback =====

async function fetchInitialState() {
  try {
    const response = await fetch("/api/state");
    if (response.ok) {
      currentState = await response.json();
      renderAll();
    }
  } catch {
    // Will rely on WebSocket
  }
}

// ===== Import Project Modal =====

function setupImportModal() {
  const importBtn = $("import-btn");
  const modal = $("import-modal");
  const closeBtn = $("import-close");
  const goBtn = $("import-go");
  const pathInput = $("import-path");
  const clearCheckbox = $("import-clear");
  const urlInput = $("import-url");
  const htmlTextarea = $("import-html");
  const fileInput = $("import-file");
  const fileBtn = $("import-file-btn");
  const resultDiv = $("import-result");

  const resetResult = () => {
    if (resultDiv) {
      resultDiv.style.display = "none";
      resultDiv.innerHTML = "";
    }
  };
  const setResult = (html, cls) => {
    if (!resultDiv) return;
    resultDiv.style.display = "block";
    resultDiv.innerHTML = `<div class="${cls}">${html}</div>`;
  };
  const setLoading = (text) => {
    if (goBtn) {
      goBtn.disabled = true;
      goBtn.textContent = text;
    }
    setResult(`<div class="import-loading">${text}…</div>`, "");
  };
  const done = () => {
    if (goBtn) {
      goBtn.disabled = false;
      goBtn.textContent = t("importStart");
    }
  };

  // Tabs: folder / url / html / client / capture
  const tabs = document.querySelectorAll(".import-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const which = tab.dataset.importTab;
      ["folder", "url", "html", "client", "capture"].forEach((pane) => {
        const el = $("import-pane-" + pane);
        if (el) el.style.display = pane === which ? "" : "none";
      });
      resetResult();
    });
  });

  if (fileBtn && fileInput) {
    fileBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (htmlTextarea) htmlTextarea.value = String(reader.result || "");
        // Switch to the HTML pane so the user can review before importing
        tabs.forEach((t) => t.classList.toggle("active", t.dataset.importTab === "html"));
        ["folder", "url", "html", "client", "capture"].forEach((pane) => {
          const el = $("import-pane-" + pane);
          if (el) el.style.display = pane === "html" ? "" : "none";
        });
      };
      reader.readAsText(file);
    });
  }

  if (importBtn) {
    importBtn.addEventListener("click", () => {
      modal.style.display = "flex";
      resetResult();
      if (pathInput && !pathInput.value) pathInput.focus();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });
  }

  if (goBtn) {
    goBtn.addEventListener("click", async () => {
      const activeTab = document.querySelector(".import-tab.active");
      const which = activeTab ? activeTab.dataset.importTab : "folder";
      const clearExisting = clearCheckbox ? clearCheckbox.checked : false;

      // Folder import (existing flow)
      if (which === "folder") {
        const folderPath = pathInput.value.trim();
        if (!folderPath) {
          pathInput.focus();
          return;
        }
        setLoading("正在扫描项目文件夹，提取页面组件");
        try {
          const response = await fetch("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: folderPath, clear_existing: clearExisting }),
          });
          const data = await response.json();
          if (data.success) {
            const pagesHtml = data.pages
              .map(
                (p) =>
                  `<div class="import-page-item"><span class="import-page-name">${p.name}</span><span class="import-page-count">${p.componentCount} 个组件</span></div>`
              )
              .join("");
            setResult(
              `<div class="import-success-icon">✓</div>
               <div class="import-success-summary">扫描 ${data.scanned_files} 个文件，导入 ${data.pages_imported} 个页面，共 ${data.total_components} 个组件</div>
               <div class="import-page-list">${pagesHtml}</div>`,
              "import-success"
            );
            goBtn.textContent = t("importDone");
            setTimeout(() => {
              modal.style.display = "none";
              done();
            }, 2000);
            fetchInitialState();
          } else {
            setResult(data.message || data.error || t("importFailed"), "import-error");
            done();
          }
        } catch (err) {
          setResult(`请求失败: ${err.message || err}`, "import-error");
          done();
        }
        return;
      }

      // 打开客户端界面：把 Prism 自身 UI 导入画布（产品管线 ④ 来源二）
      if (which === "client") {
        setLoading("正在导入客户端界面");
        try {
          const response = await fetch("/api/import-client", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clear_existing: clearExisting }),
          });
          const data = await response.json();
          if (data.success) {
            setResult(
              `<div class="import-success-icon">✓</div>
               <div class="import-success-summary">已导入客户端界面（${data.imported || 0} 个组件），调整后可以一键应用回产物</div>`,
              "import-success"
            );
            goBtn.textContent = t("importDone");
            setTimeout(() => {
              modal.style.display = "none";
              done();
            }, 1500);
            await fetchInitialState();
            renderImportBanner();
          } else {
            setResult(data.error || data.message || t("importFailed"), "import-error");
            done();
          }
        } catch (err) {
          setResult(`请求失败: ${err.message || err}`, "import-error");
          done();
        }
        return;
      }

      // 截取实际界面：把真实运行的 Dashboard 截图放入画布（产品管线 ④ 来源三）
      if (which === "capture") {
        setLoading("正在截取实际界面");
        try {
          const response = await fetch("/api/capture-client", { method: "POST" });
          const data = await response.json();
          if (data.success) {
            setResult(
              `<div class="import-success-icon">✓</div>
               <div class="import-success-summary">已截取实际界面作为参考图（${data.file || ""}），调整后可以一键应用</div>`,
              "import-success"
            );
            goBtn.textContent = t("importDone");
            setTimeout(() => {
              modal.style.display = "none";
              done();
            }, 1500);
            await fetchInitialState();
            renderImportBanner();
          } else {
            setResult(data.error || data.message || t("importFailed"), "import-error");
            done();
          }
        } catch (err) {
          setResult(`请求失败: ${err.message || err}`, "import-error");
          done();
        }
        return;
      }

      // Product import (URL / HTML → 导入自己的产品 → 一键应用)
      const payload = which === "url" ? { url: urlInput ? urlInput.value.trim() : "" } : { html: htmlTextarea ? htmlTextarea.value : "" };
      if (which === "url" && !payload.url) {
        urlInput.focus();
        return;
      }
      if (which === "html" && !payload.html) {
        htmlTextarea.focus();
        return;
      }
      setLoading(which === "url" ? "正在抓取并解析网页" : "正在解析 HTML");
      try {
        const response = await fetch("/api/import/product", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (data.success) {
          setResult(
            `<div class="import-success-icon">✓</div>
             <div class="import-success-summary">${data.message || ""}</div>`,
            "import-success"
          );
          goBtn.textContent = t("importDone");
          setTimeout(() => {
            modal.style.display = "none";
            done();
          }, 1500);
          await fetchInitialState();
          renderImportBanner();
        } else {
          setResult(data.error || data.message || t("importFailed"), "import-error");
          done();
        }
      } catch (err) {
        setResult(`请求失败: ${err.message || err}`, "import-error");
        done();
      }
    });

    // Submit on Enter key (folder tab)
    if (pathInput) {
      pathInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") goBtn.click();
      });
    }
  }
}

// ===== 导入 → 调整 → 一键应用 banner =====

function renderImportBanner() {
  const banner = $("import-banner");
  if (!banner) return;
  const record = currentState && currentState.imports ? currentState.imports[currentState.currentPageId] : null;
  if (!record) {
    banner.style.display = "none";
    return;
  }
  banner.style.display = "flex";
  const text = $("import-banner-text");
  if (text) {
    text.textContent = t("importedBanner", { source: record.source, n: record.component_count });
  }
}

function setupApplyBanner() {
  const applyBtn = $("apply-btn");
  const rollbackBtn = $("apply-rollback-btn");
  const closeBtn = $("import-banner-close");
  const banner = $("import-banner");
  const resultModal = $("apply-result-modal");
  const resultClose = $("apply-result-close");
  const resultRollback = $("apply-result-rollback");
  const resultDone = $("apply-result-done");
  const resultList = $("apply-result-list");

  const closeResult = () => {
    if (resultModal) resultModal.style.display = "none";
  };
  if (resultClose) resultClose.addEventListener("click", closeResult);
  if (resultDone) resultDone.addEventListener("click", closeResult);
  if (resultModal) {
    resultModal.addEventListener("click", (e) => {
      if (e.target === resultModal) closeResult();
    });
  }

  const doRollback = async (btn) => {
    if (btn) btn.disabled = true;
    try {
      const res = await fetch("/api/apply/rollback", { method: "POST" });
      const data = await res.json();
      showToastMsg(data.success ? t("rolledBack", { file: data.restored ? data.restored.split(/[\\/]/).pop() : "" }) : (data.message || t("rollbackNone")));
      if (data.success) closeResult();
    } catch (err) {
      showToastMsg(t("appliedError") + ": " + err.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  if (applyBtn) {
    applyBtn.addEventListener("click", async () => {
      applyBtn.disabled = true;
      try {
        const res = await fetch("/api/apply", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || String(res.status));
        showToastMsg(t("appliedResult", { n: data.files.length, backup: data.backup ? data.backup.split(/[\\/]/).pop() : "—" }));
        // 展示产物路径：调整写到哪里 + 如何引入 CSS
        if (resultModal && resultList) {
          const html = data.files
            .map((f) => {
              const name = f.file.split(/[\\/]/).pop();
              const cssHint = name && name.endsWith(".css")
                ? `<div class="apply-result-hint">在你的产品 HTML 中加入：<code>&lt;link rel="stylesheet" href="${name}"&gt;</code></div>`
                : "";
              return `<div class="apply-result-item"><span class="apply-result-name">${name}</span><code class="apply-result-path">${f.file}</code>${cssHint}</div>`;
            })
            .join("");
          resultList.innerHTML = html;
          resultModal.style.display = "flex";
        }
      } catch (err) {
        showToastMsg(t("appliedError") + ": " + err.message, true);
      } finally {
        applyBtn.disabled = false;
      }
    });
  }
  if (rollbackBtn) {
    rollbackBtn.addEventListener("click", () => doRollback(rollbackBtn));
  }
  if (resultRollback) {
    resultRollback.addEventListener("click", () => doRollback(resultRollback));
  }
  if (closeBtn && banner) {
    closeBtn.addEventListener("click", () => {
      banner.style.display = "none";
    });
  }
}

// ===== Project Persistence (save / load) =====

function flashButton(btn, text, duration = 1500) {
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = text;
  btn.classList.add("sent");
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("sent");
  }, duration);
}

function setupProjectPersistence() {
  const projectBtn = $("project-btn");
  const modal = $("project-modal");
  const closeBtn = $("project-close");
  const saveBtn = $("project-save-btn");
  if (!projectBtn || !modal) return;

  projectBtn.addEventListener("click", () => {
    modal.style.display = "flex";
    renderProjectList();
  });
  if (closeBtn) closeBtn.addEventListener("click", () => { modal.style.display = "none"; });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display === "flex") modal.style.display = "none";
  });

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const name = currentState && currentState.projectName ? currentState.projectName : "Untitled Project";
      saveBtn.disabled = true;
      try {
        const response = await fetch("/api/project/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        flashButton(saveBtn, response.ok ? "已保存 ✓" : "保存失败 ✕");
        if (response.ok) renderProjectList();
      } catch (err) {
        console.error("Save failed:", err);
        flashButton(saveBtn, "保存失败 ✕");
      } finally {
        saveBtn.disabled = false;
      }
    });
  }
}

function setupWriteback() {
  const btn = $("writeback-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (!window.confirm(t("writebackConfirm"))) return;
    btn.disabled = true;
    try {
      const response = await fetch("/api/writeback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });
      if (response.ok) {
        const data = await response.json();
        alert(
          t("writebackDone", {
            count: Object.keys(data.token_map || {}).length,
            files: (data.files || []).join(", "),
            backup: data.backup || "—",
          })
        );
      } else {
        const data = await response.json().catch(() => ({}));
        alert(`${t("writebackError")}: ${data.error || response.status}`);
      }
    } catch (err) {
      console.error("Write-back failed:", err);
      alert(t("writebackError"));
    } finally {
      btn.disabled = false;
    }
  });
}

async function renderProjectList() {
  const list = $("project-list");
  if (!list) return;
  try {
    const res = await fetch("/api/projects");
    const data = await res.json();
    const projects = data.projects || [];
    list.innerHTML = "";
    if (projects.length === 0) {
      list.innerHTML = `<div class="tool-empty">${t("projectEmpty")}</div>`;
      return;
    }
    projects.forEach((p) => {
      const item = el("div", "project-item");
      const meta = el("div", "project-item-meta");
      meta.appendChild(el("div", "project-item-name", p.name));
      meta.appendChild(el("div", "project-item-desc", `${p.component_count} 组件 · ${p.updatedAt ? new Date(p.updatedAt).toLocaleString() : ""}`));
      item.appendChild(meta);
      const load = el("button", "project-item-load", t("load"));
      load.addEventListener("click", async () => {
        const res = await fetch("/api/project/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: p.file }),
        });
        if (res.ok) {
          modalClose("project-modal");
          await fetchInitialState();
        }
      });
      item.appendChild(load);
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<div class="tool-empty">${t("projectEmpty")}</div>`;
  }
}

function modalClose(id) {
  const modal = $(id);
  if (modal) modal.style.display = "none";
}

// ===== Tool tabs: Library / Versions / Comments =====

function setupToolTabs() {
  const tabs = document.querySelectorAll(".tool-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentToolTab = tab.dataset.tool;
      document.querySelectorAll(".tool-pane").forEach((pane) => pane.classList.remove("active"));
      const pane = $("pane-" + currentToolTab);
      if (pane) pane.classList.add("active");
      if (currentToolTab === "versions") renderVersions();
      if (currentToolTab === "comments") renderComments();
    });
  });
}

// ===== Versions panel =====

async function renderVersions() {
  const list = $("version-list");
  if (!list) return;
  try {
    const res = await fetch("/api/versions");
    const data = await res.json();
    const versions = data.versions || [];
    list.innerHTML = "";
    if (versions.length === 0) {
      list.innerHTML = `<div class="tool-empty">${t("versionEmpty")}</div>`;
      return;
    }
    const latestId = versions[0].id;
    versions.forEach((v) => {
      const item = el("div", "version-item");
      const meta = el("div", "version-item-meta");
      meta.appendChild(el("div", "version-item-name", v.name));
      meta.appendChild(el("div", "version-item-desc", `${v.component_count} 组件 · ${new Date(v.createdAt).toLocaleString()}`));
      item.appendChild(meta);
      const actions = el("div", "version-item-actions");
      const restore = el("button", "toolbar-btn", t("restoreVersion"));
      restore.addEventListener("click", async () => {
        const res = await fetch(`/api/version/${v.id}/restore`, { method: "POST" });
        if (res.ok) {
          await fetchInitialState();
          renderVersions();
        }
      });
      actions.appendChild(restore);
      if (v.id !== latestId) {
        const diff = el("button", "toolbar-btn", t("diffLatest"));
        diff.addEventListener("click", async () => {
          const res = await fetch("/api/version/diff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from_id: v.id, to_id: latestId }),
          });
          if (res.ok) {
            const d = await res.json();
            alert((d.summary || []).join("\n") || "无差异");
          }
        });
        actions.appendChild(diff);
      }
      item.appendChild(actions);
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<div class="tool-empty">${t("versionEmpty")}</div>`;
  }
}

function setupVersionsPanel() {
  const create = $("version-create-btn");
  if (!create) return;
  create.addEventListener("click", async () => {
    const name = window.prompt(t("saveTemplatePrompt")) || undefined;
    const res = await fetch("/api/version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || undefined }),
    });
    if (res.ok) renderVersions();
  });
}

// ===== Comments panel =====

async function renderComments() {
  const list = $("comment-list");
  if (!list) return;
  try {
    const res = await fetch("/api/comments");
    const data = await res.json();
    const comments = data.comments || [];
    list.innerHTML = "";
    if (comments.length === 0) {
      list.innerHTML = `<div class="tool-empty">${t("commentEmpty")}</div>`;
      return;
    }
    comments.forEach((c) => {
      const item = el("div", "comment-item");
      const head = el("div", "comment-item-head");
      head.appendChild(el("span", "comment-item-author", c.author));
      head.appendChild(el("span", "comment-item-time", new Date(c.createdAt).toLocaleTimeString()));
      item.appendChild(head);
      item.appendChild(el("div", "comment-item-text", c.text));
      const del = el("button", "comment-item-del", "✕");
      del.title = "删除";
      del.addEventListener("click", async () => {
        await fetch(`/api/comment/${c.id}`, { method: "DELETE" });
        renderComments();
      });
      item.appendChild(del);
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<div class="tool-empty">${t("commentEmpty")}</div>`;
  }
}

function setupCommentsPanel() {
  const addBtn = $("comment-add-btn");
  const input = $("comment-input");
  if (!addBtn || !input) return;
  addBtn.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;
    if (!selectedComponentId) {
      input.placeholder = t("commentPlaceholder");
      return;
    }
    const res = await fetch("/api/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: selectedComponentId, text, author: "user" }),
    });
    if (res.ok) {
      input.value = "";
      renderComments();
    }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBtn.click();
  });
}

// ===== Local search / filter (P1-5) =====

function setupLibrarySearch() {
  const input = $("library-search");
  if (!input) return;
  input.addEventListener("input", () => {
    librarySearchQuery = input.value.trim().toLowerCase();
    document.querySelectorAll("#library-list .lib-item").forEach((item) => {
      const haystack = (item.textContent || "").toLowerCase();
      item.style.display = haystack.includes(librarySearchQuery) ? "" : "none";
    });
  });
}

function setupTokenSearch() {
  const input = $("token-search");
  if (!input) return;
  input.addEventListener("input", () => {
    tokenSearchQuery = input.value.trim().toLowerCase();
    renderTokenPanel();
  });
}

function setupActivityFilter() {
  const input = $("activity-search");
  const source = $("activity-source");
  if (input) {
    input.addEventListener("input", () => {
      activitySearchQuery = input.value.trim().toLowerCase();
      renderActivityLog();
    });
  }
  if (source) {
    source.addEventListener("change", () => {
      activitySourceFilter = source.value;
      renderActivityLog();
    });
  }
}

// ===== Design Library =====

// Animation presets
const LIBRARY_ANIMATIONS = [
  { id: "fadeUp", name: "淡入上移", desc: "从下方淡入", icon: "↑", entry: "fadeUp", duration: 0.4 },
  { id: "fadeIn", name: "淡入", desc: "纯透明度淡入", icon: "◐", entry: "fadeIn", duration: 0.3 },
  { id: "scaleIn", name: "缩放进入", desc: "从小到大缩放", icon: "⊙", entry: "scaleIn", duration: 0.35 },
  { id: "slideRight", name: "右滑入场", desc: "从左侧滑入", icon: "→", entry: "slideRight", duration: 0.4 },
  { id: "slideLeft", name: "左滑入场", desc: "从右侧滑入", icon: "←", entry: "slideLeft", duration: 0.4 },
  { id: "slideUp", name: "上滑入场", desc: "从底部滑入", icon: "↑", entry: "slideUp", duration: 0.4 },
  { id: "spring", name: "弹性弹出", desc: "带回弹的缩放", icon: "◆", entry: "spring", duration: 0.6 },
  { id: "bounceIn", name: "Q 弹跳入", desc: "弹性跳跳进入", icon: "◉", entry: "bounceIn", duration: 0.6 },
  { id: "flipIn", name: "3D 翻转进入", desc: "绕 X 轴翻转进入", icon: "⇅", entry: "flipIn", duration: 0.5 },
  { id: "cinematic", name: "电影级入场", desc: "缩放上浮 + 模糊", icon: "▷", entry: "cinematic", duration: 0.7 },
  { id: "shimmer", name: "微光闪烁", desc: "骨架屏微光扫过", icon: "✦", entry: "shimmer", duration: 1.2 },
  { id: "glitch", name: "故障色差", desc: "故障抖动色差", icon: "⇡", entry: "glitch", duration: 0.5 },
  { id: "morphBlob", name: "流体变形", desc: "圆角形态变形进入", icon: "◒", entry: "morphBlob", duration: 0.8 },
  { id: "liftHover", name: "悬停浮起", desc: "鼠标悬停上浮", icon: "⇡", hover: "lift" },
  { id: "scaleHover", name: "悬停放大", desc: "鼠标悬停放大", icon: "⊕", hover: "scaleUp" },
  { id: "glowHover", name: "悬停发光", desc: "鼠标悬停发光", icon: "✧", hover: "glow" },
  { id: "rippleHover", name: "涟漪波纹", desc: "点击/悬停波纹扩散", icon: "≋", hover: "ripple" },
  { id: "spotlightHover", name: "聚光效果", desc: "径向聚光照亮", icon: "◎", hover: "spotlight" },
  { id: "magneticHover", name: "磁吸偏移", desc: "元素跟随光标偏移", icon: "◉", hover: "magnetic" },
  { id: "tiltHover", name: "3D 倾斜", desc: "跟随光标 3D 倾斜", icon: "◩", hover: "tilt" },
];

// Component presets
const LIBRARY_COMPONENTS = [
  { id: "hero", name: "Hero", desc: "英雄区域", icon: "◈", variant: "centered", defaultProps: { title: "用 AI 重新定义设计", subtitle: "从灵感到上线，只需一次对话", button_text: "立即开始" } },
  { id: "hero", name: "Hero 分屏", desc: "左右分栏英雄区", icon: "◈", variant: "split", defaultProps: { title: "产品标题", subtitle: "产品描述文字", button_text: "了解更多" } },
  { id: "navbar", name: "导航栏", desc: "顶部导航", icon: "☰", variant: "", defaultProps: { brand: "Logo", links: ["首页", "功能", "定价", "关于"] } },
  { id: "navbar", name: "导航栏 + CTA", desc: "带行动按钮", icon: "☰", variant: "with_cta", defaultProps: { brand: "Brand", links: ["首页", "功能"], cta_text: "开始使用" } },
  { id: "card_grid", name: "卡片网格 2列", desc: "两列卡片", icon: "▦", variant: "2col", defaultProps: { items: [{ title: "卡片1", description: "描述" }, { title: "卡片2", description: "描述" }] } },
  { id: "card_grid", name: "卡片网格 3列", desc: "三列卡片", icon: "▦", variant: "3col", defaultProps: { items: [{ title: "卡片1" }, { title: "卡片2" }, { title: "卡片3" }] } },
  { id: "card", name: "卡片", desc: "单个卡片", icon: "□", variant: "", defaultProps: { title: "卡片标题", description: "卡片描述内容" } },
  { id: "cta", name: "CTA 行动号召", desc: "转化引导", icon: "➤", variant: "", defaultProps: { title: "准备好开始了吗？", subtitle: "立即体验，开启全新设计旅程", button_text: "免费试用" } },
  { id: "button", name: "按钮", desc: "主按钮", icon: "▢", variant: "", defaultProps: { text: "点击按钮" } },
  { id: "button", name: "次级按钮", desc: "描边按钮", icon: "▢", variant: "secondary", defaultProps: { text: "次要操作" } },
  { id: "footer", name: "页脚", desc: "底部信息", icon: "▭", variant: "", defaultProps: { text: "© 2024 版权所有", links: ["隐私", "条款", "联系"] } },
  { id: "text_section", name: "文本段落", desc: "标题+正文", icon: "¶", variant: "", defaultProps: { title: "章节标题", text: "这里是正文内容区域。" } },
  { id: "feature_list", name: "功能列表", desc: "图标+文字", icon: "✦", variant: "", defaultProps: { items: [{ icon: "✦", title: "功能1", description: "描述" }, { icon: "✦", title: "功能2", description: "描述" }] } },
  { id: "stats", name: "数据统计", desc: "数字展示", icon: "#", variant: "", defaultProps: { items: [{ value: "100+", label: "用户" }, { value: "99%", label: "满意度" }] } },
  { id: "pricing", name: "定价方案", desc: "价格卡片", icon: "$", variant: "", defaultProps: { plans: [{ name: "基础版", price: "¥0", features: ["功能A", "功能B"], button_text: "免费开始" }] } },
  { id: "testimonial", name: "用户评价", desc: "客户见证", icon: '"', variant: "", defaultProps: { quote: "这个产品真的太棒了！", author: "张三", role: "产品经理" } },
  { id: "timeline", name: "时间线", desc: "时间轴", icon: "◷", variant: "", defaultProps: { items: [{ date: "2024-01", title: "里程碑1", description: "描述" }] } },
  { id: "faq", name: "FAQ", desc: "常见问题", icon: "?", variant: "", defaultProps: { items: [{ question: "问题1？", answer: "回答内容" }] } },
  { id: "form", name: "表单", desc: "输入表单", icon: "✎", variant: "", defaultProps: { fields: [{ label: "姓名", type: "text", placeholder: "请输入" }], button_text: "提交" } },
  { id: "image", name: "图片", desc: "图片组件", icon: "▣", variant: "", defaultProps: { src: "", alt: "图片" } },
  { id: "banner", name: "横幅", desc: "通知条", icon: "▬", variant: "", defaultProps: { text: "限时优惠！", button_text: "查看" } },
  { id: "tabs", name: "标签页", desc: "选项卡", icon: "⊟", variant: "", defaultProps: { items: [{ label: "标签1", content: "内容1" }, { label: "标签2", content: "内容2" }] } },
  { id: "accordion", name: "手风琴", desc: "折叠面板", icon: "≡", variant: "", defaultProps: { items: [{ title: "面板1", content: "内容1" }] } },
  { id: "carousel", name: "轮播图", desc: "图片轮播", icon: "◀", variant: "", defaultProps: { slides: [{ title: "幻灯片1", text: "内容" }] } },
  { id: "sidebar", name: "侧边栏", desc: "导航侧栏", icon: "☰", variant: "", defaultProps: { title: "菜单", links: [{ label: "首页", icon: "▣" }] } },
  { id: "breadcrumb", name: "面包屑", desc: "路径导航", icon: "›", variant: "", defaultProps: { items: ["首页", "分类", "当前"] } },
  { id: "pagination", name: "分页", desc: "页码导航", icon: "···", variant: "", defaultProps: { total: 5, current: 1 } },
  { id: "progress", name: "进度条", desc: "进度展示", icon: "━", variant: "", defaultProps: { label: "进度", value: 60 } },
  { id: "badge", name: "徽章", desc: "标签徽章", icon: "●", variant: "default", defaultProps: { text: "新功能" } },
  { id: "avatar", name: "头像组", desc: "用户头像", icon: "◐", variant: "", defaultProps: { avatars: [{ name: "AB" }, { name: "CD" }] } },
  { id: "input", name: "输入框", desc: "单行输入", icon: "⌨", variant: "", defaultProps: { label: "邮箱", placeholder: "请输入邮箱", type: "email" } },
  { id: "grid", name: "网格布局", desc: "通用网格容器", icon: "▦", variant: "3col", defaultProps: { items: [{ title: "单元格 1" }, { title: "单元格 2" }, { title: "单元格 3" }] } },
  { id: "table", name: "数据表格", desc: "表格数据展示", icon: "⊞", variant: "", defaultProps: { columns: ["名称", "状态", "更新时间"], rows: [["项目 A", "进行中", "2 小时前"], ["项目 B", "已完成", "昨天"]] } },
  { id: "alert", name: "提示框", desc: "信息/警告提示", icon: "!", variant: "info", defaultProps: { title: "提示", text: "这是一条提示信息", type: "info" } },
  { id: "tooltip", name: "工具提示", desc: "悬停气泡提示", icon: "◌", variant: "", defaultProps: { trigger: "悬停查看", text: "这里是提示内容" } },
  { id: "bento_grid", name: "便当盒网格", desc: "非对称卡片网格", icon: "▤", variant: "", defaultProps: { items: [{ title: "主卡片", size: "large" }, { title: "小卡片", size: "small" }, { title: "中卡片", size: "medium" }] } },
  { id: "skeleton", name: "骨架屏", desc: "加载占位", icon: "▭", variant: "", defaultProps: { rows: 3 } },
  { id: "command_palette", name: "命令面板", desc: "Cmd+K 搜索", icon: "⌘", variant: "", defaultProps: { placeholder: "搜索或输入命令…", items: ["新建页面", "切换主题", "导出代码"] } },
  { id: "glass_card", name: "玻璃卡片", desc: "毛玻璃质感卡片", icon: "❖", variant: "", defaultProps: { title: "Glass Card", text: "半透明毛玻璃卡片，用于分层内容展示。" } },
  { id: "fab", name: "浮动按钮", desc: "悬浮操作按钮", icon: "⊕", variant: "", defaultProps: { label: "+", hint: "新建" } },
  { id: "marquee", name: "跑马灯", desc: "滚动文字条", icon: "≫", variant: "", defaultProps: { items: ["特性一", "特性二", "特性三", "特性四"] } },
  { id: "feature_grid", name: "功能图标网格", desc: "图标 + 文字网格", icon: "✦", variant: "3col", defaultProps: { items: [{ icon: "✦", title: "功能 1", description: "描述" }, { icon: "◈", title: "功能 2", description: "描述" }, { icon: "◆", title: "功能 3", description: "描述" }] } },
  { id: "cookie_banner", name: "Cookie 横幅", desc: "隐私同意横幅", icon: "◉", variant: "", defaultProps: { text: "我们使用 Cookie 提升体验", accept_text: "接受", decline_text: "拒绝" } },
  { id: "toggle", name: "开关", desc: "切换开关", icon: "◉", variant: "", defaultProps: { label: "通知", checked: true } },
];

// ===== 模板快速变更 (v3.2 支柱⑦ P0) =====
// 组件模板 (COMPONENT_TEMPLATES, mirrors src/template-catalog.ts): ready-made
// blocks — click to add, or with 替换选中 on + a selection, replace in place.
const LIBRARY_BLOCKS = [
  { id: "hero_split_cta", name: "Hero 分屏 + CTA", desc: "左右分栏：标题 + 说明 + 行动按钮", icon: "◈", isBlock: true },
  { id: "navbar_cta", name: "导航栏 + 行动按钮", desc: "Logo + 菜单 + 右上角 CTA", icon: "☰", isBlock: true },
  { id: "pricing_3col", name: "定价三档", desc: "基础 / 专业 / 企业三列定价卡", icon: "$", isBlock: true },
  { id: "signup_form", name: "注册表单", desc: "姓名 + 邮箱 + 密码，提交弹出成功提示", icon: "✎", isBlock: true },
  { id: "testimonial_grid", name: "用户评价墙", desc: "3 条客户见证 + 头像", icon: '"', isBlock: true },
  { id: "stats_bar", name: "数据统计条", desc: "3 个核心指标数字", icon: "#", isBlock: true },
  { id: "faq_accordion", name: "FAQ 手风琴", desc: "常见问题折叠面板", icon: "≡", isBlock: true },
  { id: "cta_banner", name: "CTA 转化横幅", desc: "大标题 + 副标题 + 双按钮，点击打开链接", icon: "➤", isBlock: true },
  { id: "cookie_consent", name: "Cookie 同意横幅", desc: "隐私提示 + 接受/拒绝", icon: "◉", isBlock: true },
  { id: "bento_features", name: "便当盒功能网格", desc: "非对称大小卡片展示功能", icon: "▤", isBlock: true },
];

// 交互模板 (BEHAVIOR_TEMPLATES, mirrors src/template-catalog.ts): one-click
// interaction presets applied to the selected component.
const LIBRARY_INTERACTIONS = [
  { id: "open_link_new_tab", name: "打开链接（新标签页）", desc: "点击后在新标签页打开网址", icon: "↗" },
  { id: "toast_feedback", name: "点击提示", desc: "点击后弹出提示气泡", icon: "◌" },
  { id: "navigate_home", name: "跳转首页", desc: "点击后跳转到项目首页", icon: "⌂" },
  { id: "toggle_self", name: "显隐切换（自身）", desc: "点击显示/隐藏自身", icon: "◐" },
  { id: "submit_feedback", name: "表单提交反馈", desc: "提交表单并提示成功", icon: "✔" },
  { id: "ai_enhance", name: "AI 联动指令", desc: "点击触发一条 AI 优化指令", icon: "✦" },
];

// 替换选中 mode (components tab): when on and a component is selected,
// clicking a library item replaces it in place instead of adding.
let libraryReplaceMode = false;

// Built-in page templates (mirror server-side applyPageTemplate)
const LIBRARY_TEMPLATES = [
  { id: "saas_landing", name: "SaaS 落地页", desc: "导航 + Hero + 功能 + 定价 + CTA", icon: "◈", builtin: true },
  { id: "ecommerce_home", name: "电商首页", desc: "导航 + 促销 Hero + 商品网格", icon: "▣", builtin: true },
  { id: "blog_post", name: "博客文章", desc: "标题 + 正文 + 配图", icon: "✎", builtin: true },
  { id: "portfolio", name: "作品集", desc: "Hero + 4 列卡片 + 关于", icon: "◫", builtin: true },
  { id: "dashboard", name: "数据看板", desc: "导航 + 指标 + 卡片网格", icon: "▦", builtin: true },
];

let currentLibraryTab = "designSystems";

function setupDesignLibrary() {
  const libTabs = document.querySelectorAll(".lib-tab");
  libTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      libTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentLibraryTab = tab.dataset.lib;
      renderLibraryList();
    });
  });

  renderLibraryList();
  setupCanvasDropZone();
}

function renderLibraryList() {
  const list = $("library-list");
  if (!list) return;
  list.innerHTML = "";

  let items = [];
  if (currentLibraryTab === "animations") items = LIBRARY_ANIMATIONS;
  else if (currentLibraryTab === "components") items = LIBRARY_COMPONENTS;
  else if (currentLibraryTab === "interactions") items = LIBRARY_INTERACTIONS;
  else if (currentLibraryTab === "templates") items = LIBRARY_TEMPLATES;
  else if (currentLibraryTab === "designSystems") {
    renderDesignSystems();
    return;
  }

  if (items.length === 0) {
    list.innerHTML = `<div class="library-empty">${t("libraryLoading")}</div>`;
    return;
  }

  // 模板快速变更: components tab gets a 替换选中 toggle + curated block group.
  if (currentLibraryTab === "components") {
    const replaceRow = el("div", "lib-replace-row");
    const label = el("label", "lib-replace-toggle");
    const checkbox = el("input", "");
    checkbox.type = "checkbox";
    checkbox.id = "lib-replace-toggle";
    checkbox.checked = libraryReplaceMode;
    checkbox.addEventListener("change", () => {
      libraryReplaceMode = checkbox.checked;
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(t("replaceSelected")));
    label.title = t("replaceSelectedHint");
    replaceRow.appendChild(label);
    list.appendChild(replaceRow);

    // Curated component blocks (组件模板) — replace or add via /api/templates/component
    const blockHeader = el("div", "lib-group-header", "组件模板");
    blockHeader.title = t("replaceSelectedHint");
    list.appendChild(blockHeader);
    LIBRARY_BLOCKS.forEach((block) => {
      const elBlock = el("div", "lib-item lib-item-block");
      elBlock.draggable = true;
      elBlock.dataset.libType = "blocks";
      elBlock.dataset.itemId = block.id;
      const iconEl = el("span", "lib-item-icon", block.icon);
      iconEl.style.color = "var(--accent)";
      elBlock.appendChild(iconEl);
      const textEl = el("div", "lib-item-text");
      textEl.appendChild(el("div", "lib-item-name", block.name));
      textEl.appendChild(el("div", "lib-item-desc", block.desc));
      elBlock.appendChild(textEl);
      elBlock.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "copy";
        try { e.dataTransfer.setData("text/plain", JSON.stringify({ libType: "blocks", item: block })); } catch (err) {}
        elBlock.classList.add("dragging");
      });
      elBlock.addEventListener("dragend", () => {
        elBlock.classList.remove("dragging");
        const hint = $("canvas-drop-hint");
        if (hint) hint.style.display = "none";
      });
      elBlock.addEventListener("click", () => handleLibraryItemClick(block));
      list.appendChild(elBlock);
    });
    const paletteHeader = el("div", "lib-group-header", t("libComponents"));
    list.appendChild(paletteHeader);
  }

  // 交互模板 hint
  if (currentLibraryTab === "interactions") {
    const hintRow = el("div", "lib-group-header");
    hintRow.textContent = t("libInteractionsHint");
    list.appendChild(hintRow);
  }

  if (currentLibraryTab === "templates") {
    const saveItem = el("div", "lib-item lib-item-save");
    const saveIcon = el("span", "lib-item-icon", "▣");
    saveIcon.style.color = "var(--accent)";
    saveItem.appendChild(saveIcon);
    const saveText = el("div", "lib-item-text");
    saveText.appendChild(el("div", "lib-item-name", t("saveTemplate")));
    saveText.appendChild(el("div", "lib-item-desc", "保存当前设计为模板"));
    saveItem.appendChild(saveText);
    saveItem.addEventListener("click", saveCurrentAsTemplate);
    list.appendChild(saveItem);
  }

  items.forEach((item) => {
    const elItem = el("div", "lib-item");
    elItem.draggable = true;
    elItem.dataset.libType = currentLibraryTab;
    elItem.dataset.itemId = item.id;
    if (item.variant) elItem.dataset.variant = item.variant;
    if (item.entry) elItem.dataset.entry = item.entry;
    if (item.hover) elItem.dataset.hover = item.hover;
    if (item.duration) elItem.dataset.duration = String(item.duration);

    // Icon
    const iconEl = el("span", "lib-item-icon", item.icon || "•");
    iconEl.style.color = item.color || "var(--accent)";
    elItem.appendChild(iconEl);

    // Text
    const textEl = el("div", "lib-item-text");
    textEl.appendChild(el("div", "lib-item-name", item.name));
    if (item.desc) textEl.appendChild(el("div", "lib-item-desc", item.desc));
    elItem.appendChild(textEl);

    // Drag start
    elItem.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "copy";
      try { e.dataTransfer.setData("text/plain", JSON.stringify({ libType: currentLibraryTab, item: item })); } catch (err) {}
      elItem.classList.add("dragging");
    });

    elItem.addEventListener("dragend", () => {
      elItem.classList.remove("dragging");
      const hint = $("canvas-drop-hint");
      if (hint) hint.style.display = "none";
    });

    // Hover preview
    elItem.addEventListener("mouseenter", (e) => {
      showLibraryPreview(elItem, item);
    });
    elItem.addEventListener("mouseleave", () => {
      hideLibraryPreview();
    });

    // Click to apply (for styles) or add (for components/animations)
    elItem.addEventListener("click", () => {
      handleLibraryItemClick(item);
    });

    list.appendChild(elItem);
  });

  // Saved templates are appended asynchronously
  if (currentLibraryTab === "templates") {
    renderSavedTemplates();
  }
}

async function renderDesignSystems() {
  const list = $("library-list");
  if (!list) return;
  list.innerHTML = `<div class="library-empty">${t("libraryLoading")}</div>`;
  let systems;
  try {
    const res = await fetch("/api/design-systems");
    const data = await res.json();
    systems = data.systems || [];
  } catch (err) {
    console.error("Load design systems failed:", err);
    list.innerHTML = `<div class="library-empty">${t("dsError")}</div>`;
    return;
  }
  list.innerHTML = "";
  systems.forEach((sys) => {
    const card = el("div", "ds-card");
    const preview = el("div", "ds-preview");
    const p = sys.preview || {};
    preview.style.background = p.bg || "#0B0A0F";
    const chipRow = el("div", "ds-preview-chips");
    [
      ["--surface", p.surface || "#18181B"],
      ["--text", p.text || "#FAFAFA"],
      ["--primary", p.primary || "#8B5CF6"],
    ].forEach(([, color]) => {
      const chip = el("span", "ds-chip");
      chip.style.background = color;
      chipRow.appendChild(chip);
    });
    preview.appendChild(chipRow);
    card.appendChild(preview);

    const text = el("div", "ds-text");
    text.appendChild(el("div", "ds-name", sys.name));
    text.appendChild(el("div", "ds-desc", sys.description || ""));
    card.appendChild(text);

    const applyBtn = el("button", "ds-apply", t("dsApply"));
    applyBtn.type = "button";
    applyBtn.addEventListener("click", async () => {
      applyBtn.disabled = true;
      try {
        const res = await fetch("/api/design-system/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: sys.id }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        showToastMsg(t("dsApplied", { name: sys.name }));
        await fetchInitialState();
      } catch (err) {
        console.error("Apply design system failed:", err);
        showToastMsg(t("dsError"), true);
      } finally {
        applyBtn.disabled = false;
      }
    });
    card.appendChild(applyBtn);
    list.appendChild(card);
  });
  if (systems.length === 0) {
    list.innerHTML = `<div class="library-empty">${t("dsError")}</div>`;
  }
}

async function saveCurrentAsTemplate() {
  const name = window.prompt(t("saveTemplatePrompt"));
  if (!name) return;
  const res = await fetch("/api/template/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.ok) renderLibraryList();
}

async function renderSavedTemplates() {
  const list = $("library-list");
  if (!list) return;
  try {
    const res = await fetch("/api/templates");
    const data = await res.json();
    const templates = data.templates || [];
    if (templates.length === 0) return;
    const sep = el("div", "lib-group-label", t("savedTemplates"));
    list.appendChild(sep);
    templates.forEach((tpl) => {
      const item = el("div", "lib-item");
      const icon = el("span", "lib-item-icon", "▤");
      icon.style.color = "var(--accent)";
      item.appendChild(icon);
      const text = el("div", "lib-item-text");
      text.appendChild(el("div", "lib-item-name", tpl.name));
      text.appendChild(el("div", "lib-item-desc", `${tpl.component_count} 组件`));
      item.appendChild(text);
      item.addEventListener("click", async () => {
        const loadRes = await fetch("/api/template/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: tpl.file }),
        });
        if (loadRes.ok) await fetchInitialState();
      });
      list.appendChild(item);
    });
  } catch (err) {
    // ignore: saved templates unavailable
  }
}

function handleLibraryItemClick(item) {
  if (currentLibraryTab === "components") {
    if (item.isBlock) {
      // 组件模板 (curated block): replace selected in place, or add.
      applyComponentTemplateViaAPI(item, libraryReplaceMode && selectedComponentId ? selectedComponentId : null);
    } else if (libraryReplaceMode && selectedComponentId) {
      replaceComponentViaAPI(selectedComponentId, item);
    } else {
      // Use HTTP API for reliability (WebSocket may have timing issues)
      addComponentViaAPI(item);
    }
  } else if (currentLibraryTab === "interactions") {
    // 交互模板: bind the preset interaction to the selected component.
    if (!selectedComponentId) {
      showToastMsg(t("noSelectionForInteraction"), true);
      return;
    }
    applyBehaviorTemplateViaAPI(selectedComponentId, item.id);
  } else if (currentLibraryTab === "templates") {
    applyTemplateViaAPI(item);
  } else if (currentLibraryTab === "animations") {
    const components = getCurrentComponents();
    if (components.length === 0) {
      const hint = $("canvas-drop-hint");
      if (hint) {
        hint.textContent = "请先添加组件，再应用动效";
        hint.style.display = "block";
        setTimeout(() => { hint.style.display = "none"; hint.textContent = "释放以添加到画布"; }, 2000);
      }
      return;
    }
    const target = getAnimationTarget(components);
    if (!target) return;
    send({
      type: "set_animation",
      component_id: target.id,
      entry: item.entry,
      hover: item.hover,
      duration: item.duration,
    });
  }
}

// Apply a component template (组件模板): replace target_id in place, or add.
async function applyComponentTemplateViaAPI(item, targetId) {
  try {
    const response = await fetch("/api/templates/component", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: item.id,
        ...(targetId ? { target_id: targetId } : {}),
      }),
    });
    if (!response.ok) {
      console.error("Failed to apply component template:", response.status);
      showToastMsg("模板应用失败", true);
      return;
    }
    const data = await response.json();
    if (data.mode === "replaced") showToastMsg("已替换选中组件（位置保持不变）");
    else showToastMsg("已添加组件模板");
  } catch (err) {
    console.error("Failed to apply component template:", err);
    showToastMsg("模板应用失败", true);
  }
}

// Replace a component's definition in place (raw palette path).
async function replaceComponentViaAPI(id, item) {
  try {
    const response = await fetch(`/api/component/${encodeURIComponent(id)}/replace`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: item.id,
        variant: item.variant || undefined,
        props: item.defaultProps || {},
      }),
    });
    if (!response.ok) {
      console.error("Failed to replace component:", response.status);
      showToastMsg("替换失败", true);
    } else {
      showToastMsg("已替换选中组件");
    }
  } catch (err) {
    console.error("Failed to replace component:", err);
    showToastMsg("替换失败", true);
  }
}

// Apply a behavior template (交互模板) to a component.
async function applyBehaviorTemplateViaAPI(componentId, templateId) {
  try {
    const response = await fetch("/api/templates/behavior", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: componentId, template_id: templateId }),
    });
    if (!response.ok) {
      console.error("Failed to apply behavior template:", response.status);
      showToastMsg("交互模板应用失败", true);
      return;
    }
    showToastMsg("交互已绑定（播放模式点击触发）");
  } catch (err) {
    console.error("Failed to apply behavior template:", err);
    showToastMsg("交互模板应用失败", true);
  }
}

async function applyTemplateViaAPI(item) {
  if (item.builtin) {
    const response = await fetch("/api/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: item.id }),
    });
    if (response.ok) await fetchInitialState();
  } else if (item.file) {
    const response = await fetch("/api/template/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: item.file }),
    });
    if (response.ok) await fetchInitialState();
  }
}

// Add component via HTTP API (more reliable than WebSocket for one-shot actions)
async function addComponentViaAPI(item) {
  try {
    const response = await fetch("/api/component", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: item.id,
        variant: item.variant || undefined,
        props: item.defaultProps || {},
      }),
    });
    if (!response.ok) {
      console.error("Failed to add component:", response.status);
    }
  } catch (err) {
    console.error("Failed to add component:", err);
  }
}

function showLibraryPreview(itemEl, item) {
  const popup = $("lib-preview-popup");
  if (!popup) return;

  // Build preview content based on type
  let html = "";
  if (currentLibraryTab === "animations") {
    html = buildAnimationPreview(item);
  } else if (currentLibraryTab === "components") {
    html = buildComponentPreview(item);
  }

  popup.innerHTML = html;
  popup.style.display = "block";

  // Position next to the item
  const rect = itemEl.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  let left = rect.right + 8;
  let top = rect.top;

  // If popup would go off right edge, show on left
  if (left + popupRect.width > window.innerWidth - 16) {
    left = rect.left - popupRect.width - 8;
  }
  // If popup would go off bottom, adjust
  if (top + popupRect.height > window.innerHeight - 16) {
    top = window.innerHeight - popupRect.height - 16;
  }

  popup.style.left = left + "px";
  popup.style.top = Math.max(8, top) + "px";
}

function hideLibraryPreview() {
  const popup = $("lib-preview-popup");
  if (popup) popup.style.display = "none";
}

function buildAnimationPreview(item) {
  return `
    <div class="lib-preview-content">
      <div class="lib-preview-title">${item.name}</div>
      <div class="lib-preview-desc">${item.desc}</div>
      <div class="lib-preview-anim-demo" style="text-align:center;padding:16px;">
        <div class="anim-demo-box" style="display:inline-block;width:40px;height:40px;border-radius:8px;background:var(--accent);animation:demo-${item.id || item.entry || item.hover} 1.5s ${item.duration || 0.4}s ease-in-out infinite;">${item.icon || "◆"}</div>
      </div>
      <div class="lib-preview-hint">点击应用到最近组件</div>
    </div>
    <style>
      @keyframes demo-fadeUp { 0%,100% { opacity:0.3; transform:translateY(12px); } 50% { opacity:1; transform:translateY(0); } }
      @keyframes demo-fadeIn { 0%,100% { opacity:0.2; } 50% { opacity:1; } }
      @keyframes demo-scaleIn { 0%,100% { opacity:0.3; transform:scale(0.7); } 50% { opacity:1; transform:scale(1); } }
      @keyframes demo-slideRight { 0%,100% { opacity:0.3; transform:translateX(-16px); } 50% { opacity:1; transform:translateX(0); } }
      @keyframes demo-slideLeft { 0%,100% { opacity:0.3; transform:translateX(16px); } 50% { opacity:1; transform:translateX(0); } }
      @keyframes demo-slideUp { 0%,100% { opacity:0.3; transform:translateY(16px); } 50% { opacity:1; transform:translateY(0); } }
      @keyframes demo-spring { 0%,100% { opacity:0.3; transform:scale(0.6); } 40% { opacity:1; transform:scale(1.1); } 60% { transform:scale(0.95); } 80% { transform:scale(1); } }
      @keyframes demo-liftHover { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); box-shadow:0 8px 16px rgba(139,92,246,0.3); } }
      @keyframes demo-scaleHover { 0%,100% { transform:scale(1); } 50% { transform:scale(1.15); } }
      @keyframes demo-glowHover { 0%,100% { filter:drop-shadow(0 0 0 var(--accent)); } 50% { filter:drop-shadow(0 0 12px var(--accent)); } }
      @keyframes demo-bounceIn { 0% { opacity:0; transform:scale(0.3); } 50% { opacity:1; transform:scale(1.08); } 70% { transform:scale(0.96); } 100% { transform:scale(1); } }
      @keyframes demo-flipIn { 0% { opacity:0; transform:perspective(500px) rotateX(80deg); } 100% { opacity:1; transform:perspective(500px) rotateX(0); } }
      @keyframes demo-cinematic { 0% { opacity:0; transform:scale(1.25); filter:blur(6px); } 100% { opacity:1; transform:scale(1); filter:blur(0); } }
      @keyframes demo-shimmer { 0% { opacity:0.5; background-position:-200% 0; } 100% { opacity:1; background-position:200% 0; } }
      @keyframes demo-glitch { 0%,100% { transform:translate(0); text-shadow:none; } 20% { transform:translate(-2px,1px); text-shadow:2px 0 #ff00c8,-2px 0 #00f0ff; } 40% { transform:translate(2px,-1px); } 60% { transform:translate(-1px,2px); text-shadow:-2px 0 #ff00c8,2px 0 #00f0ff; } 80% { transform:translate(1px,-2px); } }
      @keyframes demo-morphBlob { 0% { opacity:0; border-radius:60% 40% 55% 45% / 50% 60% 40% 50%; transform:scale(0.7) rotate(8deg); } 100% { opacity:1; border-radius:8px; transform:scale(1) rotate(0); } }
      @keyframes demo-rippleHover { 0% { box-shadow:0 0 0 0 rgba(139,92,246,0.35); } 100% { box-shadow:0 0 0 14px rgba(139,92,246,0); } }
      @keyframes demo-spotlightHover { 0% { background:radial-gradient(circle at 30% 30%, rgba(139,92,246,0.25), transparent 60%); } 50% { background:radial-gradient(circle at 70% 70%, rgba(139,92,246,0.35), transparent 60%); } 100% { background:radial-gradient(circle at 30% 30%, rgba(139,92,246,0.25), transparent 60%); } }
      @keyframes demo-magneticHover { 0%,100% { transform:translate(0,0); } 50% { transform:translate(6px,-4px); } }
      @keyframes demo-tiltHover { 0%,100% { transform:perspective(500px) rotateX(0) rotateY(0); } 50% { transform:perspective(500px) rotateX(6deg) rotateY(-8deg); } }
    </style>
  `;
}

function buildComponentPreview(item) {
  return `
    <div class="lib-preview-content">
      <div class="lib-preview-title">${item.name}</div>
      <div class="lib-preview-desc">${item.desc}</div>
      <div class="lib-preview-comp-demo">
        <span style="font-size:28px;color:var(--accent);">${item.icon || "□"}</span>
        <span style="font-family:var(--mono);font-size:11px;color:var(--text-muted);margin-left:8px;">${item.id}${item.variant ? "/" + item.variant : ""}</span>
      </div>
      <div class="lib-preview-hint">点击添加 · 拖到画布</div>
    </div>
  `;
}

function setupCanvasDropZone() {
  const canvas = $("canvas");
  const hint = $("canvas-drop-hint");
  if (!canvas || !hint) return;

  canvas.addEventListener("dragover", (e) => {
    // Only handle library drags, not component reorders
    if (e.dataTransfer.types.includes("text/plain")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      hint.style.display = "block";
      hint.style.left = (e.clientX - 50) + "px";
      hint.style.top = (e.clientY - 20) + "px";
    }
  });

  canvas.addEventListener("dragleave", (e) => {
    // Only hide if leaving the canvas entirely
    if (!canvas.contains(e.relatedTarget)) {
      hint.style.display = "none";
    }
  });

  canvas.addEventListener("drop", (e) => {
    e.preventDefault();
    hint.style.display = "none";

    try {
      const raw = e.dataTransfer.getData("text/plain");
      // If it's a JSON object from the library, handle it
      if (raw.startsWith("{")) {
        const data = JSON.parse(raw);
        if (data.libType && data.item) {
          handleLibraryDrop(data.item, data.libType);
        }
      }
      // If it's a plain component ID (from reorder), ignore — handled by attachDragHandlers
    } catch (err) {
      // Ignore parse errors
    }
  });
}

function handleLibraryDrop(item, libType) {
  if (libType === "blocks") {
    // 组件模板 dropped on the canvas: add the block (drop never replaces)
    applyComponentTemplateViaAPI(item, null);
  } else if (libType === "components") {
    addComponentViaAPI(item);
  } else if (libType === "animations") {
    const components = getCurrentComponents();
    if (components.length === 0) return;
    const target = getAnimationTarget(components);
    if (!target) return;
    send({
      type: "set_animation",
      component_id: target.id,
      entry: item.entry,
      hover: item.hover,
      duration: item.duration,
    });
  }
}

// Prefer the user-selected component; fall back to the most recent one.
function getAnimationTarget(components) {
  if (selectedComponentId) {
    const selected = components.find((c) => c.id === selectedComponentId);
    if (selected) return selected;
  }
  return components[components.length - 1] || null;
}

// ===== Canvas Editor (方案A: tldraw drawing canvas) =====

let canvasEditorMode = false;
let canvasEditorMounted = false;
let canvasReady = false;
let canvasLoading = false;
let canvasOwnSaveAt = 0;
let canvasSaveTimer = null;
let canvasDirty = false;
let canvasTemplateShownForPage = null;
let toastTimer = null;
let canvasBundlePromise = null;
const appliedDrawIds = new Set();

const BUILTIN_TEMPLATES = [
  { id: "saas_landing", icon: "▲", nameKey: "tplSaaS", descKey: "tplDescSaaS" },
  { id: "ecommerce_home", icon: "▣", nameKey: "tplEcommerce", descKey: "tplDescEcommerce" },
  { id: "blog_post", icon: "▤", nameKey: "tplBlog", descKey: "tplDescBlog" },
  { id: "portfolio", icon: "✦", nameKey: "tplPortfolio", descKey: "tplDescPortfolio" },
  { id: "dashboard", icon: "▣", nameKey: "tplDashboard", descKey: "tplDescDashboard" },
];

function showToastMsg(text, isError) {
  const toast = $("prism-toast");
  if (!toast) return;
  toast.textContent = text;
  toast.className = "prism-toast" + (isError ? " toast-error" : "");
  toast.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 3600);
}

function renderCanvasTemplateCards() {
  const container = $("canvas-template-cards");
  if (!container) return;
  container.innerHTML = "";
  const cards = [
    ...BUILTIN_TEMPLATES,
    { id: "blank", icon: "▢", nameKey: "tplBlank", descKey: null },
  ];
  cards.forEach((card) => {
    const node = el("button", "template-card");
    node.type = "button";
    node.appendChild(renderTplThumb(card.id));
    node.appendChild(el("span", "tc-name", t(card.nameKey)));
    if (card.descKey) {
      node.appendChild(el("span", "tc-desc", t(card.descKey)));
    }
    node.addEventListener("click", () => applyTemplateForCanvas(card.id));
    container.appendChild(node);
  });
}

function renderTplThumb(id) {
  const thumb = el("span", "tpl-thumb");
  thumb.dataset.tpl = id;
  tplThumbBlocks(id).forEach((b) => {
    const block = el("i", "th");
    block.style.top = b.top;
    block.style.left = b.left;
    block.style.width = b.width;
    block.style.height = b.height;
    block.style.background = b.bg;
    block.style.borderRadius = (b.radius || 3) + "px";
    thumb.appendChild(block);
  });
  return thumb;
}

function tplThumbBlocks(id) {
  const B = (top, left, width, height, bg, radius) => ({ top, left, width, height, bg, radius });
  const soft = "var(--surface-hover)";
  const softBorder = "var(--border-strong)";
  const brand = "linear-gradient(135deg, var(--spectrum-1), var(--spectrum-3))";
  const nav = "linear-gradient(90deg, var(--accent) 0 26%, " + soft + " 26% 52%, " + softBorder + " 56% 100%)";
  const map = {
    saas_landing: [
      B("6px", "7%", "86%", "7px", nav),
      B("21px", "7%", "46%", "25px", brand, 5),
      B("30px", "7%", "17%", "5px", "rgba(255,255,255,.6)"),
      B("56px", "7%", "25%", "21px", soft, 4),
      B("56px", "37%", "25%", "21px", soft, 4),
      B("56px", "67%", "25%", "21px", soft, 4),
    ],
    ecommerce_home: [
      B("6px", "7%", "86%", "7px", nav),
      B("21px", "7%", "86%", "18px", "linear-gradient(135deg, var(--spectrum-2), var(--spectrum-4))", 5),
      B("48px", "7%", "25%", "30px", soft, 4),
      B("48px", "37%", "25%", "30px", soft, 4),
      B("48px", "67%", "25%", "30px", soft, 4),
    ],
    blog_post: [
      B("6px", "7%", "86%", "7px", nav),
      B("22px", "7%", "62%", "7px", "var(--accent-bright)", 3),
      B("34px", "7%", "34%", "5px", softBorder, 3),
      B("47px", "7%", "86%", "24px", "linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.05))", 5),
      B("79px", "7%", "86%", "4px", soft, 3),
    ],
    portfolio: [
      B("6px", "7%", "86%", "7px", nav),
      B("22px", "7%", "22%", "22px", brand, "50%"),
      B("34px", "34%", "30%", "6px", "var(--accent-bright)", 3),
      B("45px", "34%", "22%", "5px", softBorder, 3),
      B("60px", "7%", "25%", "18px", soft, 4),
      B("60px", "37%", "25%", "18px", soft, 4),
      B("60px", "67%", "25%", "18px", soft, 4),
    ],
    dashboard: [
      B("6px", "7%", "86%", "7px", nav),
      B("21px", "7%", "25%", "17px", soft, 4),
      B("21px", "37%", "25%", "17px", soft, 4),
      B("21px", "67%", "25%", "17px", soft, 4),
      B("47px", "7%", "86%", "30px", "linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.04))", 5),
      B("52px", "12%", "9%", "19px", "var(--accent-bright)", 2),
      B("64px", "25%", "9%", "8px", "var(--spectrum-2)", 2),
      B("58px", "38%", "9%", "13px", "var(--spectrum-3)", 2),
      B("70px", "51%", "9%", "5px", "var(--spectrum-4)", 2),
      B("62px", "64%", "9%", "10px", "var(--spectrum-2)", 2),
    ],
    blank: [],
  };
  return map[id] || [];
}

function setupCanvasEditor() {
  const previewBtn = $("canvas-mode-preview");
  const designBtn = $("canvas-mode-design");
  if (previewBtn) previewBtn.addEventListener("click", () => setCanvasEditorMode(false));
  if (designBtn) designBtn.addEventListener("click", () => setCanvasEditorMode(true));

  const saveBtn = $("canvas-save-btn");
  if (saveBtn) saveBtn.addEventListener("click", () => saveCurrentCanvas(true));
  const applyBtn = $("canvas-apply-btn");
  if (applyBtn) applyBtn.addEventListener("click", applyCanvasToPreview);
  const exportBtn = $("canvas-export-btn");
  if (exportBtn) exportBtn.addEventListener("click", exportCanvasToFile);
  const autoLayoutBtn = $("canvas-autolayout-btn");
  if (autoLayoutBtn) {
    autoLayoutBtn.addEventListener("click", () => {
      if (!window.PrismCanvas || !window.PrismCanvas.isReady()) return;
      const count = window.PrismCanvas.autoLayout();
      showToastMsg(t("canvasAutoLayoutDone", { n: count }));
    });
  }
  const clearBtn = $("canvas-clear-btn");
  if (clearBtn) clearBtn.addEventListener("click", clearCanvasEditor);

  const tplModal = $("canvas-template-modal");
  const tplClose = $("canvas-template-close");
  if (tplClose) {
    tplClose.addEventListener("click", () => {
      if (tplModal) tplModal.style.display = "none";
    });
  }
  if (tplModal) {
    tplModal.addEventListener("click", (e) => {
      if (e.target === tplModal) tplModal.style.display = "none";
    });
  }

  renderCanvasTemplateCards();
  setupCanvasEditorDropZone();
}

/**
 * Let the design library drop straight onto the drawing canvas: a component
 * becomes a token-colored prism-block shape at the drop point (canvas page
 * coordinates), then the drawing is autosaved.
 */
function setupCanvasEditorDropZone() {
  const editorEl = $("canvas-editor");
  const hint = $("canvas-drop-hint");
  if (!editorEl) return;

  const isLibraryDrag = (e) =>
    e.dataTransfer &&
    e.dataTransfer.types &&
    Array.from(e.dataTransfer.types).includes("text/plain") &&
    canvasEditorMode;

  editorEl.addEventListener("dragover", (e) => {
    if (!isLibraryDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (hint) {
      hint.textContent = t("startWithLibraryDesc");
      hint.style.display = "block";
      hint.style.left = e.clientX - 60 + "px";
      hint.style.top = e.clientY - 24 + "px";
    }
  });

  editorEl.addEventListener("dragleave", (e) => {
    if (!canvasEditorMode) return;
    if (!editorEl.contains(e.relatedTarget) && hint) {
      hint.style.display = "none";
    }
  });

  editorEl.addEventListener("drop", (e) => {
    if (!canvasEditorMode || !e.dataTransfer) return;
    const raw = e.dataTransfer.getData("text/plain");
    if (!raw || !raw.startsWith("{")) return;
    e.preventDefault();
    e.stopPropagation();
    if (hint) hint.style.display = "none";

    try {
      const data = JSON.parse(raw);
      if (!data.item || data.libType !== "components") return;
      if (!window.PrismCanvas || !window.PrismCanvas.isReady()) {
        showToastMsg(t("canvasLoading"));
        return;
      }
      const pt = window.PrismCanvas.screenToPage(e.clientX, e.clientY);
      const created = window.PrismCanvas.addComponentShape(
        {
          type: data.item.id,
          variant: data.item.variant,
          props: data.item.defaultProps || {},
        },
        pt.x,
        pt.y
      );
      if (created) {
        saveCurrentCanvas(false);
        showToastMsg(t("canvasComponentDropped", { name: data.item.name || data.item.id }));
      }
    } catch (err) {
      console.error("Canvas library drop failed:", err);
    }
  });
}

/** Lazily load the tldraw bundle (client/vendor/prism-canvas.js). */
function ensureCanvasBundle() {
  if (window.PrismCanvas) return Promise.resolve();
  if (!canvasBundlePromise) {
    canvasBundlePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "vendor/prism-canvas.js";
      script.onload = () => resolve();
      script.onerror = () => {
        canvasBundlePromise = null;
        reject(new Error("canvas bundle failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return canvasBundlePromise;
}

function setCanvasEditorMode(design) {
  if (design === canvasEditorMode) {
    if (design) loadCanvasIntoEditor();
    return;
  }

  const previewBtn = $("canvas-mode-preview");
  const designBtn = $("canvas-mode-design");
  const scrollWrap = $("canvas-scroll-wrap");
  const editorWrap = $("canvas-editor-wrap");
  const actions = $("canvas-editor-actions");
  const label = $("canvas-label");

  if (!design) {
    if (canvasReady) saveCurrentCanvas(false);
    canvasEditorMode = false;
    if (scrollWrap) scrollWrap.style.display = "block";
    if (editorWrap) editorWrap.style.display = "none";
    if (actions) actions.style.display = "none";
    if (label) label.textContent = t("canvasLabel");
  } else {
    canvasEditorMode = true;
    if (scrollWrap) scrollWrap.style.display = "none";
    if (editorWrap) editorWrap.style.display = "flex";
    if (actions) actions.style.display = "inline-flex";
    if (label) label.textContent = t("designMode");
    const hint = $("canvas-editor-hint");
    if (hint) hint.textContent = t("canvasEditorHint");

    showToastMsg(t("canvasLoading"));
    ensureCanvasBundle()
      .then(() => {
        if (!canvasEditorMounted) {
          canvasEditorMounted = true;
          window.PrismCanvas.mount($("canvas-editor"), {
            locale: "en",
            onMount: () => {
              canvasReady = true;
              loadCanvasIntoEditor();
              if (pendingDrawTool) {
                window.PrismCanvas.setTool(pendingDrawTool);
                pendingDrawTool = null;
              }
            },
            onRecover: () => {
              canvasReady = true;
              loadCanvasIntoEditor(true);
            },
            onChange: (snapshot) => {
              canvasDirty = true;
              clearTimeout(canvasSaveTimer);
              canvasSaveTimer = setTimeout(() => saveCurrentCanvas(false, snapshot), 900);
            },
          });
        } else {
          loadCanvasIntoEditor();
        }
      })
      .catch((err) => {
        console.error("Canvas bundle failed:", err);
        showToastMsg(t("canvasSaveError"), true);
        setCanvasEditorMode(false);
      });
  }

  if (previewBtn) previewBtn.classList.toggle("active", !design);
  if (designBtn) designBtn.classList.toggle("active", design);
  applyDrawToolsState();
}

/**
 * Load the current page's drawing into the editor. If no drawing has been
 * saved yet, materialize the current components as editable shapes; if the
 * page is completely empty, offer a template-first start.
 */
async function loadCanvasIntoEditor(forceFromComponents) {
  if (!window.PrismCanvas || !window.PrismCanvas.isReady() || !currentState) return;
  const pageId = currentState.currentPageId;
  if (!pageId) return;

  canvasLoading = true;
  window.PrismCanvas.suppressAutoSave(1800);
  try {
    const res = await fetch(`/api/canvas?pageId=${encodeURIComponent(pageId)}`);
    const data = await res.json().catch(() => ({}));
    const components = getCurrentComponents();

    if (data.doc) {
      const loaded = window.PrismCanvas.loadSnapshot(data.doc);
      // A stale/corrupt drawing can fail to load (unknown shape types, schema
      // drift). Fall back to re-materializing from the component tree and
      // overwrite the bad doc so the canvas never gets stuck broken.
      if (!loaded) {
        window.PrismCanvas.loadComponents(components || [], {
          tokens: currentState.tokens,
          themeMode: currentState.themeMode,
        });
        if (components && components.length > 0) saveCurrentCanvas(false);
      }
    } else if (forceFromComponents || (components && components.length > 0)) {
      window.PrismCanvas.loadComponents(components || [], {
        tokens: currentState.tokens,
        themeMode: currentState.themeMode,
      });
      if (components && components.length > 0) saveCurrentCanvas(false);
    } else {
      window.PrismCanvas.clear();
      if (canvasTemplateShownForPage !== pageId) {
        canvasTemplateShownForPage = pageId;
        const modal = $("canvas-template-modal");
        if (modal) modal.style.display = "flex";
      }
    }
    // Apply any AI draw commands that were queued while the canvas was closed.
    applyPendingCanvasDraws();
  } catch (err) {
    console.error("Load canvas failed:", err);
  } finally {
    setTimeout(() => {
      canvasLoading = false;
    }, 180);
  }
}

/**
 * Apply queued AI drawing commands (`design_draw_canvas`) to the live
 * editor, then clear the server queue and persist the merged drawing.
 */
async function applyPendingCanvasDraws() {
  if (!window.PrismCanvas || !window.PrismCanvas.isReady() || !currentState) return;
  const pageId = currentState.currentPageId;
  const draws = (currentState.canvasDraws && currentState.canvasDraws[pageId]) || [];
  const pending = draws.filter((d) => d && !appliedDrawIds.has(d.id));
  if (pending.length === 0) return;

  const created = window.PrismCanvas.applyDraws(pending);
  pending.forEach((d) => appliedDrawIds.add(d.id));
  try {
    await fetch("/api/canvas/draws/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId }),
    });
  } catch (err) {
    console.error("Clear draw queue failed:", err);
  }
  saveCurrentCanvas(false);
  if (created > 0) showToastMsg(t("canvasDrawsApplied", { n: created }));
}

async function saveCurrentCanvas(showToast, snapshot) {
  if (!window.PrismCanvas || !window.PrismCanvas.isReady() || !currentState) return false;
  const snap = snapshot || window.PrismCanvas.getSnapshot();
  if (!snap) return false;
  canvasOwnSaveAt = Date.now();
  canvasDirty = false;
  try {
    const res = await fetch("/api/canvas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageId: currentState.currentPageId,
        doc: snap,
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    if (showToast) showToastMsg(t("canvasSaved"));
    return true;
  } catch (err) {
    console.error("Save canvas failed:", err);
    if (showToast) showToastMsg(t("canvasSaveError"), true);
    return false;
  }
}

async function applyCanvasToPreview() {
  if (!window.PrismCanvas || !window.PrismCanvas.isReady()) return;
  await saveCurrentCanvas(false);
  try {
    const res = await fetch("/api/canvas/apply", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showToastMsg(data.error || t("canvasSaveError"), true);
      return;
    }
    await fetchInitialState();
    setCanvasEditorMode(false);
    showToastMsg(t("canvasApplied", { n: data.component_count }));
  } catch (err) {
    console.error("Apply canvas failed:", err);
    showToastMsg(t("canvasSaveError"), true);
  }
}

async function exportCanvasToFile() {
  if (!window.PrismCanvas || !window.PrismCanvas.isReady()) return;
  await saveCurrentCanvas(false);
  try {
    const res = await fetch("/api/canvas/export", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showToastMsg(data.error || t("canvasSaveError"), true);
      return;
    }
    showToastMsg(t("canvasExported", { file: data.file }));
  } catch (err) {
    console.error("Export canvas failed:", err);
    showToastMsg(t("canvasSaveError"), true);
  }
}

function clearCanvasEditor() {
  if (!window.PrismCanvas || !window.PrismCanvas.isReady()) return;
  if (!window.confirm(t("clearCanvasConfirm"))) return;
  window.PrismCanvas.clear();
  saveCurrentCanvas(true);
  showToastMsg(t("canvasCleared"));
}

async function applyTemplateForCanvas(templateId) {
  const modal = $("canvas-template-modal");
  if (modal) modal.style.display = "none";

  if (templateId === "blank") {
    if (window.PrismCanvas && window.PrismCanvas.isReady()) {
      window.PrismCanvas.clear();
      saveCurrentCanvas(false);
    } else {
      setCanvasEditorMode(true);
    }
    return;
  }

  try {
    const res = await fetch("/api/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: templateId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToastMsg(data.error || t("canvasSaveError"), true);
      return;
    }
    await fetchInitialState();
    if (currentState) canvasTemplateShownForPage = currentState.currentPageId;
    if (canvasEditorMode && window.PrismCanvas && window.PrismCanvas.isReady()) {
      loadCanvasIntoEditor(true);
    } else {
      setCanvasEditorMode(true);
    }
  } catch (err) {
    console.error("Apply template failed:", err);
    showToastMsg(t("canvasSaveError"), true);
  }
}

// ===== 自由编辑补缺 (P1): 画布形状/图片挂行为 + 画布播放触发 =====

/** Build a concrete behavior from a client-side template id (mirrors server). */
function buildCanvasBehavior(templateId, shapeId) {
  const pages = currentState && currentState.pages ? currentState.pages : [];
  const pageIds = pages.map((p) => p.id);
  switch (templateId) {
    case "open_link_new_tab":
      return { type: "link", url: "https://example.com", new_tab: true };
    case "toast_feedback":
      return { type: "toast", message: "操作成功！" };
    case "navigate_home":
      return { type: "navigate", page_id: pageIds[0] || "" };
    case "toggle_self":
      return { type: "toggle", target_component_id: shapeId || "" };
    case "submit_feedback":
      return { type: "submit", form_id: "" };
    case "ai_enhance":
      return { type: "prompt", prompt: "优化这个组件的视觉效果" };
    default:
      return null;
  }
}

function setupCanvasBehavior() {
  const btn = $("canvas-behavior-btn");
  const menu = $("canvas-behavior-menu");
  const list = $("canvas-behavior-list");
  const clearBtn = $("canvas-behavior-clear");
  if (!btn || !menu || !list) return;

  const hide = () => { menu.style.display = "none"; };

  const applyToSelection = async (behavior) => {
    const ids = window.PrismCanvas ? window.PrismCanvas.getSelectedShapeIds() : [];
    if (ids.length === 0) {
      showToastMsg(t("canvasBehaviorNone"), true);
      return;
    }
    let applied = 0;
    ids.forEach((id) => {
      if (window.PrismCanvas.setShapeBehavior(id, behavior)) applied += 1;
    });
    hide();
    if (applied > 0) {
      showToastMsg(applied === 1 ? "已绑定交互（播放模式点击触发）" : `已为 ${applied} 个形状绑定交互`);
      saveCurrentCanvas(false);
    }
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.style.display === "block") { hide(); return; }
    // Render template list
    list.innerHTML = "";
    LIBRARY_INTERACTIONS.forEach((tpl) => {
      const item = el("div", "cb-menu-item");
      const iconEl = el("span", "cb-menu-icon", tpl.icon);
      item.appendChild(iconEl);
      const textEl = el("div", "cb-menu-text");
      textEl.appendChild(el("div", "cb-menu-name", tpl.name));
      textEl.appendChild(el("div", "cb-menu-desc", tpl.desc));
      item.appendChild(textEl);
      item.addEventListener("click", () => {
        const ids = window.PrismCanvas ? window.PrismCanvas.getSelectedShapeIds() : [];
        const shapeId = ids[0] || null;
        const behavior = buildCanvasBehavior(tpl.id, shapeId);
        if (behavior) applyToSelection(behavior);
      });
      list.appendChild(item);
    });
    const rect = btn.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 240)) + "px";
    menu.style.top = (rect.bottom + 6) + "px";
    menu.style.display = "block";
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => applyToSelection(null));
  }

  // Click elsewhere closes the menu; Escape closes it too.
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#canvas-behavior-menu") && !e.target.closest("#canvas-behavior-btn")) hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
}

/**
 * 画布播放模式：点击带行为的形状/图片时触发（与主画布播放模式同一心智）。
 * Uses capture-phase pointerup on the document because tldraw registers its
 * own window/document capture listeners that swallow events targeting the
 * editor subtree.
 */
function setupCanvasPlayClick() {
  document.addEventListener(
    "pointerup",
    (e) => {
      if (!playMode || !canvasEditorMode) return;
      if (!window.PrismCanvas || !window.PrismCanvas.isReady()) return;
      const shape = window.PrismCanvas.getShapeAtPoint(e.clientX, e.clientY);
      if (!shape || !shape.behavior) return;
      e.stopPropagation();
      dispatchCanvasShapeBehavior(shape.id, shape.behavior);
    },
    true
  );
}

function dispatchCanvasShapeBehavior(shapeId, behavior) {
  if (!behavior || !behavior.type) return;
  switch (behavior.type) {
    case "navigate":
      if (behavior.page_id && behavior.page_id !== (currentState && currentState.currentPageId)) {
        send({ type: "switch_page", pageId: behavior.page_id });
      }
      break;
    case "link":
      if (behavior.url) window.open(behavior.url, behavior.new_tab === false ? "_self" : "_blank", "noopener");
      break;
    case "toggle": {
      if (!behavior.target_component_id) break;
      const target = findCompDeep(getCurrentComponents(), behavior.target_component_id);
      if (target) {
        send({
          type: "update_component",
          id: target.id,
          props: {},
          visible: target.visible === false,
        });
      } else {
        showToastMsg("toggle 目标未找到（画布形状可用「显隐切换」绑定自身）", true);
      }
      break;
    }
    case "toast":
      showToastMsg(behavior.message || t("behaviorToastDefault"));
      break;
    case "submit":
      showToastMsg(t("behaviorSubmitted"));
      break;
    case "prompt":
      if (behavior.prompt) sendPrompt(behavior.prompt);
      break;
    default:
      break;
  }
}

// ===== Initialize =====

// ===== Play Mode (click-through navigation between linked pages) =====

function setupPlayMode() {
  const btn = $("play-btn");
  if (!btn) return;

  const setPlayMode = (on) => {
    playMode = on;
    const canvas = $("canvas");
    if (canvas) canvas.classList.toggle("play-mode", on);
    btn.textContent = on ? t("playExit") : t("playMode");
    btn.classList.toggle("active", on);
    if (on) deselectAll();
    renderCanvas();
  };

  btn.addEventListener("click", () => setPlayMode(!playMode));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && playMode) {
      setPlayMode(false);
    }
  });
}

// ===== "More" menu (topbar) =====

function setupMoreMenu() {
  const btn = $("more-btn");
  const menu = $("more-dropdown");
  if (!btn || !menu) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".more-menu")) menu.style.display = "none";
  });
  menu.addEventListener("click", () => {
    menu.style.display = "none";
  });
}

// ===== Built-in LLM channel (AI settings modal) =====

function updateLlmBadge() {
  const badge = $("llm-badge");
  if (!badge) return;
  fetch("/api/llm/config")
    .then((r) => r.json())
    .then((data) => {
      badge.style.display = data.configured ? "inline-flex" : "none";
      if (data.configured) badge.title = `${t("llmProvider")}: ${data.provider} · ${data.model}`;
    })
    .catch(() => {});
}

function setupLlmSettings() {
  const openBtn = $("llm-settings-btn");
  const modal = $("llm-modal");
  const closeBtn = $("llm-close");
  const provider = $("llm-provider");
  const baseUrl = $("llm-base-url");
  const keyInput = $("llm-key");
  const model = $("llm-model");
  const status = $("llm-status");
  const saveBtn = $("llm-save-btn");
  const testBtn = $("llm-test-btn");
  if (!modal || !openBtn) return;

  const setStatus = (text, cls) => {
    if (!status) return;
    status.textContent = text;
    status.className = "llm-status" + (cls ? " " + cls : "");
  };

  openBtn.addEventListener("click", () => {
    modal.style.display = "flex";
    setStatus("", "");
    fetch("/api/llm/config")
      .then((r) => r.json())
      .then((data) => {
        if (provider) provider.value = data.provider || "openai";
        if (baseUrl) baseUrl.value = data.base_url || "";
        if (model) model.value = data.model || "";
        if (keyInput) keyInput.placeholder = data.masked_key ? data.masked_key + "（已保存，留空保持不变）" : "sk-…";
        toggleBaseField();
      })
      .catch(() => {});
  });
  if (closeBtn) closeBtn.addEventListener("click", () => { modal.style.display = "none"; });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  const toggleBaseField = () => {
    const field = document.querySelector(".llm-base-field");
    if (field) field.style.display = provider && provider.value === "openai" ? "" : "none";
  };
  if (provider) provider.addEventListener("change", toggleBaseField);

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      setStatus(t("llmTesting"), "");
      try {
        const res = await fetch("/api/llm/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: provider ? provider.value : "openai",
            apiKey: keyInput ? keyInput.value : "",
            model: model ? model.value : "",
            baseUrl: baseUrl ? baseUrl.value : "",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || String(res.status));
        setStatus(t("llmSaved"), "ok");
        if (keyInput) keyInput.value = "";
        updateLlmBadge();
      } catch (err) {
        setStatus(t("llmTestFail", { error: err.message }), "err");
      }
    });
  }

  if (testBtn) {
    testBtn.addEventListener("click", async () => {
      setStatus(t("llmTesting"), "");
      try {
        const res = await fetch("/api/llm/test", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || String(res.status));
        setStatus(t("llmTestOk", { reply: data.reply || "" }), "ok");
      } catch (err) {
        setStatus(t("llmTestFail", { error: err.message }), "err");
      }
    });
  }
}

// ===== Drawing tool rail (canvas left edge) =====

let activeDrawTool = "select";

function applyDrawToolsState() {
  const rail = $("canvas-tool-rail");
  if (rail) rail.classList.toggle("active", canvasEditorMode);
  document.querySelectorAll(".draw-tool").forEach((b) => {
    b.classList.toggle("active", canvasEditorMode && b.dataset.tool === activeDrawTool);
  });
}

function selectDrawTool(toolId) {
  activeDrawTool = toolId;
  pendingDrawTool = toolId;
  if (!canvasEditorMode) {
    setCanvasEditorMode(true);
  } else if (window.PrismCanvas && window.PrismCanvas.isReady()) {
    window.PrismCanvas.setTool(toolId);
    pendingDrawTool = null;
  }
  applyDrawToolsState();
}

function setupDrawTools() {
  document.querySelectorAll(".draw-tool").forEach((btn) => {
    btn.addEventListener("click", () => selectDrawTool(btn.dataset.tool));
  });
  applyDrawToolsState();
}

function init() {
  setupI18n();
  setupTabs();
  setupPlatformSwitcher();
  setupUndoRedo();
  setupZoom();
  setupCanvasShortcuts();
  setupCanvasMode();
  setupRulersAndGuides();
  setupLiveCursors();
  setupThemeToggle();
  setupPageSwitcher();
  setupExportModal();
  setupImportModal();
  setupProjectPersistence();
  setupWriteback();
  setupToolTabs();
  setupVersionsPanel();
  setupCommentsPanel();
  setupLibrarySearch();
  setupTokenSearch();
  setupActivityFilter();
  setupScreenshot();
  setupPromptBar();
  setupExplain();
  setupPlayMode();
  setupMoreMenu();
  setupLlmSettings();
  updateLlmBadge();
  setupDrawTools();
  setupApplyBanner();
  setupCanvasBehavior();
  setupCanvasPlayClick();
  setupCommandPalette();
  setupQuickActions();
  setupConflictCheck();
  setupDesignLibrary();
  setupCanvasEditor();
  connect();

  // Also try fetching state via HTTP as fallback
  fetchInitialState();

  // Reconnect on visibility change
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && (!ws || ws.readyState !== WebSocket.OPEN)) {
      reconnectAttempts = 0;
      connect();
    }
  });
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
