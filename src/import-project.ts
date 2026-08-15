/**
 * Project Import Module
 *
 * Scans a project folder for HTML/JSX/TSX/Vue files,
 * parses each file to extract UI components, and returns
 * structured pages that can be loaded into the design canvas.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { stateStore } from "./state.js";

// ===== Types =====

export interface ExtractedComponent {
  type: string;
  variant?: string;
  props: Record<string, unknown>;
}

export interface ExtractedPage {
  name: string;
  filePath: string;
  components: ExtractedComponent[];
}

/** 忠实显示的 HTML 片段（渲染层 Shadow DOM + 原 CSS 驱动）。 */
export interface HtmlFragmentSpec {
  region: string;
  html: string;
  css: string;
}

export interface ImportResult {
  pages: ExtractedPage[];
  totalComponents: number;
  scannedFiles: number;
}

// ===== File Scanner =====

const SUPPORTED_EXTENSIONS = [".html", ".htm", ".jsx", ".tsx", ".vue"];

const IGNORE_DIRS = [
  "node_modules", ".git", "dist", "build", ".next", ".nuxt",
  "coverage", ".cache", ".trae-cn", "vendor", "__pycache__",
  "prism-ui-design-mcp", ".trae",
];

export function scanProject(folderPath: string): ImportResult {
  const files = findSupportedFiles(folderPath);
  const pages: ExtractedPage[] = [];

  for (const filePath of files) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      let page: ExtractedPage | null = null;

      if (ext === ".html" || ext === ".htm") {
        page = parseHtmlFragmentsFile(filePath);
      } else if (ext === ".jsx" || ext === ".tsx") {
        page = parseJSXFile(filePath);
      } else if (ext === ".vue") {
        page = parseVueFile(filePath);
      }

      if (page && page.components.length > 0) {
        pages.push(page);
      }
    } catch {
      // Skip files that can't be parsed
    }
  }

  const totalComponents = pages.reduce((sum, p) => sum + p.components.length, 0);

  return {
    pages,
    totalComponents,
    scannedFiles: files.length,
  };
}

/**
 * Import a raw HTML string into the state store as a new page. v2: 完整解析 —
 * 按语义区域拆成 html_fragment（忠实显示用户 UI，原 CSS 驱动）。
 * `css` 可选：路由层已内联抓取的 link 样式表内容。
 */
export function importHtmlString(
  html: string,
  sourceName: string,
  clearExisting: boolean,
  css = ""
): { pageName: string; pageId: string; imported: number } {
  const inlineCss = extractInlineStyles(html);
  const bodyHtml = extractBodyHtml(html);
  const components: ExtractedComponent[] = extractHtmlFragments(bodyHtml, css || inlineCss).map((f) => ({
    type: "html_fragment",
    props: { region: f.region, html: f.html, css: f.css },
  }));
  if (components.length === 0) {
    throw new Error(`No recognizable UI components found in "${sourceName}"`);
  }
  if (clearExisting) {
    stateStore.clearAll("ai");
  }
  const page = stateStore.addPage(sourceName, "ai");
  for (const comp of components) {
    stateStore.addComponent(comp.type, comp.variant, comp.props, null, "ai");
  }
  return { pageName: page.name, pageId: page.id, imported: components.length };
}

/** 将 HTML 文件解析为语义区域片段（v2：忠实显示用户页面）。 */
function parseHtmlFragmentsFile(filePath: string): ExtractedPage {
  const html = fs.readFileSync(filePath, "utf-8");
  const name = derivePageName(filePath);
  const bodyHtml = extractBodyHtml(html);
  const css = extractInlineStyles(html);
  const components: ExtractedComponent[] = extractHtmlFragments(bodyHtml, css).map((f) => ({
    type: "html_fragment",
    props: { region: f.region, html: f.html, css: f.css },
  }));
  return { name, filePath, components };
}

