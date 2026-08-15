// /* === SPLIT-MODULE === */
/**
 * Prism Dashboard — Global state, DOM helpers and i18n dictionary (loaded first).
 *
 * Part of the split client application. All parts are global-scope scripts;
 * they must be loaded in the order declared in index.html.
 */

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
// 元素级编辑 P1: 组件内部被选中的元素路径（如 "title" / "items.0.title"）。
let selectedElementPath = null;
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

// ===== Performance Metrics (Phase 3.5) =====

/**
 * Render performance instrumentation. Enabled with `?perf=1` (or
 * `?perf=2` for per-call verbose logs). Keeps a sliding window of recent
 * render timings and exposes them on `window.PrismPerf` so the stats can be
 * read from the console or automated tests.
 */
const perfEnabled = (() => {
  try {
    return new URLSearchParams(window.location.search).get("perf") === "1" || new URLSearchParams(window.location.search).get("perf") === "2";
  } catch {
    return false;
  }
})();
const perfVerbose = (() => {
  try {
    return new URLSearchParams(window.location.search).get("perf") === "2";
  } catch {
    return false;
  }
})();

const perfStats = {
  renders: 0,
  totalMs: 0,
  lastMs: 0,
  maxMs: 0,
  window: [],
};
const PERF_WINDOW = 50;

/** Time a render operation; logs + records stats when ?perf= is active. */
function perfTime(name, fn, opts) {
  if (!perfEnabled) return fn();
  const t0 = performance.now();
  const result = fn();
  const ms = performance.now() - t0;
  perfStats.renders++;
  perfStats.totalMs += ms;
  perfStats.lastMs = ms;
  if (ms > perfStats.maxMs) perfStats.maxMs = ms;
  const entry = { name, ms, count: opts && opts.count };
  perfStats.window.push(entry);
  if (perfStats.window.length > PERF_WINDOW) perfStats.window.shift();
  if (perfVerbose) {
    const suffix = entry.count ? ` (${entry.count} comps)` : "";
    console.debug(`[perf] ${name} ${ms.toFixed(2)}ms${suffix}`);
  }
  return result;
}

/** Expose perf stats to tests / console (only when enabled). */
function exposePerf() {
  if (!perfEnabled) return;
  try {
    window.PrismPerf = {
      enabled: true,
      verbose: perfVerbose,
      stats: perfStats,
      summary: () =>
        `renders=${perfStats.renders} avg=${(perfStats.totalMs / Math.max(1, perfStats.renders)).toFixed(2)}ms last=${perfStats.lastMs.toFixed(2)}ms max=${perfStats.maxMs.toFixed(2)}ms`,
    };
  } catch {
    // ignore
  }
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
    // 背景编辑 P1 (page background)
    pageBackground: "页面背景",
    pageBackgroundHint: "作用于整个画布，导出时应用到页面 body",
    bgCustom: "自定义",
    bgColor: "颜色",
    bgGradient: "渐变",
    bgImageUrl: "图片 URL",
    bgApplyColor: "应用颜色",
    bgClear: "清除背景",
    bgCustomHint: "渐变请输入 CSS linear-gradient()，图片粘贴图片 URL 后回车",
    toastBgApplied: "页面背景已应用",
    toastBgCleared: "页面背景已清除",
    bgAdvanced: "渐变/图片",
    // 元素级编辑 P1 (element panel)
    elementTitle: "元素 · {path}",
    elementTitleHint: "组件内部元素：可为文字/按钮绑定独立交互，或转换为按钮/链接",
    elementKind: "类型",
    kindText: "文本",
    kindButton: "按钮",
    kindLink: "链接",
    elementBack: "↩ 返回组件编辑",
    // 画布交互 / 模板 (canvas & templates)
    canvasBehaviorBound: "已绑定交互（播放模式点击触发）",
    canvasBehaviorBoundN: "已为 {n} 个形状绑定交互",
    addComponentAnimFirst: "请先添加组件，再应用动效",
    templateReplaced: "已替换选中组件（位置保持不变）",
    templateAdded: "已添加组件模板",
    templateReplaceDone: "已替换选中组件",
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
    // Page background P1
    pageBackground: "Page background",
    pageBackgroundHint: "Applies to the whole canvas; exported to the page body",
    bgCustom: "Custom",
    bgColor: "Color",
    bgGradient: "Gradient",
    bgImageUrl: "Image URL",
    bgApplyColor: "Apply color",
    bgClear: "Clear background",
    bgCustomHint: "For gradients enter a CSS linear-gradient(); for images paste an image URL and press Enter",
    toastBgApplied: "Page background applied",
    toastBgCleared: "Page background cleared",
    bgAdvanced: "Gradient/Image",
    // Element-level editing P1
    elementTitle: "Element · {path}",
    elementTitleHint: "Inner element of a component: bind its own interaction, or promote to button/link",
    elementKind: "Type",
    kindText: "Text",
    kindButton: "Button",
    kindLink: "Link",
    elementBack: "↩ Back to component",
    // Canvas & templates
    canvasBehaviorBound: "Interaction bound (triggers in play mode)",
    canvasBehaviorBoundN: "Bound interactions to {n} shapes",
    addComponentAnimFirst: "Add a component first, then apply the animation",
    templateReplaced: "Replaced the selected component (position kept)",
    templateAdded: "Component template added",
    templateReplaceDone: "Selected component replaced",
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

