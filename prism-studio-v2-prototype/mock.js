/**
 * Prism Studio v2 — Mock Data & State
 *
 * All design data, component library, and platform presets
 * are defined here. No real backend — everything is local.
 */

// ===== Component Library =====
const LIBRARY_COMPONENTS = [
  { id: "navbar",       name: "导航栏",     icon: "☰",  category: "layout", desc: "顶部导航栏" },
  { id: "hero",         name: "英雄区域",   icon: "◈",  category: "layout", desc: "大标题 + CTA" },
  { id: "sidebar",      name: "侧边栏",     icon: "◧",  category: "layout", desc: "侧边导航面板" },
  { id: "toolbar-app",  name: "应用工具栏", icon: "⬒",  category: "layout", desc: "桌面端工具栏" },
  { id: "features",     name: "功能展示",   icon: "✦",  category: "content", desc: "3列功能卡片" },
  { id: "card",         name: "卡片",       icon: "☐",  category: "content", desc: "内容卡片" },
  { id: "cta",          name: "行动号召",   icon: "➤",  category: "content", desc: "CTA 区域" },
  { id: "text",         name: "文本块",     icon: "T",  category: "content", desc: "标题/段落" },
  { id: "data-table",   name: "数据表格",   icon: "▦",  category: "data",    desc: "表格式数据" },
  { id: "stats",        name: "统计面板",   icon: "#",  category: "data",    desc: "指标数字" },
  { id: "form",         name: "表单",       icon: "✎",  category: "input",   desc: "输入表单" },
  { id: "footer",       name: "页脚",       icon: "▬",  category: "layout", desc: "底部信息" },
];

const LIBRARY_STYLES = [
  { id: "minimal",   name: "极简",   icon: "○", color: "#4A6FA5", desc: "留白、中性色、克制" },
  { id: "bold",      name: "大胆",   icon: "◆", color: "#7C3AED", desc: "高对比、强烈视觉层级" },
  { id: "playful",   name: "活泼",   icon: "♥", color: "#E84393", desc: "温暖、圆润、趣味" },
  { id: "dark",      name: "暗色",   icon: "◐", color: "#3B82F6", desc: "深色优先、发光点缀" },
  { id: "editorial", name: "杂志",   icon: "✦", color: "#B45309", desc: "优雅衬线、排版精致" },
  { id: "tech",      name: "科技",   icon: "◇", color: "#06B6D4", desc: "未来感、锐利几何" },
];

const LIBRARY_ANIMATIONS = [
  { id: "fadeUp",      name: "淡入上移",   icon: "↑",  desc: "从下方淡入" },
  { id: "scaleIn",     name: "缩放进入",   icon: "⊙",  desc: "从小到大" },
  { id: "slideRight",  name: "右滑入场",   icon: "→",  desc: "从左侧滑入" },
  { id: "spring",      name: "弹性弹出",   icon: "◆",  desc: "带回弹缩放" },
  { id: "liftHover",   name: "悬停浮起",   icon: "⇡",  desc: "hover 上浮" },
  { id: "glowHover",   name: "悬停发光",   icon: "✧",  desc: "hover 发光" },
];

// ===== Platform Presets =====
const PLATFORMS = {
  "web-desktop":   { name: "Web 桌面",  icon: "🖥", frame: "browser",  width: 0 /* auto */, canvasHeight: 900 },
  "web-tablet":    { name: "Web 平板",  icon: "📱", frame: "browser",  width: 834, canvasHeight: 1114 },
  "web-mobile":    { name: "Web 手机",  icon: "📲", frame: "browser",  width: 390, canvasHeight: 844 },
  "desktop-macos": { name: "macOS 应用", icon: "",  frame: "macos",    width: 0, canvasHeight: 700 },
  "desktop-win":   { name: "Windows 应用", icon: "", frame: "windows", width: 0, canvasHeight: 700 },
  "mobile-ios":    { name: "iOS 应用",  icon: "",   frame: "ios",      width: 390, canvasHeight: 844 },
  "mobile-android":{ name: "Android 应用", icon: "", frame: "android",  width: 390, canvasHeight: 844 },
};