/**
 * Import the Prism client dashboard shell (client/index.html) as a new page in
 * the design canvas, so the service can be used to adjust the project's own UI.
 *
 * v2 (片段化): 按 `<!-- prism-region:xxx -->` 标记切分为 html_fragment 组件，
 * 渲染层用 Shadow DOM + 完整 style.css 驱动，画布所见即真实客户端。
 */
export function importClientUi(clearExisting = false): {
  pageName: string;
  pageId: string;
  imported: number;
  components: ExtractedComponent[];
} {
  // Works both from dist/ (server runtime) and .test-build/ (tests) via cwd.
  const htmlFile = resolveClientHtmlFile();
  const html = fs.readFileSync(htmlFile, "utf-8");
  const cssFile = path.join(path.dirname(htmlFile), "style.css");
  const css = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, "utf-8") : "";
  const components: ExtractedComponent[] = [];
  for (const [region, regionHtml] of Object.entries(splitClientRegions(html))) {
    if (!regionHtml.trim()) continue;
    components.push({
      type: "html_fragment",
      props: { region, html: regionHtml, css },
    });
  }
  if (clearExisting) {
    stateStore.clearAll("ai");
  }
  const page = stateStore.addPage("Prism 客户端 UI", "ai");
  for (const comp of components) {
    stateStore.addComponent(comp.type, comp.variant, comp.props, null, "ai");
  }
  return { pageName: page.name, pageId: page.id, imported: components.length, components };
}

