/**
 * HTML import / write-back.
 *
 * Route B scope: this module turns a fetched or pasted HTML document into
 * faithful `html_fragment` regions (header / nav / main / footer / section-N /
 * content), each keeping the page's own CSS, and can write edited regions back
 * into the original document while preserving `<head>` and scripts.
 *
 * The former project-folder scanner (HTML/JSX/TSX/Vue file walking plus the
 * regex semantic parsers) was removed with the dashboard import wizard; the MCP
 * tool `design_import_webpage` only needs the fragment pipeline below.
 */

import { stateStore, type ComponentNode } from "./state.js";


export interface ExtractedComponent {
  type: string;
  variant?: string;
  props: Record<string, unknown>;
}

export interface ExtractedPage {
  name: string;
  filePath: string;
  components: ExtractedComponent[];
  /** Original file content for plain HTML pages (full-document writeback). */
  sourceHtml?: string;
}

/** 忠实显示的 HTML 片段（渲染层 Shadow DOM + 原 CSS 驱动）。 */
export interface HtmlFragmentSpec {
  region: string;
  html: string;
  css: string;
}

/**
 * Import a raw HTML string as `html_fragment` components on a fresh (or the
 * current) page, and return what was created so a tool can report it.
 *
 * `css` is optional extra stylesheet text (e.g. a fetched `<link>` target) that
 * is attached to every fragment so the original styling still drives the
 * rendered region.
 */
export function importHtmlString(
  html: string,
  sourceName: string,
  clearExisting: boolean,
  css = ""
): { pageId: string; pageName: string; imported: number; components: ComponentNode[] } {
  const inlineCss = extractInlineStyles(html);
  const bodyHtml = extractBodyHtml(html);
  const combinedCss = [inlineCss, css].filter(Boolean).join("\n");

  if (clearExisting) stateStore.clearAll("user");

  const pageName = sourceName || "Imported page";
  const page = stateStore.addPage(pageName, "user");
  const created: ComponentNode[] = [];
  for (const frag of extractHtmlFragments(bodyHtml, combinedCss)) {
    created.push(
      stateStore.addComponent(
        "html_fragment",
        undefined,
        { region: frag.region, html: frag.html, css: frag.css },
        page.id,
        "user"
      )
    );
  }
  stateStore.switchPage(page.id, "user");
  return { pageId: page.id, pageName: page.name, imported: created.length, components: created };
}

/**
 * 从原始 HTML（用户页面）提取语义区域片段：nav / header / main / footer /
 * section-N / 其余 content。每个片段携带页面自己的 CSS，渲染层按原样式驱动。
 *
 * Known limitation: regions are located with non-greedy tag regexes, so a
 * `<section>` nested inside another is captured only up to the first closing
 * tag. The original document is always preserved for write-back, so this
 * affects editing granularity rather than fidelity of the applied result.
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
  const header = grabFirst("header");
    if (header) push("header", header);
    const nav = grabFirst("nav");
  if (nav) push("nav", nav);
    /* 旧提取顺序已上移，避免嵌套在 header 内的 nav 被拆散
  const header = grabFirst("header");
  if (header) push("header", header);
    */
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

/**
 * 把画布上已编辑的 html_fragment 组件写回原始 HTML 文档（精确到原 body 内容）。
 * 对每个原始片段按 region 匹配：仍存在 → 替换为编辑后的 HTML；已删除 → 移除；
 * 新增片段 → 追加到 body 末尾。head / body 属性 / 脚本全部保留，因此原页面
 * 的 CSS、meta 与交互脚本不会在“一键应用”时丢失。
 */
export function applyHtmlFragmentsToDocument(
  originalHtml: string,
  components: ComponentNode[]
): string {
  const bodyHtml = extractBodyHtml(originalHtml);
  const originalFrags = extractHtmlFragments(bodyHtml, "");
  // 片段提取顺序（header 先于 nav 等）不一定等于原文顺序；按原文位置排序，
  // 否则基于 cursor 的顺序替换会跳过早于前一片段出现的区域。
  const orderedFrags = [...originalFrags].sort(
    (a, b) => bodyHtml.indexOf(a.html) - bodyHtml.indexOf(b.html)
  );
  const editedByRegion = new Map<string, string>();
  for (const comp of components) {
    if (comp.type !== "html_fragment") continue;
    const region = comp.props && typeof comp.props.region === "string" ? comp.props.region : null;
    const html = comp.props && typeof comp.props.html === "string" ? comp.props.html : "";
    if (region) editedByRegion.set(region, html);
  }

  const replaceFirst = (haystack: string, needle: string, replacement: string, fromIndex = 0) => {
    const idx = haystack.indexOf(needle, fromIndex);
    if (idx === -1 || needle.length === 0) return { changed: false, value: haystack, nextIndex: fromIndex };
    return {
      changed: true,
      value: haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length),
        nextIndex: idx + replacement.length,
    };
  };

  let body = bodyHtml;
    let cursor = 0;
  let changed = false;
  for (const frag of orderedFrags) {
    const edited = editedByRegion.get(frag.region);
    if (edited === undefined) {
      // 原始区域对应的组件已被用户删除 → 从产物中移除该区域。
      const result = replaceFirst(body, frag.html, "", cursor);
      body = result.value;
      changed = result.changed || changed;
        cursor = result.nextIndex;
      continue;
    }
    editedByRegion.delete(frag.region);
    const result = replaceFirst(body, frag.html, edited, cursor);
    body = result.value;
      cursor = result.nextIndex;
    if (edited !== frag.html) changed = result.changed || changed;
  }

  // 用户在画布上新增的片段：追加到 body 末尾。
  for (const html of editedByRegion.values()) {
    body += `\n${html}`;
    changed = true;
  }

  if (!changed) return originalHtml;

  const bodyRe = /<body\b[^>]*>([\s\S]*?)<\/body>/i;
  const m = bodyRe.exec(originalHtml);
  if (m) {
    return (
      originalHtml.slice(0, m.index + m[0].indexOf(m[1])) +
      body +
      originalHtml.slice(m.index + m[0].indexOf(m[1]) + m[1].length)
    );
  }
  const bodyOpen = /<body\b[^>]*>/i.exec(originalHtml);
  if (bodyOpen) {
    return originalHtml.slice(0, bodyOpen.index + bodyOpen[0].length) + body;
  }
  return body;
}

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
