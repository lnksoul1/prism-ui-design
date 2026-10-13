/**
 * One-off showcase (not part of the build).
 *
 * Builds three real pages through the MCP server over stdio, writes each exported
 * HTML into examples/, then screenshots them with the locally cached Chromium.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("examples");
fs.mkdirSync(OUT, { recursive: true });

// ---------- minimal MCP client ----------
const child = spawn(process.execPath, [path.resolve("dist/index.js")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    PRISM_AUTOSAVE: "off",
    PRISM_AUTOLOAD: "off",
    PRISM_PROJECT_DIR: path.resolve(".tmp-showcase"),
  },
});
let buf = "";
const pending = new Map();
child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line.startsWith("{")) continue;
    try {
      const m = JSON.parse(line);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    } catch {
      // Not a JSON-RPC frame (e.g. a stray log line) — ignore it.
    }
  }
});
child.stderr.on("data", () => {});
let id = 1;
const rpc = (method, params) => new Promise((res) => {
  const myId = id++;
  pending.set(myId, res);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
});
const call = (name, args = {}) => rpc("tools/call", { name, arguments: args });
const ok = (r) => !r?.result?.isError;

await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "showcase", version: "1" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

// ---------- page 1: SaaS landing, built section by section ----------
const PAGES = [];

{
  await call("design_init", { project_name: "Nimbus Analytics", base_color: "#4F46E5" });
  await call("design_semantic_style", { description: "专业、克制的 B2B 数据产品", adjectives: ["专业", "现代"] });

  await call("design_add_component", {
    type: "navbar", variant: "with_cta",
    props: { brand: "Nimbus", links: ["产品", "定价", "文档", "客户案例"], cta_text: "免费试用" },
  });
  await call("design_add_component", {
    type: "hero", variant: "split",
    props: {
      title: "把产品数据变成每天早上的一份简报",
      subtitle: "连接数据仓库，5 分钟得到留存、漏斗与收入的可视化看板。无需数据团队。",
      cta_text: "开始免费试用", cta_secondary_text: "看 3 分钟演示",
    },
  });
  await call("design_add_component", {
    type: "feature_list", variant: "icon_grid",
    props: {
      title: "为什么团队选 Nimbus",
      items: [
        { title: "零配置接入", description: "支持 BigQuery、Snowflake、Postgres，连接后自动识别表结构。" },
        { title: "指标口径统一", description: "在界面里定义一次指标，全公司看到同一个数字。" },
        { title: "异常自动告警", description: "留存或转化跌破阈值时，主动推送到 Slack。" },
      ],
    },
  });
  await call("design_add_component", {
    type: "stats", variant: "3col",
    props: {
      title: "被 1,200+ 团队使用",
      items: [
        { label: "日活团队", value: "1,240" },
        { label: "平均接入时间", value: "11 分钟" },
        { label: "周活跃看板", value: "38,000" },
      ],
    },
  });
  await call("design_add_component", {
    type: "pricing", variant: "3col",
    props: {
      title: "简单透明的价格",
      plans: [
        { name: "Starter", price: "¥0", features: ["1 个数据源", "3 个看板", "社区支持"] },
        { name: "Team", price: "¥299", features: ["无限数据源", "无限看板", "异常告警", "Slack 集成"] },
        { name: "Enterprise", price: "定制", features: ["SSO / SCIM", "私有部署", "专属支持"] },
      ],
    },
  });
  await call("design_add_component", {
    type: "faq", variant: "accordion",
    props: {
      title: "常见问题",
      items: [
        { question: "需要写 SQL 吗？", answer: "不需要。常用指标已内置，进阶分析可选写 SQL。" },
        { question: "数据存在哪里？", answer: "数据始终留在你的仓库，Nimbus 只保存查询定义与缓存结果。" },
      ],
    },
  });
  await call("design_add_component", {
    type: "cta", variant: "banner",
    props: { title: "今天就把第一份简报发给团队", subtitle: "14 天免费，无需信用卡", button_text: "免费开始" },
  });
  await call("design_add_component", {
    type: "footer", variant: "multi_column",
    props: { copyright: "© 2026 Nimbus Analytics", links: ["关于", "隐私", "条款", "状态"] },
  });

  const audit = await call("design_audit_accessibility", { level: "AA" });
  const review = await call("design_suggest_improvements", {});
  const exp = await call("design_export", { format: "html" });
  const html = exp?.result?.structuredContent?.code ?? "";
  fs.writeFileSync(path.join(OUT, "saas-landing.html"), html, "utf8");
  PAGES.push({
    file: "saas-landing.html",
    label: "SaaS 落地页（逐段搭建）",
    bytes: html.length,
    audit: (audit?.result?.content?.[0]?.text ?? "").split("\n").slice(0, 3).join(" / "),
    review: (review?.result?.content?.[0]?.text ?? "").split("\n")[1] ?? "",
    ok: ok(exp),
  });
}

// ---------- page 2: template-based e-commerce home ----------
{
  await call("design_init", { project_name: "Kiln & Clay", base_color: "#B45309" });
  await call("design_semantic_style", { description: "手作陶器店铺，温暖、有质感", adjectives: ["温暖", "优雅"] });
  await call("design_apply_template", { template: "ecommerce_home" });
  // Give the template's product grid real content (the template ships placeholders).
  const state = await call("design_get_state", {});
  const gridId = (state?.result?.structuredContent?.components ?? []).find((c) => c.type === "card_grid")?.id;
  if (gridId) {
    await call("design_update_component", {
      id: gridId,
      props: {
        title: "本季精选",
        items: [
          { title: "粗陶马克杯", description: "手拉坯 · 哑光釉", price: "¥168" },
          { title: "柴烧茶壶", description: "松木窑变 · 独一无二", price: "¥680" },
          { title: "白瓷餐盘", description: "高温白釉 · 可入洗碗机", price: "¥228" },
        ],
      },
    });
  }
  await call("design_add_component", {
    type: "testimonial", variant: "grid",
    props: {
      title: "买家的评价",
      items: [
        { name: "林小满", role: "会员 2 年", quote: "杯口打磨得很细，每天用都很踏实。" },
        { name: "周叙", role: "首次购买", quote: "颜色比图片更耐看，包装也没磕碰。" },
      ],
    },
  });

  const audit = await call("design_audit_accessibility", { level: "AA" });
  const exp = await call("design_export", { format: "html" });
  const html = exp?.result?.structuredContent?.code ?? "";
  fs.writeFileSync(path.join(OUT, "ecommerce-home.html"), html, "utf8");
  PAGES.push({
    file: "ecommerce-home.html",
    label: "电商首页（模板 + 真实商品数据）",
    bytes: html.length,
    audit: (audit?.result?.content?.[0]?.text ?? "").split("\n").slice(0, 3).join(" / "),
    ok: ok(exp),
  });
}

// ---------- page 3: dark dashboard (exercises themeMode in the export) ----------
{
  await call("design_init", { project_name: "Ops Console", base_color: "#06B6D4" });
  await call("design_set_theme", { mode: "dark" });
  await call("design_apply_template", { template: "dashboard" });
  const state = await call("design_get_state", {});
  const gridId = (state?.result?.structuredContent?.components ?? []).find((c) => c.type === "card_grid")?.id;
  if (gridId) {
    await call("design_update_component", {
      id: gridId,
      props: {
        title: "关键指标",
        items: [
          { title: "销售趋势", description: "近 30 天走势" },
          { title: "用户分析", description: "行为深度分析" },
          { title: "热销商品", description: "TOP 10 排行" },
        ],
      },
    });
  }
  await call("design_add_component", {
    type: "table", variant: "striped",
    props: {
      title: "最近部署",
      columns: ["服务", "环境", "状态", "耗时"],
      rows: [
        ["api-gateway", "prod", "成功", "1m 12s"],
        ["billing-worker", "prod", "成功", "48s"],
        ["web", "staging", "失败", "22s"],
      ],
    },
  });
  await call("design_add_component", {
    type: "testimonial", variant: "grid",
    props: {
      title: "值班反馈",
      items: [
        { name: "王工", role: "SRE", quote: "告警比监控面板先到，省了不少排查时间。" },
        { name: "李工", role: "后端", quote: "部署记录一眼能看清，回滚路径也明确。" },
      ],
    },
  });
  const exp = await call("design_export", { format: "html" });
  const html = exp?.result?.structuredContent?.code ?? "";
  fs.writeFileSync(path.join(OUT, "dark-dashboard.html"), html, "utf8");
  PAGES.push({ file: "dark-dashboard.html", label: "暗色数据看板（暗色主题 + 数据表 + 评价网格）", bytes: html.length, ok: ok(exp) });
}

child.kill();

// ---------- screenshot each page ----------
// The workspace has a Chromium build cached from an earlier Playwright version
// (build 1234) while the installed package expects 1248, so point at the cached
// binary explicitly rather than downloading a browser.
const { chromium } = await import("playwright");
const cachedChromium = path.join(
  process.env.USERPROFILE ?? process.env.HOME ?? "",
  "AppData",
  "Local",
  "ms-playwright",
  "chromium-1234",
  "chrome-win64",
  "chrome.exe"
);
const launchOpts = fs.existsSync(cachedChromium) ? { executablePath: cachedChromium } : {};
console.log("chromium:", fs.existsSync(cachedChromium) ? cachedChromium : "(using bundled)");
const browser = await chromium.launch(launchOpts);
for (const p of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(OUT, p.file), { waitUntil: "load" });
  const shot = p.file.replace(/\.html$/, ".png");
  await page.screenshot({ path: path.join(OUT, shot), fullPage: true });
  p.shot = shot;
  // Runs inside the browser page, so `document` is intentionally available there.
  const height = await page.evaluate(() => document.body.scrollHeight);
  p.height = height;
  await page.close();
}
await browser.close();

console.log(JSON.stringify(PAGES, null, 2));