/** Locate client/index.html (works from dist/ and repo root). */
export function resolveClientHtmlFile(): string {
  const candidates = [
    path.resolve(process.cwd(), "client", "index.html"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "client", "index.html"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Client UI file not found (client/index.html)`);
  }
  return found;
}

/** 按 `<!-- prism-region:name -->...<!-- /prism-region:name -->` 标记切分。 */
export function splitClientRegions(html: string): Record<string, string> {
  const regions: Record<string, string> = {};
  const re = /<!-- prism-region:([\w-]+) -->([\s\S]*?)<!-- \/prism-region:\1 -->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    regions[m[1]] = m[2];
  }
  return regions;
}

/** 把画布上的片段写回 client/index.html（按区域标记原位替换，带备份）。 */
export function applyClientUiWriteback(
  regions: Record<string, string>
): { success: boolean; files: Array<{ file: string; size: number }>; backup: string | null; message: string } {
  const htmlFile = resolveClientHtmlFile();
  const html = fs.readFileSync(htmlFile, "utf-8");
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let updated = html;
  let replaced = 0;
  for (const [region, fragHtml] of Object.entries(regions)) {
    const re = new RegExp(
      `(<!-- prism-region:${esc(region)} -->)[\\s\\S]*?(<!-- /prism-region:${esc(region)} -->)`
    );
    const m = re.exec(updated);
    if (!m) continue;
    if (m[2].trim() === String(fragHtml).trim()) continue; // 未改动，跳过
    updated = updated.replace(re, `$1\n${fragHtml}\n$2`);
    replaced++;
  }
  if (replaced === 0) {
    return { success: false, files: [], backup: null, message: "没有改动，无需写回" };
  }
  const backup = `${htmlFile}.bak-${Date.now()}`;
  fs.copyFileSync(htmlFile, backup);
  fs.writeFileSync(htmlFile, updated, "utf-8");
  return {
    success: true,
    files: [{ file: htmlFile, size: Buffer.byteLength(updated, "utf-8") }],
    backup,
    message: "已写回 client/index.html",
  };
}

/**
 * 从原始 HTML（用户页面）提取语义区域片段：nav / header / main / footer /
 * section-N / 其余 content。每个片段携带页面自己的 CSS，渲染层按原样式驱动。
 */
export function extractHtmlFragments(bodyHtml: string, css: string): HtmlFragmentSpec[] {
  const frags: HtmlFragmentSpec[] = [];
  let remainder = bodyHtml;
  const take = (frag: string) => {
    if (frag && frag.trim() && remainder.includes(frag)) {
      remainder = remainder.replace(frag, "");
      return true;
    }
    return false;
  };
  const grabFirst = (tag: string): string | null => {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "i");
    const m = re.exec(remainder);
    return m ? m[0] : null;
  };
  const push = (region: string, frag: string) => {
    if (take(frag)) frags.push({ region, html: frag, css });
  };
  const nav = grabFirst("nav");
  if (nav) push("nav", nav);
  const header = grabFirst("header");
  if (header) push("header", header);
  const main = grabFirst("main");
  if (main) push("main", main);
  const footer = grabFirst("footer");
  if (footer) push("footer", footer);
  const sectionRe = /<section\b[^>]*>[\s\S]*?<\/section>/gi;
  let sm: RegExpExecArray | null;
  let secIdx = 0;
  while ((sm = sectionRe.exec(remainder)) !== null) {
    secIdx += 1;
    push(`section-${secIdx}`, sm[0]);
  }
  const leftover = remainder.trim();
  if (leftover) frags.push({ region: "content", html: leftover, css });
  return frags;
}

/** 抓取 HTML 内嵌 <style> 内容（同步；link 样式表由路由异步抓取后合并传入）。 */
export function extractInlineStyles(html: string): string {
  const parts: string[] = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1].trim()) parts.push(m[1]);
  }
  return parts.join("\n");
}

/** 提取 body 内部 HTML。 */
export function extractBodyHtml(html: string): string {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (m) return m[1];
  const m2 = /<body[^>]*>([\s\S]*)$/i.exec(html);
  return m2 ? m2[1] : html;
}

function findSupportedFiles(rootDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.includes(entry.name) && !entry.name.startsWith(".")) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(rootDir);
  return results;
}

// ===== HTML Parser =====

function parseHTMLFile(filePath: string): ExtractedPage {
  const html = fs.readFileSync(filePath, "utf-8");
  const name = derivePageName(filePath);
  const components = parseHTML(html);
  return { name, filePath, components };
}

function parseHTML(html: string): ExtractedComponent[] {
  const components: ExtractedComponent[] = [];

  // Extract <nav> → navbar
  const navContent = extractTagContent(html, "nav");
  if (navContent) {
    components.push(parseNavbar(navContent));
  }

  // Extract <header> → hero (if it looks like a hero)
  const headerContent = extractTagContent(html, "header");
  if (headerContent) {
    const hero = parseHero(headerContent);
    if (hero) components.push(hero);
  }

  // If no <header>, look for hero-like sections
  if (!headerContent) {
    const heroSection = extractSectionByClass(html, "hero");
    if (heroSection) {
      const hero = parseHero(heroSection);
      if (hero) components.push(hero);
    }
  }

  // Extract <section> elements
  const sections = extractAllSections(html);
  for (const section of sections) {
    const comp = parseSection(section);
    if (comp) components.push(comp);
  }

  // Extract <footer>
  const footerContent = extractTagContent(html, "footer");
  if (footerContent) {
    components.push(parseFooter(footerContent));
  }

  // If nothing was found, try to extract from <body>
  if (components.length === 0) {
    const bodyContent = extractTagContent(html, "body");
    if (bodyContent) {
      const fallback = parseGenericSection(bodyContent);
      if (fallback) components.push(fallback);
    }
  }

  return components;
}

// ===== JSX/TSX Parser =====

function parseJSXFile(filePath: string): ExtractedPage {
  const code = fs.readFileSync(filePath, "utf-8");
  const name = derivePageName(filePath);
  const components = parseJSX(code);
  return { name, filePath, components };
}

function parseJSX(code: string): ExtractedComponent[] {
  const components: ExtractedComponent[] = [];

  // Match JSX component patterns like <Navbar ... />, <Hero ... />, etc.
  const componentPatterns: Record<string, string> = {
    Navbar: "navbar",
    Nav: "navbar",
    Header: "hero",
    Hero: "hero",
    Footer: "footer",
    CardGrid: "card_grid",
    Card: "card",
    CTA: "cta",
    CallToAction: "cta",
    Stats: "stats",
    FeatureList: "feature_list",
    Features: "feature_list",
    Pricing: "pricing",
    Testimonial: "testimonial",
    Testimonials: "testimonial",
    FAQ: "faq",
    Timeline: "timeline",
    Banner: "banner",
    Tabs: "tabs",
    Accordion: "accordion",
  };

  for (const [jsxName, prismType] of Object.entries(componentPatterns)) {
    const regex = new RegExp(`<${jsxName}\\b([^>]*?)(?:\\/>|>(?:[\\s\\S]*?)<\\/${jsxName}>)`, "g");
    let match;
    while ((match = regex.exec(code)) !== null) {
      const attrs = match[1] || "";
      const props = extractJSXProps(attrs);
      components.push({ type: prismType, props });
    }
  }

  return components;
}

function extractJSXProps(attrs: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  // Match prop="value" or prop={'value'} or prop={value}
  const propRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
  let match;
  while ((match = propRegex.exec(attrs)) !== null) {
    const key = match[1];
    const value = match[2] || match[3] || match[4] || "";
    props[key] = value;
  }

  return props;
}

// ===== Vue Parser =====

function parseVueFile(filePath: string): ExtractedPage {
  const code = fs.readFileSync(filePath, "utf-8");
  const name = derivePageName(filePath);

  // Extract <template> section
  const templateMatch = code.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  const template = templateMatch ? templateMatch[1] : code;

  const components = parseHTML(template);
  return { name, filePath, components };
}

// ===== HTML Parsing Helpers =====

function extractTagContent(html: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = html.match(regex);
  return match ? match[1] : null;
}

function extractAllSections(html: string): string[] {
  const sections: string[] = [];
  const regex = /<section\b[^>]*>([\s\S]*?)<\/section>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    sections.push(match[0]);
  }
  return sections;
}

function extractSectionByClass(html: string, className: string): string | null {
  const regex = new RegExp(
    `<(?:section|div|header)\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:section|div|header)>`,
    "i"
  );
  const match = html.match(regex);
  return match ? match[0] : null;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirstTag(html: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = html.match(regex);
  return match ? stripTags(match[1]) : null;
}

function extractAllTags(html: string, tag: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push(stripTags(match[1]));
  }
  return results;
}

function extractLinks(html: string): string[] {
  const links: string[] = [];
  const regex = /<a\b[^>]*>([\\s\\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = stripTags(match[1]);
    if (text) links.push(text);
  }
  return links;
}

function extractButtons(html: string): string[] {
  const buttons: string[] = [];
  // Match <button> and <a class="btn...">
  const btnRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  let match;
  while ((match = btnRegex.exec(html)) !== null) {
    const text = stripTags(match[1]);
    if (text) buttons.push(text);
  }
  const aBtnRegex = /<a\b[^>]*class="[^"]*\bbtn\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = aBtnRegex.exec(html)) !== null) {
    const text = stripTags(match[1]);
    if (text) buttons.push(text);
  }
  return buttons;
}

function extractAttr(tag: string, attr: string): string | null {
  const regex = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i");
  const match = tag.match(regex);
  return match ? match[1] : null;
}

function hasClass(html: string, className: string): boolean {
  return new RegExp(`class="[^"]*\\b${className}\\b[^"]*"`).test(html);
}

// ===== Component Parsers =====

function parseNavbar(html: string): ExtractedComponent {
  const links = extractLinks(html);
  const buttons = extractButtons(html);

  // Brand: first link or element with "brand"/"logo" class
  let brand = "";
  const brandMatch = html.match(/class="[^"]*\b(?:brand|logo)\b[^"]*"[^>]*>([\s\S]*?)<\//i);
  if (brandMatch) {
    brand = stripTags(brandMatch[1]);
  } else if (links.length > 0) {
    brand = links[0];
    links.shift();
  }

  const variant = buttons.length > 0 ? "with_cta" : "simple";
  const props: Record<string, unknown> = {
    brand: brand || "Logo",
    links: links.slice(0, 8),
  };
  if (buttons.length > 0) {
    props.cta_text = buttons[0];
  }

  return { type: "navbar", variant, props };
}

function parseHero(html: string): ExtractedComponent | null {
  const title = extractFirstTag(html, "h1") || extractFirstTag(html, "h2");
  const subtitle = extractFirstTag(html, "p");
  const buttons = extractButtons(html);

  if (!title && !subtitle) return null;

  const props: Record<string, unknown> = {};
  if (title) props.title = title;
  if (subtitle) props.subtitle = subtitle;
  if (buttons.length > 0) props.button_text = buttons[0];

  // Detect variant
  let variant = "centered";
  if (hasClass(html, "split") || hasClass(html, "two-col") || hasClass(html, "two-col")) {
    variant = "split";
  } else if (hasClass(html, "fullbleed") || hasClass(html, "full-bleed")) {
    variant = "fullbleed";
  }

  // Check for image
  const imgMatch = html.match(/<img\b[^>]*src="([^"]*)"[^>]*>/i);
  if (imgMatch) {
    props.image_url = imgMatch[1];
  }

  return { type: "hero", variant, props };
}

function parseSection(sectionHtml: string): ExtractedComponent | null {
  const className = extractAttr(sectionHtml, "class") || "";

  // Detect section type by class name
  if (/\b(feature|features)\b/i.test(className)) {
    return parseFeatureList(sectionHtml);
  }
  if (/\b(pricing|plans)\b/i.test(className)) {
    return parsePricing(sectionHtml);
  }
  if (/\b(stats|statistics|metrics)\b/i.test(className)) {
    return parseStats(sectionHtml);
  }
  if (/\b(testimonial|testimonials|reviews)\b/i.test(className)) {
    return parseTestimonial(sectionHtml);
  }
  if (/\b(cta|call-to-action|calltoaction)\b/i.test(className)) {
    return parseCTA(sectionHtml);
  }
  if (/\b(faq|questions)\b/i.test(className)) {
    return parseFAQ(sectionHtml);
  }
  if (/\b(timeline)\b/i.test(className)) {
    return parseTimeline(sectionHtml);
  }
  if (/\b(banner|promo|announcement)\b/i.test(className)) {
    return parseBanner(sectionHtml);
  }

  // Auto-detect by content
  const h2 = extractFirstTag(sectionHtml, "h2");
  const h3s = extractAllTags(sectionHtml, "h3");
  const links = extractLinks(sectionHtml);

  // If has multiple h3s, likely a feature list or card grid
  if (h3s.length >= 2) {
    // Check if it looks like pricing (has price-like text)
    const text = stripTags(sectionHtml);
    if (/\$|¥|€|£|price|\/mo|\/month|per month/i.test(text)) {
      return parsePricing(sectionHtml);
    }
    return parseFeatureList(sectionHtml);
  }

  // If has stats-like numbers
  const text = stripTags(sectionHtml);
  if (/\b\d+[KMBkmb]?\+?\b.*\b\d+[KMBkmb]?\+?\b/.test(text) && h3s.length === 0) {
    return parseStats(sectionHtml);
  }

  // If has CTA-like button
  const buttons = extractButtons(sectionHtml);
  if (buttons.length > 0 && h2 && !h3s.length) {
    return parseCTA(sectionHtml);
  }

  // Default: text section
  if (h2) {
    const body = extractFirstTag(sectionHtml, "p");
    return {
      type: "text_section",
      props: {
        title: h2,
        ...(body ? { body } : {}),
      },
    };
  }

  return null;
}

function parseFeatureList(html: string): ExtractedComponent {
  const title = extractFirstTag(html, "h2");
  const h3s = extractAllTags(html, "h3");
  const ps = extractAllTags(html, "p");

  const items = h3s.map((h3, i) => ({
    title: h3,
    description: ps[i] || "",
  }));

  return {
    type: "feature_list",
    props: {
      ...(title ? { title } : {}),
      items,
    },
  };
}

function parsePricing(html: string): ExtractedComponent {
  const title = extractFirstTag(html, "h2");

  // Find pricing cards/plans
  const cardRegex = /<(?:div|article)\b[^>]*class="[^"]*\b(?:card|plan|price|pricing)\b[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi;
  const plans: Record<string, unknown>[] = [];
  let match;

  // Alternative: look for h3 + price pattern
  const h3s = extractAllTags(html, "h3");
  const priceRegex = /(\$|¥|€|£)\s*(\d+(?:\.\d+)?(?:\/(?:mo|month|year))?)|(\d+(?:\.\d+)?(?:\/(?:mo|month|year))?)/gi;

  // Extract all text that looks like a price
  const allText = stripTags(html);
  const prices = allText.match(/(?:\$|¥|€|£)\s*\d+(?:\.\d+)?(?:\/(?:mo|month|year))?|\d+(?:\.\d+)?(?:\/(?:mo|month|year))/gi) || [];

  // Try to find feature lists (ul/li)
  const ulContent = extractAllTags(html, "ul");
  const featureLists = ulContent.map(ul => {
    return extractAllTags(`<ul>${ul}</ul>`, "li");
  });

  for (let i = 0; i < h3s.length; i++) {
    plans.push({
      name: h3s[i],
      price: prices[i] || "",
      features: featureLists[i] || [],
    });
  }

  // Fallback: if no plans found, create from raw content
  if (plans.length === 0 && h3s.length === 0) {
    return parseGenericSection(html) || { type: "pricing", props: {} };
  }

  return {
    type: "pricing",
    props: {
      ...(title ? { title } : {}),
      plans,
    },
  };
}

function parseStats(html: string): ExtractedComponent {
  const title = extractFirstTag(html, "h2");

  // Look for stat items (elements with number + label)
  const statRegex = /<(?:div|span|dt)\b[^>]*>([\s\S]*?)<\/(?:div|span|dt)>/gi;
  const items: Record<string, unknown>[] = [];
  let match;

  const allText = stripTags(html);
  // Find number patterns
  const numbers = allText.match(/\b\d+(?:\.\d+)?[KMBkmb%]*\+?\b/g) || [];

  // Try to find label patterns (text after numbers)
  const h3s = extractAllTags(html, "h3");
  const h4s = extractAllTags(html, "h4");
  const labels = [...h3s, ...h4s];

  // Also look for spans with class "stat" or "metric"
  const statSpans = html.match(/<span\b[^>]*class="[^"]*\b(?:stat-value|metric-value|number)\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi);
  const statLabels = html.match(/<span\b[^>]*class="[^"]*\b(?:stat-label|metric-label|label)\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi);

  if (statSpans && statLabels) {
    for (let i = 0; i < statSpans.length; i++) {
      items.push({
        value: stripTags(statSpans[i]),
        label: stripTags(statLabels[i]),
      });
    }
  } else {
    // Fallback: pair numbers with labels
    for (let i = 0; i < numbers.length; i++) {
      items.push({
        value: numbers[i],
        label: labels[i] || "",
      });
    }
  }

  return {
    type: "stats",
    props: {
      ...(title ? { title } : {}),
      items,
    },
  };
}

function parseTestimonial(html: string): ExtractedComponent {
  // Extract blockquotes
  const quotes = extractAllTags(html, "blockquote");
  const items: Record<string, unknown>[] = [];

  if (quotes.length > 0) {
    const cites = extractAllTags(html, "cite");
    for (let i = 0; i < quotes.length; i++) {
      items.push({
        quote: quotes[i],
        author: cites[i] || "",
      });
    }
  } else {
    // Fallback: look for divs with testimonial class
    const divRegex = /<(?:div|article)\b[^>]*class="[^"]*\b(?:testimonial|review)\b[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi;
    let match;
    while ((match = divRegex.exec(html)) !== null) {
      const content = match[1];
      const quote = extractFirstTag(content, "p") || extractFirstTag(content, "blockquote") || "";
      const author = extractFirstTag(content, "cite") || extractFirstTag(content, "h4") || "";
      items.push({ quote, author });
    }
  }

  return {
    type: "testimonial",
    props: { items },
  };
}

function parseCTA(html: string): ExtractedComponent {
  const title = extractFirstTag(html, "h2") || extractFirstTag(html, "h1");
  const subtitle = extractFirstTag(html, "p");
  const buttons = extractButtons(html);

  let variant = "centered";
  if (hasClass(html, "split") || hasClass(html, "two-col")) {
    variant = "split";
  } else if (hasClass(html, "banner")) {
    variant = "banner";
  }

  return {
    type: "cta",
    variant,
    props: {
      ...(title ? { title } : {}),
      ...(subtitle ? { subtitle } : {}),
      ...(buttons.length > 0 ? { button_text: buttons[0] } : {}),
    },
  };
}

function parseFAQ(html: string): ExtractedComponent {
  const h3s = extractAllTags(html, "h3");
  const ps = extractAllTags(html, "p");

  // Also try details/summary
  const summaries = extractAllTags(html, "summary");

  const items: Record<string, unknown>[] = [];
  if (summaries.length > 0) {
    const detailsContent = extractAllTags(html, "details");
    for (let i = 0; i < summaries.length; i++) {
      items.push({
        question: summaries[i],
        answer: stripTags(detailsContent[i] || "").replace(summaries[i], "").trim(),
      });
    }
  } else {
    for (let i = 0; i < h3s.length; i++) {
      items.push({
        question: h3s[i],
        answer: ps[i] || "",
      });
    }
  }

  return { type: "faq", props: { items } };
}

function parseTimeline(html: string): ExtractedComponent {
  const items: Record<string, unknown>[] = [];
  const h3s = extractAllTags(html, "h3");
  const ps = extractAllTags(html, "p");

  // Look for date-like patterns
  const dates = html.match(/<span\b[^>]*class="[^"]*\b(?:date|time)\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi) || [];

  for (let i = 0; i < h3s.length; i++) {
    items.push({
      date: stripTags(dates[i] || ""),
      title: h3s[i],
      description: ps[i] || "",
    });
  }

  return { type: "timeline", props: { items } };
}

function parseBanner(html: string): ExtractedComponent {
  const title = extractFirstTag(html, "h2") || extractFirstTag(html, "h1");
  const subtitle = extractFirstTag(html, "p");

  return {
    type: "banner",
    props: {
      ...(title ? { title } : {}),
      ...(subtitle ? { subtitle } : {}),
    },
  };
}

function parseFooter(html: string): ExtractedComponent {
  const links = extractLinks(html);
  const text = stripTags(html);

  // Extract copyright
  const copyrightMatch = text.match(/(©|&copy;|Copyright\b[\s\S]*?\d{4}[\s\S]*?\.)/i);
  const copyright = copyrightMatch ? copyrightMatch[0] : (text.split("\n")[0] || "");

  return {
    type: "footer",
    props: {
      copyright: copyright || "© 2024 All rights reserved.",
      links: links.slice(0, 10),
    },
  };
}

function parseGenericSection(html: string): ExtractedComponent | null {
  const title = extractFirstTag(html, "h1") || extractFirstTag(html, "h2");
  const body = extractFirstTag(html, "p");
  const buttons = extractButtons(html);
  const links = extractLinks(html);

  if (!title && !body && buttons.length === 0 && links.length === 0) {
    return null;
  }

  // If has buttons and title, treat as CTA
  if (title && buttons.length > 0) {
    return {
      type: "cta",
      variant: "centered",
      props: {
        title,
        ...(body ? { subtitle: body } : {}),
        button_text: buttons[0],
      },
    };
  }

  // If has title, treat as text section
  if (title) {
    return {
      type: "text_section",
      props: {
        title,
        ...(body ? { body } : {}),
      },
    };
  }

  return null;
}

// ===== Utility =====

function derivePageName(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath));
  // Convert kebab-case/snake_case to Title Case
  return basename
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