// ===== Design Data (initial state for each platform) =====
const MOCK_DESIGNS = {
  "web-desktop": [
    { id: "c1", type: "navbar",   x: 0, y: 0, w: 0, h: 56,  label: "导航栏",
      props: { brand: "Prism", links: ["功能", "定价", "关于", "文档"], cta: "开始使用" } },
    { id: "c2", type: "hero",     x: 0, y: 56, w: 0, h: 360, label: "英雄区域",
      props: { title: "用 AI 重新定义 UI 设计", subtitle: "从灵感到上线，只需一次对话", button: "立即开始" } },
    { id: "c3", type: "features", x: 0, y: 416, w: 0, h: 320, label: "功能展示",
      props: { title: "为什么选择 Prism",
        items: [
          { icon: "◆", title: "AI 驱动生成", desc: "自然语言描述需求，AI 实时生成高保真界面" },
          { icon: "◈", title: "可视化精修", desc: "滑块、内联编辑、拖拽调整，精确控制每个像素" },
          { icon: "✦", title: "多平台设计", desc: "一套设计，同时覆盖 Web、桌面端和移动端应用" },
        ]
      }
    },
    { id: "c4", type: "cta",      x: 0, y: 736, w: 0, h: 180, label: "行动号召",
      props: { title: "准备好开始了吗？", button: "免费试用" } },
    { id: "c5", type: "footer",   x: 0, y: 916, w: 0, h: 80,  label: "页脚",
      props: { copyright: "© 2026 Prism Studio", links: ["隐私", "条款", "联系"] } },
  ],
  "web-tablet": [
    { id: "c1", type: "navbar",   x: 0, y: 0, w: 0, h: 56,  label: "导航栏",
      props: { brand: "Prism", links: ["功能", "定价"], cta: "开始" } },
    { id: "c2", type: "hero",     x: 0, y: 56, w: 0, h: 280, label: "英雄区域",
      props: { title: "AI UI 设计", subtitle: "一次对话，从灵感到上线", button: "立即开始" } },
    { id: "c3", type: "features", x: 0, y: 336, w: 0, h: 300, label: "功能展示",
      props: { title: "核心功能",
        items: [
          { icon: "◆", title: "AI 生成", desc: "自然语言生成界面" },
          { icon: "◈", title: "可视化编辑", desc: "拖拽精修每个细节" },
        ]
      }
    },
    { id: "c4", type: "footer",   x: 0, y: 636, w: 0, h: 60,  label: "页脚",
      props: { copyright: "© 2026 Prism", links: ["隐私"] } },
  ],
  "web-mobile": [
    { id: "c1", type: "navbar",   x: 0, y: 0, w: 0, h: 48,  label: "导航栏",
      props: { brand: "Prism", links: [], cta: "菜单" } },
    { id: "c2", type: "hero",     x: 0, y: 48, w: 0, h: 240, label: "英雄区域",
      props: { title: "AI UI 设计", subtitle: "一次对话完成设计", button: "开始" } },
    { id: "c3", type: "footer",   x: 0, y: 288, w: 0, h: 60,  label: "页脚",
      props: { copyright: "© 2026 Prism", links: [] } },
  ],
  "desktop-macos": [
    { id: "c1", type: "sidebar",     x: 0, y: 0, w: 220, h: 0, label: "侧边栏",
      props: { items: [
        { icon: "🏠", name: "概览" },
        { icon: "📊", name: "数据" },
        { icon: "⚙", name: "设置" },
        { icon: "👤", name: "账户" },
      ], active: 0 } },
    { id: "c2", type: "toolbar-app", x: 220, y: 0, w: 0, h: 44, label: "工具栏",
      props: { buttons: ["新建", "导入"], primary: "新建" } },
    { id: "c3", type: "data-table",  x: 220, y: 44, w: 0, h: 0, label: "数据表格",
      props: { columns: ["名称", "状态", "更新时间"], rows: [
        ["项目 Alpha", "进行中", "2 小时前"],
        ["项目 Beta", "已完成", "昨天"],
        ["项目 Gamma", "草稿", "3 天前"],
      ] } },
  ],
  "desktop-win": [
    { id: "c1", type: "sidebar",     x: 0, y: 0, w: 220, h: 0, label: "侧边栏",
      props: { items: [
        { icon: "📊", name: "仪表盘" },
        { icon: "📁", name: "项目" },
        { icon: "⚙", name: "设置" },
      ], active: 0 } },
    { id: "c2", type: "toolbar-app", x: 220, y: 0, w: 0, h: 44, label: "工具栏",
      props: { buttons: ["新建", "打开"], primary: "新建" } },
    { id: "c3", type: "data-table",  x: 220, y: 44, w: 0, h: 0, label: "数据表格",
      props: { columns: ["名称", "状态", "修改日期"], rows: [
        ["报告 A", "活跃", "2026-08-10"],
        ["报告 B", "归档", "2026-07-15"],
      ] } },
  ],
  "mobile-ios": [
    { id: "c1", type: "navbar",   x: 0, y: 0, w: 0, h: 44,  label: "导航栏",
      props: { brand: "Prism", links: [], cta: "编辑" } },
    { id: "c2", type: "features", x: 0, y: 44, w: 0, h: 0, label: "功能卡片",
      props: { title: "",
        items: [
          { icon: "◆", title: "AI 生成", desc: "描述需求，AI 生成界面" },
          { icon: "◈", title: "可视化编辑", desc: "拖拽调整每个元素" },
          { icon: "✦", title: "多平台", desc: "Web + 桌面 + 移动端" },
        ]
      }
    },
  ],
  "mobile-android": [
    { id: "c1", type: "navbar",   x: 0, y: 0, w: 0, h: 48,  label: "导航栏",
      props: { brand: "Prism", links: [], cta: "" } },
    { id: "c2", type: "features", x: 0, y: 48, w: 0, h: 0, label: "功能列表",
      props: { title: "",
        items: [
          { icon: "◆", title: "AI 生成", desc: "用自然语言设计界面" },
          { icon: "◈", title: "精修控制", desc: "滑块和拖拽精确调整" },
        ]
      }
    },
  ],
};

