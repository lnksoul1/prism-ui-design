// client-v2/src/components/Canvas/LibraryView.test.tsx
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderLibraryContent } from "./LibraryView";
import type { ComponentNode } from "../../types";

function renderNode(type: string, props: Record<string, unknown>): void {
  const node: ComponentNode = { id: "n1", type, props, children: [] };
  render(<div>{renderLibraryContent(node)}</div>);
}

test("navbar renders brand, links and cta button", () => {
  renderNode("navbar", { brand: "Prism", links: ["首页", "功能", "定价"], cta_text: "开始使用" });
  expect(screen.getByText("Prism")).toBeTruthy();
  expect(screen.getByText("首页")).toBeTruthy();
  expect(screen.getByText("功能")).toBeTruthy();
  expect(screen.getByText("定价")).toBeTruthy();
  expect(screen.getByRole("button", { name: "开始使用" })).toBeTruthy();
  expect(document.querySelector(".lv-navbar")).toBeTruthy();
});

test("hero renders centered title, subtitle and cta button", () => {
  renderNode("hero", { title: "主标题文案", subtitle: "副标题描述文字", button_text: "开始使用", image_url: "" });
  expect(screen.getByText("主标题文案")).toBeTruthy();
  expect(screen.getByText("副标题描述文字")).toBeTruthy();
  expect(screen.getByRole("button", { name: "开始使用" })).toBeTruthy();
  expect(document.querySelector(".lv-hero")).toBeTruthy();
});

test("pricing renders plan cards with featured highlight", () => {
  renderNode("pricing", {
    title: "价格方案",
    plans: [
      { name: "免费版", price: "¥0", features: ["基础功能", "3 个项目"], cta: "开始使用" },
      { name: "专业版", price: "¥99/月", features: ["全部功能"], cta: "立即购买", featured: true },
    ],
  });
  expect(screen.getByText("价格方案")).toBeTruthy();
  expect(screen.getByText("免费版")).toBeTruthy();
  expect(screen.getByText("专业版")).toBeTruthy();
  expect(screen.getByText("¥0")).toBeTruthy();
  expect(screen.getByText("¥99/月")).toBeTruthy();
  expect(document.querySelectorAll(".lv-plan").length).toBe(2);
  const featured = document.querySelector(".lv-plan-featured") as HTMLElement;
  expect(featured).toBeTruthy();
  expect(featured.textContent).toContain("专业版");
});

test("table renders real table markup with columns and rows", () => {
  renderNode("table", {
    title: "数据表格",
    columns: ["名称", "状态", "操作"],
    rows: [
      ["项目 A", "进行中", "查看"],
      ["项目 B", "已完成", "查看"],
    ],
  });
  expect(document.querySelector("table")).toBeTruthy();
  expect(document.querySelectorAll("th").length).toBe(3);
  expect(screen.getByText("名称")).toBeTruthy();
  expect(screen.getByText("状态")).toBeTruthy();
  expect(screen.getByText("项目 A")).toBeTruthy();
  expect(screen.getByText("项目 B")).toBeTruthy();
  expect(document.querySelectorAll("tbody tr").length).toBe(2);
});

test("unknown type falls back to cv-placeholder with type label", () => {
  renderNode("mystery_widget", { text: "" });
  const ph = document.querySelector(".cv-placeholder") as HTMLElement;
  expect(ph).toBeTruthy();
  expect(ph.textContent).toContain("mystery_widget");
});

test("form renders title and labeled input fields", () => {
  renderNode("form", {
    title: "表单标题",
    fields: [
      { label: "姓名", type: "input", placeholder: "请输入姓名" },
      { label: "邮箱", type: "input", placeholder: "请输入邮箱" },
    ],
  });
  expect(screen.getByText("表单标题")).toBeTruthy();
  expect(screen.getByText("姓名")).toBeTruthy();
  expect(screen.getByText("邮箱")).toBeTruthy();
  expect(document.querySelectorAll(".lv-form-field input").length).toBe(2);
});

test("statistic renders label, value and upward trend", () => {
  renderNode("statistic", { label: "活跃用户", value: "8,846", suffix: "", trend: "+12.5%", trendDir: "up" });
  expect(screen.getByText("活跃用户")).toBeTruthy();
  expect(screen.getByText("8,846")).toBeTruthy();
  const trend = screen.getByText("+12.5%");
  expect(trend.className).toContain("lv-stat-trend-up");
});

test("faq renders question and answer pairs", () => {
  renderNode("faq", {
    items: [
      { q: "常见问题一？", a: "这是问题一的回答内容。" },
      { q: "常见问题二？", a: "这是问题二的回答内容。" },
    ],
  });
  expect(screen.getByText("常见问题一？")).toBeTruthy();
  expect(screen.getByText("这是问题一的回答内容。")).toBeTruthy();
  expect(screen.getByText("常见问题二？")).toBeTruthy();
  expect(document.querySelectorAll(".lv-faq-item").length).toBe(2);
});

test("progress renders a bar with width proportional to value", () => {
  renderNode("progress", { value: 60, variant: "line", label: "进度" });
  const fill = document.querySelector(".lv-progress-fill") as HTMLElement;
  expect(fill).toBeTruthy();
  expect(fill.style.width).toBe("60%");
});

