/**
 * Project Import Module
 *
 * Scans a project folder for HTML/JSX/TSX/Vue files,
 * parses each file to extract UI components, and returns
 * structured pages that can be loaded into the design canvas.
 */

import fs from "fs";
import path from "path";
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
        page = parseHTMLFile(filePath);
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
 * Import a raw HTML string into the state store as a new page, reusing the
 * same extraction pipeline as `scanProject`. Used by `design_import_webpage`
 * (URL fetch or pasted HTML).
 */
export function importHtmlString(
  html: string,
  sourceName: string,
  clearExisting: boolean
): { pageName: string; pageId: string; imported: number } {
  const components = parseHTML(html);
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
