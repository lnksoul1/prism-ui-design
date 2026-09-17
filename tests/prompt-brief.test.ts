// tests/prompt-brief.test.ts — 设计 → 提示词简报（编译器 + 路由）
// 编译器为纯函数：把 DesignState 编译成给 AI 编码工具的自然语言简报。
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express, { type Express } from "express";
import type { Server } from "node:http";
import { stateStore } from "../src/state.js";
import { compilePromptBrief } from "../src/prompt-brief.js";
import { registerPromptBriefRoutes } from "../src/routes/prompt-brief.js";
import { errorHandler } from "../src/routes/shared.js";

let app: Express;
let server: Server;
let base = "";

before(async () => {
  app = express();
  app.use(express.json());
  app.use(registerPromptBriefRoutes());
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") base = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  stateStore.resetForTests();
});

function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> }));
}

/** 构造演示状态：令牌 + 首页（导航栏/按钮/容器含子组件）+ 详情页 + 页面链接。 */
function buildDemoState(): void {
  stateStore.setProjectName("演示项目", "user");
  stateStore.setToken("colors", "color-primary", "#2383E2", "user");
  stateStore.setToken("typography", "font-body", "Inter", "user");
  stateStore.setToken("radii", "radius-md", "8px", "user");
  const home = stateStore.getState().pages[0];
  stateStore.renamePage(home.id, "首页", "user");
  const detail = stateStore.addPage("详情页", "user");
  stateStore.switchPage(home.id, "user");
  const nav = stateStore.addComponent("navbar", undefined, { brand: "Prism" }, null, "user");
  stateStore.updateComponent(nav.id, {}, "user", { x: 0, y: 0, w: 1280, h: 64 });
  const btn = stateStore.addComponent("button", "primary", { button_text: "查看详情" }, null, "user");
  stateStore.updateComponent(btn.id, {}, "user", { x: 80, y: 400, w: 160, h: 48 });
  stateStore.setBehavior(btn.id, { type: "navigate", page_id: detail.id }, "user");
  const box = stateStore.addComponent("container", undefined, {}, null, "user");
  stateStore.updateComponent(box.id, {}, "user", { x: 0, y: 640, w: 1280, h: 200 });
  stateStore.addComponent("text", undefined, { text: "页脚说明" }, box.id, "user");
  stateStore.switchPage(detail.id, "user");
  const t = stateStore.addComponent("text", undefined, { text: "详情内容" }, null, "user");
  stateStore.setBaseStyle(t.id, { fontSize: "18px", color: "#111111" }, "user");
  stateStore.addPageLink(home.id, detail.id, undefined, btn.id, "user", "slide-left");
}