// 覆盖 src/design-library.ts defaultPropsFor 的全部类型（默认 props 形状），
// 保证任一库组件加入画布都有结构化渲染且不抛错。
const ALL_TYPES: Array<[string, Record<string, unknown>]> = [
  ["button", { text: "按钮" }],
  ["link", { text: "链接文字", href: "#" }],
  ["input", { label: "标签", placeholder: "请输入" }],
  ["textarea", { label: "标签", placeholder: "请输入多行文本", rows: 3 }],
  ["input_number", { label: "数量", value: 0 }],
  ["radio", { label: "单选项", options: ["选项 A", "选项 B"] }],
  ["checkbox", { label: "复选项", checked: true }],
  ["switch", { label: "开关", checked: false }],
  ["slider", { label: "滑块", value: 50, min: 0, max: 100 }],
  ["rate", { label: "评分", value: 3, max: 5 }],
  ["select", { label: "下拉选择", placeholder: "请选择", options: ["A"], value: "" }],
  ["autocomplete", { label: "搜索", placeholder: "输入关键词" }],
  ["cascader", { label: "级联选择", placeholder: "请选择" }],
  ["tree_select", { label: "树选择", placeholder: "请选择" }],
  ["date_picker", { label: "日期", placeholder: "选择日期", value: "2026-08-17" }],
  ["time_picker", { label: "时间", placeholder: "选择时间", value: "12:30" }],
  ["upload", { label: "上传文件", hint: "点击或拖拽文件到此区域上传" }],
  ["form", { title: "表单标题", fields: [{ label: "姓名", type: "input", placeholder: "请输入" }] }],
  ["color_picker", { label: "颜色", value: "#2383E2" }],
  ["label", { text: "标签" }],
  ["table", { title: "数据表格", columns: ["名称"], rows: [["项目 A"]] }],
  ["list", { title: "列表", items: ["列表项一"] }],
  ["card", { title: "卡片标题", description: "描述", price: "", image_url: "" }],
  ["tag", { tags: [{ text: "标签一", color: "blue" }] }],
  ["badge", { text: "通知", count: 8 }],
  ["avatar", { text: "AB", size: 48 }],
  ["descriptions", { title: "详情信息", items: [{ label: "用户名", value: "admin" }] }],
  ["statistic", { label: "活跃用户", value: "8,846", suffix: "", trend: "+12.5%", trendDir: "up" }],
  ["tabs", { tabs: [{ title: "标签页 1", active: true }], content: "内容区域" }],
  ["segmented", { label: "视图模式", options: ["日", "周"], value: "日" }],
  ["accordion", { items: [{ title: "面板一", content: "展开内容一。", open: true }] }],
  ["timeline", { items: [{ title: "启动项目", desc: "2026-01-15", color: "blue" }] }],
  ["tree", { nodes: [{ title: "父节点", children: [{ title: "子节点一" }] }] }],
  ["carousel", { items: [{ text: "轮播图一" }] }],
  ["empty", { text: "暂无数据", desc: "暂时没有内容可展示" }],
  ["image", { src: "", alt: "图片占位", width: 200, height: 120 }],
  ["file", { name: "document.pdf", size: "2.4 MB", progress: 65 }],
  ["icon", { name: "home", size: 24 }],
  ["alert", { variant: "info", title: "提示", message: "这是一条提示信息。" }],
  ["toast", { message: "操作成功", variant: "success" }],
  ["notification", { title: "通知标题", message: "通知内容", time: "刚刚" }],
  ["modal", { title: "对话框标题", body: "对话框内容区域" }],
  ["drawer", { title: "抽屉标题", body: "抽屉内容区域" }],
  ["popconfirm", { title: "确定执行此操作吗？", okText: "确定", cancelText: "取消" }],
  ["popover", { title: "弹出提示", content: "这是弹出内容。" }],
  ["tooltip", { text: "悬停提示文字", tip: "这是提示信息" }],
  ["progress", { value: 60, variant: "line", label: "进度" }],
  ["skeleton", { lines: 4, width: 200 }],
  ["result", { variant: "success", title: "操作成功", desc: "您的操作已完成。" }],
  ["spinner", { size: 32 }],
  ["menu", { items: [{ text: "菜单项一", active: true }] }],
  ["breadcrumb", { items: ["首页", "当前页面"] }],
  ["pagination", { current: 1, total: 50, pageSize: 10 }],
  ["steps", { items: [{ title: "第一步", desc: "开始" }], current: 0 }],
  ["dropdown", { label: "下拉菜单", items: ["选项 A"] }],
  ["hero", { title: "主标题", subtitle: "副标题", button_text: "开始使用", image_url: "" }],
  ["cta", { title: "准备好了吗？", subtitle: "立即开始", button_text: "立即开始" }],
  ["navbar", { brand: "Prism", links: ["首页"], cta_text: "开始使用" }],
  ["footer", { text: "© 2026 Prism.", links: ["隐私政策"] }],
  ["faq", { items: [{ q: "问题？", a: "回答。" }] }],
  ["pricing", { title: "价格方案", plans: [{ name: "免费版", price: "¥0", features: ["基础功能"], cta: "开始使用" }] }],
  ["divider", { orientation: "horizontal", text: "" }],
  ["text_section", { title: "标题", body: "正文内容" }],
];

test("every library type renders structured markup without crashing", () => {
  for (const [type, props] of ALL_TYPES) {
    const { container } = render(<div>{renderLibraryContent({ id: "n", type, props, children: [] })}</div>);
    expect(container.innerHTML, `render output for ${type}`).not.toBe("");
    expect(container.querySelector(".cv-placeholder"), `${type} must not fall back to placeholder`).toBeNull();
  }
});
