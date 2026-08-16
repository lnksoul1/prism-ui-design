/**
 * 模板快速变更 (product definition v3.2, 支柱⑦ P0).
 *
 * Two curated catalogs that let non-designers restyle or rewire their product
 * in one click — applied to the CURRENT page (not a fresh template page):
 *
 *  1. COMPONENT_TEMPLATES — ready-made component blocks (组件模板). A block is
 *     a full component definition (type + variant + props) that can either be
 *     added to the canvas or REPLACE an existing selected component in place
 *     (keeping its layout position), so "想快就套模板，想细就自己微调".
 *
 *  2. BEHAVIOR_TEMPLATES — one-click interaction presets (交互模板): common
 *     behavior combinations applied to a selected component.
 *
 * Both catalogs are exposed through:
 *   - WS messages  `apply_component_template` / `apply_behavior_template`
 *   - REST          GET  /api/templates          (catalog listing)
 *                   POST /api/templates/component
 *                   POST /api/templates/behavior
 *   - MCP tools     design_apply_component_template / design_apply_behavior_template
 *
 * The client dashboard mirrors this catalog for its library tabs (kept in
 * sync with client/app.js).
 */

import type { ComponentBehavior } from "./state.js";

// ===== Component templates (组件模板) =====

export interface ComponentTemplate {
  id: string;
  name: string;
  /** One-line user-facing description (Chinese). */
  desc: string;
  icon: string;
  type: string;
  variant?: string;
  props: Record<string, unknown>;
  /** Optional preset behavior bound to the block (e.g. a form that toasts on submit). */
  behavior?: ComponentBehavior;
}

export const COMPONENT_TEMPLATES: ComponentTemplate[] = [];
/*
export const COMPONENT_TEMPLATES: ComponentTemplate[] = [
  {
    id: "hero_split_cta",
    name: "Hero 分屏 + CTA",
    desc: "左右分栏：标题 + 说明 + 行动按钮",
    icon: "◈",
    type: "hero",
    variant: "split",
    props: {
      title: "你的产品标题",
      subtitle: "一句话说明你的产品解决了什么问题。",
      button_text: "立即开始",
    },
  },
  {
    id: "navbar_cta",
    name: "导航栏 + 行动按钮",
    desc: "Logo + 菜单 + 右上角 CTA",
    icon: "☰",
    type: "navbar",
    variant: "with_cta",
    props: {
      brand: "你的品牌",
      links: ["首页", "功能", "定价", "关于"],
      cta_text: "开始使用",
    },
  },
  {
    id: "pricing_3col",
    name: "定价三档",
    desc: "基础 / 专业 / 企业三列定价卡",
    icon: "$",
    type: "pricing",
    variant: "3col",
    props: {
      plans: [
        { name: "基础版", price: "¥0", features: ["核心功能", "社区支持"], button_text: "免费开始" },
        { name: "专业版", price: "¥99/月", features: ["全部功能", "优先支持", "高级报表"], button_text: "立即升级", highlighted: true },
        { name: "企业版", price: "定制", features: ["专属部署", "专属客服", "定制开发"], button_text: "联系我们" },
      ],
    },
  },
  {
    id: "signup_form",
    name: "注册表单",
    desc: "姓名 + 邮箱 + 密码，提交时弹出成功提示",
    icon: "✎",
    type: "form",
    variant: "signup",
    props: {
      fields: [
        { label: "姓名", type: "text", placeholder: "请输入姓名" },
        { label: "邮箱", type: "email", placeholder: "you@example.com" },
        { label: "密码", type: "password", placeholder: "至少 8 位" },
      ],
      button_text: "注册",
    },
    behavior: { type: "submit", form_id: "signup" },
  },
  {
    id: "testimonial_grid",
    name: "用户评价墙",
    desc: "3 条客户见证 + 头像",
    icon: '"',
    type: "testimonial",
    variant: "grid",
    props: {
      items: [
        { quote: "用了之后效率翻倍！", author: "张三", role: "产品经理" },
        { quote: "界面好看又顺手。", author: "李四", role: "设计师" },
        { quote: "团队协作神器。", author: "王五", role: "开发者" },
      ],
    },
  },
  {
    id: "stats_bar",
    name: "数据统计条",
    desc: "3 个核心指标数字",
    icon: "#",
    type: "stats",
    variant: "3col",
    props: {
      items: [
        { value: "1000+", label: "活跃用户" },
        { value: "99.9%", label: "可用性" },
        { value: "4.9★", label: "用户评分" },
      ],
    },
  },
  {
    id: "faq_accordion",
    name: "FAQ 手风琴",
    desc: "常见问题折叠面板",
    icon: "≡",
    type: "faq",
    variant: "",
    props: {
      items: [
        { question: "如何开始使用？", answer: "注册账号后即可开始。" },
        { question: "支持退款吗？", answer: "支持，7 天内无理由退款。" },
        { question: "数据安全吗？", answer: "数据加密存储，绝不外泄。" },
      ],
    },
  },
  {
    id: "cta_banner",
    name: "CTA 转化横幅",
    desc: "大标题 + 副标题 + 双按钮",
    icon: "➤",
    type: "cta",
    variant: "banner",
    props: {
      title: "准备好开始了吗？",
      subtitle: "免费试用 14 天，无需信用卡。",
      button_text: "免费试用",
      secondary_text: "预约演示",
    },
    behavior: { type: "link", url: "https://example.com", new_tab: true },
  },
  {
    id: "cookie_consent",
    name: "Cookie 同意横幅",
    desc: "隐私提示 + 接受/拒绝（接受后隐藏）",
    icon: "◉",
    type: "cookie_banner",
    variant: "",
    props: {
      text: "我们使用 Cookie 提升体验",
      accept_text: "接受",
      decline_text: "拒绝",
    },
    behavior: { type: "toggle", target_component_id: "" },
  },
  {
    id: "bento_features",
    name: "便当盒功能网格",
    desc: "非对称大小卡片展示功能",
    icon: "▤",
    type: "bento_grid",
    variant: "",
    props: {
      items: [
        { title: "旗舰功能", size: "large", description: "最重要的能力，占据主位。" },
        { title: "辅助功能", size: "small", description: "简要说明" },
        { title: "第三功能", size: "medium", description: "中等篇幅说明" },
        { title: "第四功能", size: "medium", description: "中等篇幅说明" },
      ],
    },
  },
];
*/

