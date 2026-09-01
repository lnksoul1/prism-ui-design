/**
 * M3 双向同步: 解析 @prism-edit 区域，提取文本/样式变更。
 * 语义: 导入时代码优先——@prism-ignore 区域跳过、未知 id 报告跳过、
 * 已知 id 的文本与 baseStyle 差异回写 stateStore。
 */
import { parse as babelParse } from "@babel/parser";
import * as recast from "recast";
import type { ComponentNode, PageDef } from "../state.js";

// recast 需要 token 流；不开 tokens 会回退到不支持 JSX 的 esprima 分词器。
const parser = {
  parse: (source: string) =>
    babelParse(source, { sourceType: "module", plugins: ["typescript", "jsx"], tokens: true }),
};

export interface EditRegion {
  id: string;
  ignored: boolean;
  jsx: string;
}

// 保护注释两种形态都要匹配: 裸 /* ... */（导出产物）与 JSX 注释 {/* ... */}（手写代码）。
const REGION_RE = /[ \t]*\{?\/\* @prism-edit id=([\w-]+)([^*]*)\*\/\}?\n([\s\S]*?)\n[ \t]*\{?\/\* @prism-edit-end \*\/\}?/g;

export function parseEditRegions(source: string): EditRegion[] {
  const out: EditRegion[] = [];
  for (const m of source.matchAll(REGION_RE)) {
    out.push({ id: m[1], ignored: m[2].includes("@prism-ignore"), jsx: m[3] });
  }
  return out;
}

export function extractNodeUpdate(jsx: string): { text?: string; style?: Record<string, string> } {
  const ast = recast.parse(`const __v = (\n${jsx}\n);`, { parser });
  let text = "";
  let style: Record<string, string> | undefined;
  walk(ast, (n: Record<string, unknown>) => {
    // 文本来自元素子节点: JSXText（`A`）或 {"字符串"} 表达式容器（导出产物的形态）。
    // 属性值里的字符串（data-prism-id/style 值）不算文本。
    if (n.type === "JSXElement") {
      for (const child of (n.children ?? []) as Array<Record<string, unknown> | null | undefined>) {
        if (!child || typeof child !== "object") continue;
        if (child.type === "JSXText") {
          text += String(child.value ?? "");
        } else if (child.type === "JSXExpressionContainer") {
          const expr = child.expression as Record<string, unknown> | undefined;
          if (expr?.type === "StringLiteral") text += String(expr.value ?? "");
        }
      }
    }
    if (n.type === "JSXAttribute" && (n.name as { name?: string } | undefined)?.name === "style") {
      const expr = (n.value as { expression?: { type: string; properties: unknown[] } } | undefined)?.expression;
      if (expr?.type === "ObjectExpression") {
        const obj: Record<string, string> = {};
        for (const prop of expr.properties as Array<Record<string, unknown>>) {
          if (prop.type !== "ObjectProperty") continue;
          const key = (prop.key as { type: string; name?: string; value?: unknown } | undefined);
          const keyName = key?.type === "Identifier" ? key.name ?? "" : String(key?.value ?? "");
          if (!keyName) continue;
          const v = prop.value as { type: string; value?: unknown } | undefined;
          if (v?.type === "StringLiteral" || v?.type === "NumericLiteral" || v?.type === "BooleanLiteral") {
            obj[keyName] = String(v.value);
          }
        }
        style = obj;
      }
    }
  });
  const trimmed = text.replace(/\s+/g, " ").trim();
  return { text: trimmed || undefined, style };
}

function walk(node: unknown, visit: (n: Record<string, unknown>) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit);
    return;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.type === "string") visit(record);
  for (const key of Object.keys(record)) {
    if (key === "loc" || key === "tokens" || key === "leadingComments" || key === "trailingComments" || key === "extra") continue;
    walk(record[key], visit);
  }
}

export interface CodeSyncChange {
  id: string;
  text?: string;
  style?: Record<string, string>;
  skipped?: "ignored" | "unknown";
}

export function computeCodeSyncChanges(page: PageDef, source: string): CodeSyncChange[] {
  const known = new Map<string, ComponentNode>();
  const collect = (nodes: ComponentNode[]): void => {
    for (const n of nodes) {
      known.set(n.id, n);
      collect(n.children ?? []);
    }
  };
  collect(page.components);

  const changes: CodeSyncChange[] = [];
  for (const region of parseEditRegions(source)) {
    if (region.ignored) {
      changes.push({ id: region.id, skipped: "ignored" });
      continue;
    }
    const node = known.get(region.id);
    if (!node) {
      changes.push({ id: region.id, skipped: "unknown" });
      continue;
    }
    const { text, style } = extractNodeUpdate(region.jsx);
    changes.push({ id: region.id, text, style });
  }
  return changes;
}