describe("compilePromptBrief", () => {
  test("同一状态两次编译输出完全一致（确定性）", () => {
    buildDemoState();
    const a = compilePromptBrief(stateStore.getState());
    const b = compilePromptBrief(stateStore.getState());
    assert.equal(a, b);
  });

  test("头部包含项目名与技术栈（默认 react）", () => {
    buildDemoState();
    const brief = compilePromptBrief(stateStore.getState());
    assert.match(brief, /演示项目/);
    assert.match(brief, /React 19 \+ TypeScript/);
    assert.match(brief, /完整可交互/);
  });

  test("react 与 html 技术栈输出不同，html 含原生说明", () => {
    buildDemoState();
    const state = stateStore.getState();
    const react = compilePromptBrief(state, { stack: "react" });
    const html = compilePromptBrief(state, { stack: "html" });
    assert.notEqual(react, html);
    assert.match(html, /原生 HTML \+ CSS/);
    assert.doesNotMatch(html, /React 19/);
  });

  test("组件文本 props 写入简报，子组件缩进两个空格", () => {
    buildDemoState();
    const brief = compilePromptBrief(stateStore.getState());
    assert.match(brief, /「Prism」/);
    assert.match(brief, /「查看详情」/);
    assert.match(brief, /\n {2}- .*「页脚说明」/);
  });

  test("位置定性描述：顶部通栏（由 layout 相对页面宽度推导）", () => {
    buildDemoState();
    const brief = compilePromptBrief(stateStore.getState());
    assert.match(brief, /navbar，顶部通栏/);
    assert.match(brief, /约 1280×64/);
  });

  test("无 layout 的组件按内容流式排列", () => {
    stateStore.addComponent("text", undefined, { text: "流式文本" }, null, "user");
    const brief = compilePromptBrief(stateStore.getState());
    assert.match(brief, /按内容流式排列/);
    assert.match(brief, /「流式文本」/);
  });

  test("行为 navigate 与页面链接（含转场）都写入简报", () => {
    buildDemoState();
    const brief = compilePromptBrief(stateStore.getState());
    assert.match(brief, /点击跳转到页面「详情页」/);
    assert.match(brief, /导航：首页 的「查看详情」→ 详情页（转场：slide-left）/);
  });

  test("toast / link / toggle 行为描述", () => {
    const a = stateStore.addComponent("button", undefined, { text: "弹提示" }, null, "user");
    stateStore.setBehavior(a.id, { type: "toast", message: "已保存" }, "user");
    const b = stateStore.addComponent("text", undefined, { text: "目标" }, null, "user");
    const c = stateStore.addComponent("button", undefined, { text: "外链" }, null, "user");
    stateStore.setBehavior(c.id, { type: "link", url: "https://example.com" }, "user");
    const d = stateStore.addComponent("button", undefined, { text: "切换" }, null, "user");
    stateStore.setBehavior(d.id, { type: "toggle", target_component_id: b.id }, "user");
    const brief = compilePromptBrief(stateStore.getState());
    assert.match(brief, /点击弹出提示「已保存」/);
    assert.match(brief, /打开链接 https:\/\/example\.com/);
    assert.match(brief, /切换显示元素「目标」/);
  });

  test("设计令牌摘要（主色/字体/圆角）", () => {
    buildDemoState();
    const brief = compilePromptBrief(stateStore.getState());
    assert.match(brief, /- 主色 #2383E2/);
    assert.match(brief, /Inter/);
    assert.match(brief, /8px/);
  });

  test("baseStyle 关键样式（字号/颜色）写入简报", () => {
    buildDemoState();
    const brief = compilePromptBrief(stateStore.getState());
    assert.match(brief, /字号 18px/);
    assert.match(brief, /颜色 #111111/);
  });

  test("pages 过滤只保留指定页面", () => {
    buildDemoState();
    const state = stateStore.getState();
    const detail = state.pages.find((p) => p.name === "详情页")!;
    const brief = compilePromptBrief(state, { pages: [detail.id] });
    assert.match(brief, /## 页面：详情页/);
    assert.doesNotMatch(brief, /## 页面：首页/);
    assert.doesNotMatch(brief, /「Prism」/);
  });

  test("空页面不跳过", () => {
    stateStore.addPage("空白页", "user");
    const brief = compilePromptBrief(stateStore.getState());
    assert.match(brief, /## 页面：空白页/);
    assert.match(brief, /暂无组件/);
  });

  test("结尾包含实现要求清单", () => {
    buildDemoState();
    const brief = compilePromptBrief(stateStore.getState());
    assert.match(brief, /## 实现要求/);
    assert.match(brief, /响应式/);
    assert.match(brief, /文案/);
  });
});

describe("POST /api/prompt-brief", () => {
  test("默认请求返回简报", async () => {
    buildDemoState();
    const { status, body } = await post("/api/prompt-brief", {});
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(typeof body.brief, "string");
    assert.match(body.brief as string, /演示项目/);
  });

  test("stack=html 返回原生 HTML 简报", async () => {
    buildDemoState();
    const { status, body } = await post("/api/prompt-brief", { stack: "html" });
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.match(body.brief as string, /原生 HTML \+ CSS/);
  });

  test("非法 stack 返回 400", async () => {
    buildDemoState();
    const { status, body } = await post("/api/prompt-brief", { stack: "vue" });
    assert.equal(status, 400);
    assert.ok(typeof body.error === "string");
  });

  test("非法 page_ids 返回 400", async () => {
    buildDemoState();
    const { status } = await post("/api/prompt-brief", { page_ids: "home" });
    assert.equal(status, 400);
  });
});