const COMPONENT_TEMPLATE_INDEX = new Map(COMPONENT_TEMPLATES.map((t) => [t.id, t]));

export function getComponentTemplate(id: string): ComponentTemplate | undefined {
  return COMPONENT_TEMPLATE_INDEX.get(id);
}

export function listComponentTemplates(): ComponentTemplate[] {
  return COMPONENT_TEMPLATES.map((t) => ({ ...t }));
}

// ===== Behavior templates (交互模板) =====

export interface BehaviorTemplate {
  id: string;
  name: string;
  desc: string;
  icon: string;
  /**
   * Build the concrete behavior to bind. Context gives access to the current
   * state so templates can resolve defaults (e.g. first page id).
   */
  build: (ctx: {
    currentPageId: string | null;
    pageIds: string[];
    selectedComponentId?: string | null;
  }) => ComponentBehavior;
}
export const BEHAVIOR_TEMPLATES: BehaviorTemplate[] = [];
/*

export const BEHAVIOR_TEMPLATES: BehaviorTemplate[] = [
  {
    id: "open_link_new_tab",
    name: "打开链接（新标签页）",
    desc: "点击后在新标签页打开指定网址",
    icon: "↗",
    build: () => ({ type: "link", url: "https://example.com", new_tab: true }),
  },
  {
    id: "toast_feedback",
    name: "点击提示",
    desc: "点击后弹出提示气泡",
    icon: "◌",
    build: () => ({ type: "toast", message: "操作成功！" }),
  },
  {
    id: "navigate_home",
    name: "跳转首页",
    desc: "点击后跳转到项目首页",
    icon: "⌂",
    build: ({ pageIds, currentPageId }) => ({
      type: "navigate",
      page_id: pageIds[0] || currentPageId || "",
    }),
  },
  {
    id: "toggle_self",
    name: "显隐切换（自身）",
    desc: "点击后显示/隐藏自身（可再改成其他目标）",
    icon: "◐",
    build: ({ selectedComponentId }) => ({
      type: "toggle",
      target_component_id: selectedComponentId || "",
    }),
  },
  {
    id: "submit_feedback",
    name: "表单提交反馈",
    desc: "提交表单并提示成功",
    icon: "✔",
    build: () => ({ type: "submit", form_id: "" }),
  },
  {
    id: "ai_enhance",
    name: "AI 联动指令",
    desc: "点击触发一条 AI 优化指令",
    icon: "✦",
    build: () => ({ type: "prompt", prompt: "优化这个组件的视觉效果" }),
  },
];
*/

const BEHAVIOR_TEMPLATE_INDEX = new Map(BEHAVIOR_TEMPLATES.map((t) => [t.id, t]));

export function getBehaviorTemplate(id: string): BehaviorTemplate | undefined {
  return BEHAVIOR_TEMPLATE_INDEX.get(id);
}

export function listBehaviorTemplates(): { id: string; name: string; desc: string; icon: string }[] {
  return BEHAVIOR_TEMPLATES.map((t) => ({ id: t.id, name: t.name, desc: t.desc, icon: t.icon }));
}
