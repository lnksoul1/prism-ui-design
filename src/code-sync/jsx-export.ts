/**
 * M3 双向同步: 组件树 → 带 @prism-edit 保护注释的 JSX。
 * 语义: 导出时设计优先（@prism-ignore 区域原样保留、其余区域按设计器最新状态重写、
 * 设计器新增组件追加到页面容器末尾、已删除组件的区域整段移除）。
 */
import type { ComponentNode, PageDef } from "../state.js";

const TEXT_KEYS = ["text", "title", "label", "button_text", "cta_text", "heading", "brand"];

function pickText(props: Record<string, unknown>): string {
  for (const key of TEXT_KEYS) {
    const v = props?.[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

function tagFor(type: string): string {
  if (type === "button") return "button";
  if (type === "text" || type === "heading") return "span";
  if (type === "image") return "img";
  return "div";
}

function styleLiteral(style: Record<string, string> | undefined): string {
  if (!style || Object.keys(style).length === 0) return "";
  const entries = Object.entries(style).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return ` style={{ ${entries.join(", ")} }}`;
}

export function renderComponentJsx(node: ComponentNode, indent: string): string {
  const tag = tagFor(node.type);
  const text = pickText(node.props ?? {});
  const attrs = ` data-prism-id="${node.id}"${styleLiteral(node.baseStyle)}`;
  const lines: string[] = [`${indent}<${tag}${attrs}>`];
  if (text) lines.push(`${indent}  {${JSON.stringify(text)}}`);
  for (const child of node.children ?? []) lines.push(renderComponentJsx(child, `${indent}  `));
  lines.push(`${indent}</${tag}>`);
  return lines.join("\n");
}

export function renderEditRegion(node: ComponentNode, indent = "      "): string {
  return [
    `${indent}/* @prism-edit id=${node.id} type=${node.type} */`,
    renderComponentJsx(node, indent),
    `${indent}/* @prism-edit-end */`,
  ].join("\n");
}

function pascal(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""));
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function exportPageToJsx(page: PageDef): string {
  const regions = page.components.map((c) => renderEditRegion(c)).join("\n");
  return `import React from "react";

// @prism-page id=${page.id} name=${page.name}
export default function Page${pascal(page.id)}() {
  return (
    <div className="prism-page" data-prism-page="${page.id}">
${regions}
    </div>
  );
}
`;
}

// JSX 文件中保护注释通常写作 {/* ... */}；导出产物为裸 /* ... */。两种形态都要能匹配。
const REGION_RE = /([ \t]*)\{?\/\* @prism-edit id=([\w-]+)[^*]*\*\/\}?\n([\s\S]*?)\n[ \t]*\{?\/\* @prism-edit-end \*\/\}?/g;
const TAIL_RE = /\n([ \t]*)<\/div>\n {2}\);\n\}\n?$/;

/** 合并导出: 保护注释区域外的代码（import/手写组件/布局）原样保留。 */
export function mergePageExport(page: PageDef, existing: string | null): string {
  if (!existing) return exportPageToJsx(page);

  let out = existing.replace(REGION_RE, (full, indent: string, id: string) => {
    if (full.includes("@prism-ignore")) return full; // 代码优先
    const node = page.components.find((c) => c.id === id);
    if (!node) return ""; // 组件已删除 → 区域移除
    return [
      `${indent}/* @prism-edit id=${id} type=${node.type} */`,
      renderComponentJsx(node, indent),
      `${indent}/* @prism-edit-end */`,
    ].join("\n");
  });

  // 设计器新增（文件中没有区域）的组件追加到页面容器末尾
  const known = new Set<string>();
  for (const m of existing.matchAll(/@prism-edit id=([\w-]+)/g)) known.add(m[1]);
  const added = page.components.filter((c) => !known.has(c.id)).map((c) => renderEditRegion(c)).join("\n");
  if (added) {
    if (TAIL_RE.test(out)) {
      out = out.replace(TAIL_RE, (_m, indent: string) => `\n${added}\n${indent}</div>\n  );\n}\n`);
    } else {
      return exportPageToJsx(page); // 文件结构被大改，回退全量重生成
    }
  }
  return out;
}