// ===== Application State =====
const appState = {
  platform: "web-desktop",
  selectedId: null,
  zoom: 100,
  designs: JSON.parse(JSON.stringify(MOCK_DESIGNS)),
  dragState: null,   // { compId, startX, startY, origX, origY }
  resizeState: null,  // { compId, handle, startX, startY, origW, origH, origX, origY }
};

// Helper to get current design components
function getCurrentDesign() {
  return appState.designs[appState.platform] || [];
}

function getSelectedComp() {
  if (!appState.selectedId) return null;
  return getCurrentDesign().find(c => c.id === appState.selectedId) || null;
}

// Component property definitions (for inspector)
const COMP_PROPS = {
  navbar: {
    layout: [
      { key: "h", label: "高度", type: "slider", min: 40, max: 100, step: 2, unit: "px" },
    ],
    content: [
      { key: "brand", label: "品牌", type: "text" },
    ],
    appearance: [
      { key: "bg", label: "背景", type: "color", default: "#ffffff" },
    ],
  },
  hero: {
    layout: [
      { key: "h", label: "高度", type: "slider", min: 200, max: 600, step: 10, unit: "px" },
    ],
    content: [
      { key: "title", label: "标题", type: "text" },
      { key: "subtitle", label: "副标题", type: "text" },
      { key: "button", label: "按钮", type: "text" },
    ],
    appearance: [
      { key: "bg", label: "背景", type: "color", default: "#f5f3ff" },
    ],
  },
  sidebar: {
    layout: [
      { key: "w", label: "宽度", type: "slider", min: 160, max: 320, step: 10, unit: "px" },
    ],
    content: [],
    appearance: [
      { key: "bg", label: "背景", type: "color", default: "#f5f5f7" },
    ],
  },
  "toolbar-app": {
    layout: [
      { key: "h", label: "高度", type: "slider", min: 36, max: 64, step: 2, unit: "px" },
    ],
    content: [],
    appearance: [
      { key: "bg", label: "背景", type: "color", default: "#ffffff" },
    ],
  },
  features: {
    layout: [
      { key: "h", label: "高度", type: "slider", min: 200, max: 600, step: 10, unit: "px" },
    ],
    content: [
      { key: "title", label: "标题", type: "text" },
    ],
    appearance: [
      { key: "bg", label: "背景", type: "color", default: "#ffffff" },
    ],
  },
  cta: {
    layout: [
      { key: "h", label: "高度", type: "slider", min: 120, max: 400, step: 10, unit: "px" },
    ],
    content: [
      { key: "title", label: "标题", type: "text" },
      { key: "button", label: "按钮", type: "text" },
    ],
    appearance: [
      { key: "bg", label: "背景", type: "color", default: "#6d28d9" },
    ],
  },
  footer: {
    layout: [
      { key: "h", label: "高度", type: "slider", min: 40, max: 160, step: 4, unit: "px" },
    ],
    content: [
      { key: "copyright", label: "版权", type: "text" },
    ],
    appearance: [
      { key: "bg", label: "背景", type: "color", default: "#1a1a2e" },
    ],
  },
  "data-table": {
    layout: [],
    content: [],
    appearance: [
      { key: "bg", label: "背景", type: "color", default: "#ffffff" },
    ],
  },
};
