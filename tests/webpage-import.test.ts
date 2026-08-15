import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import {
  extractHtmlFragments,
  importClientUi,
  importHtmlString,
  splitClientRegions,
} from "../src/import-project.js";

beforeEach(() => {
  stateStore.resetForTests();
});

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head><style>nav a { color: #123456; } footer { padding: 12px; }</style></head>
<body>
  <nav><a href="/">Logo</a><a href="/pricing">Pricing</a></nav>
  <header>
    <h1>Hello World</h1>
    <p>Subtitle here</p>
    <a class="btn" href="#">Get Started</a>
  </header>
  <footer>© 2026 Prism</footer>
</body>
</html>
`;

test("importHtmlString extracts faithful html_fragment regions", () => {
  const result = importHtmlString(SAMPLE_HTML, "sample.html", false);
  assert.ok(result.imported >= 3, `expected >= 3 fragments, got ${result.imported}`);
  assert.equal(result.pageName, "sample.html");
  assert.ok(result.pageId.startsWith("page_"));

  const state = stateStore.getState();
  const types = state.components.map((c) => c.type);
  assert.ok(types.every((t) => t === "html_fragment"), `all fragments: ${types}`);
  const regions = state.components.map((c) => String((c.props as { region?: string }).region ?? ""));
  assert.ok(regions.includes("nav"), `regions: ${regions}`);
  assert.ok(regions.includes("header"), `regions: ${regions}`);
  assert.ok(regions.includes("footer"), `regions: ${regions}`);
  // 原样片段：保留真实 class 与文本
  const navFrag = state.components.find((c) => (c.props as { region?: string }).region === "nav");
  assert.match(String((navFrag?.props as { html?: string }).html ?? ""), /Pricing/);
});

test("importHtmlString carries page CSS into fragments", () => {
  const result = importHtmlString(SAMPLE_HTML, "styled.html", false);
  const state = stateStore.getState();
  const withCss = state.components.filter((c) => String((c.props as { css?: string }).css ?? "").includes("color: #123456"));
  assert.ok(withCss.length > 0, "inline <style> should be collected into fragments");
  assert.ok(result.imported >= 3);
});

test("extractHtmlFragments splits semantic regions and keeps leftover content", () => {
  const frags = extractHtmlFragments("<nav><a>x</a></nav><p>loose</p><footer>f</footer>", "");
  const regions = frags.map((f) => f.region);
  assert.ok(regions.includes("nav") && regions.includes("footer") && regions.includes("content"), `${regions}`);
  const content = frags.find((f) => f.region === "content");
  assert.match(content?.html ?? "", /loose/);
});

test("importHtmlString clears existing state when requested", () => {
  stateStore.addComponent("card", undefined, { title: "old" }, null, "ai");
  const result = importHtmlString(SAMPLE_HTML, "fresh", true);
  assert.ok(result.imported >= 3);
  const state = stateStore.getState();
  assert.ok(state.components.every((c) => c.type !== "card"), "old components should be cleared");
});

test("importHtmlString wraps loose content into a content fragment (full parse)", () => {
  const result = importHtmlString("<p>just text</p>", "loose", false);
  assert.equal(result.imported, 1);
  const comp = stateStore.getState().components[0];
  assert.equal(comp.type, "html_fragment");
  assert.equal((comp.props as { region?: string }).region, "content");
  assert.match(String((comp.props as { html?: string }).html ?? ""), /just text/);
});

test("importClientUi opens the Prism dashboard shell as html_fragment regions", () => {
  const result = importClientUi(false);
  assert.equal(result.pageName, "Prism 客户端 UI");
  assert.ok(result.pageId.startsWith("page_"));
  assert.ok(result.imported >= 3, `expected >= 3 region components, got ${result.imported}`);
  const types = result.components.map((c) => c.type);
  assert.ok(types.every((t) => t === "html_fragment"), `all html_fragment: ${types}`);
  const regions = result.components.map((c) => String((c.props as { region?: string }).region ?? ""));
  for (const expected of ["topbar", "toplib", "main"]) {
    assert.ok(regions.includes(expected), `expected region ${expected} in ${regions}`);
  }
  // 忠实还原：topbar 含真实 logo，toplib 含 13 个 top-lib-tab，
  // main 保留三栏 flex 布局（left/canvas/right 同容器 → 并排显示）
  const toplib = result.components.find((c) => (c.props as { region?: string }).region === "toplib");
  const toplibHtml = String((toplib?.props as { html?: string }).html ?? "");
  const tabCount = (toplibHtml.match(/class="top-lib-tab"/g) || []).length;
  assert.equal(tabCount, 13, `expected 13 top-lib-tab, got ${tabCount}`);
  const topbar = result.components.find((c) => (c.props as { region?: string }).region === "topbar");
  assert.match(String((topbar?.props as { html?: string }).html ?? ""), /🔮 Prism/);
  const main = result.components.find((c) => (c.props as { region?: string }).region === "main");
  const mainHtml = String((main?.props as { html?: string }).html ?? "");
  assert.ok(mainHtml.includes("main-layout"), "main region keeps the flex layout container");
  assert.ok(mainHtml.includes("panel panel-left") && mainHtml.includes("panel panel-right"), "both side panels in main");
  // 聊天框已删除：不应再出现 prompt-input
  assert.ok(!JSON.stringify(result.components.map((c) => c.props)).includes('id="prompt-input"'), "no chat box fragment");
  const state = stateStore.getState();
  const currentPage = state.pages.find((p) => p.id === result.pageId);
  assert.equal(currentPage?.components.length, result.imported);
});

test("splitClientRegions parses region markers", () => {
  const html =
    "<html><body>" +
    "<!-- prism-region:a --><div id=\"a\">old a</div><!-- /prism-region:a -->" +
    "<!-- prism-region:b --><div id=\"b\">old b</div><!-- /prism-region:b -->" +
    "</body></html>";
  const regions = splitClientRegions(html);
  assert.equal(regions.a, '<div id="a">old a</div>');
  assert.equal(regions.b, '<div id="b">old b</div>');
});
