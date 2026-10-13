import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { applyPageTemplate, exportDesign } from "../src/tools/design-tools.js";
import { applyStyleTokenSet } from "../src/tokens.js";

beforeEach(() => {
  stateStore.resetForTests();
  stateStore.setProjectName("Export Test", "ai");
  applyStyleTokenSet(stateStore, "#06B6D4", "ai");
});

test("templates use the session project name instead of baked-in brands", () => {
  // Regression: every template shipped a hardcoded brand ("ShopMax",
  // "CloudFlow", "数据看板") and "© 2024", so applying one produced a page
  // branded as somebody else's product.
  for (const template of ["ecommerce_home", "saas_landing", "blog_post", "portfolio", "dashboard"]) {
    stateStore.resetForTests();
    stateStore.setProjectName("Kiln & Clay", "ai");
    applyPageTemplate(template);

    const json = JSON.stringify(stateStore.getState().components);
    for (const stale of ["ShopMax", "CloudFlow", "技术博客", "Design Studio", "数据看板", "© 2024"]) {
      assert.ok(!json.includes(stale), `${template} still contains the hardcoded default "${stale}"`);
    }
    assert.ok(json.includes("Kiln & Clay"), `${template} should brand with the project name`);
  }
});

test("template footer copyright uses the current year", () => {
  stateStore.resetForTests();
  stateStore.setProjectName("Acme", "ai");
  applyPageTemplate("portfolio");
  const json = JSON.stringify(stateStore.getState().components);
  assert.ok(json.includes(`© ${new Date().getFullYear()} Acme`), "copyright should be current and branded");
  assert.ok(!json.includes("© 2024"), "no stale year");
});

test("templates avoid remote image URLs so exports stay self-contained", () => {
  for (const template of ["saas_landing", "blog_post"]) {
    stateStore.resetForTests();
    stateStore.setProjectName("Acme", "ai");
    applyPageTemplate(template);
    const html = exportDesign("html");
    assert.ok(!/https?:\/\//.test(html.replace(/<style>[\s\S]*?<\/style>/, "")), `${template} must not reference remote assets`);
  }
});

test("an explicit dark theme reaches the exported HTML", () => {
  // Regression: design_set_theme("dark") was a no-op for exports — the exporter
  // only read state.tokens, so dark sessions exported as light pages.
  stateStore.addComponent("navbar", undefined, { brand: "Ops", links: ["a"] }, null, "ai");
  const htmlTag = (s: string): string => (s.match(/<html[^>]*>/) || [""])[0];
  const light = exportDesign("html");
  // Assert on the document element, not the whole file: a light export still
  // *defines* the [data-theme="dark"] rules for auto dark mode.
  assert.equal(htmlTag(light), '<html lang="zh">');

  stateStore.setThemeMode("dark", "ai");
  const dark = exportDesign("html");
  assert.equal(htmlTag(dark), '<html lang="zh" data-theme="dark">');
  assert.match(dark, /\[data-theme="dark"\]\s*\{[\s\S]*--color-bg:/);
  assert.match(dark, /color-scheme:\s*dark/);
  // The dark block must not be gated behind prefers-color-scheme for an
  // explicitly dark session.
  assert.doesNotMatch(dark, /@media \(prefers-color-scheme: dark\)/);
});

test("a light session still offers dark to readers who prefer it", () => {
  stateStore.addComponent("navbar", undefined, { brand: "Ops", links: ["a"] }, null, "ai");
  const html = exportDesign("html");
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /<html lang="zh" data-theme/);
});

test("layout-altering variants have real CSS, not just a class name", () => {
  // Regression: 109 of 118 variant classes had no rule at all, so e.g.
  // `.faq--accordion`, `.testimonial--grid` and `.pricing--3col` were inert.
  stateStore.addComponent("faq", "accordion", { items: [{ question: "q", answer: "a" }] }, null, "ai");
  stateStore.addComponent("testimonial", "grid", { items: [{ name: "n", quote: "q" }] }, null, "ai");
  stateStore.addComponent("pricing", "3col", { plans: [{ name: "a", price: "1" }] }, null, "ai");
  stateStore.addComponent("grid", "3col", { items: [{ title: "a" }] }, null, "ai");

  const html = exportDesign("html");
  const style = html.slice(html.indexOf("<style"), html.indexOf("</style>"));
  for (const cls of ["faq--accordion", "testimonial--grid", "pricing--3col", "grid--3col"]) {
    const re = new RegExp("\\." + cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^,{]*\\{");
    assert.match(style, re, `.${cls} is emitted but has no CSS rule`);
  }
});

test("a split hero without an image does not leave half the page empty", () => {
  stateStore.addComponent("hero", "split", { title: "T", subtitle: "S" }, null, "ai");
  const html = exportDesign("html");
  const style = html.slice(html.indexOf("<style"), html.indexOf("</style>"));
  assert.match(style, /\.hero--split > div:only-child/, "split hero needs a no-image fallback");
});
