/**
 * Design-review productivity tools:
 *   - design_suggest_improvements  (roadmap v3.0 / C6 subset — heuristic review)
 *   - design_create_brand_style    (spec Phase 3 subset — brand color learning)
 *   - design_reflow                (B6 subset — canonical page section order)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateStore } from "../state.js";
import { applyStyleTokenSet } from "../tokens.js";
import { radiusSetFor } from "../style-guides.js";
import { auditDesign } from "./design-audit.js";
import { hexToHsl, hslToHex, isValidHex, normalizeHex, adjustLightness } from "../utils/color.js";

// ===== design_suggest_improvements =====

const CANONICAL_ORDER = [
  "navbar",
  "hero",
  "feature_list",
  "feature_grid",
  "grid",
  "card_grid",
  "bento_grid",
  "stats",
  "pricing",
  "testimonial",
  "timeline",
  "faq",
  "cta",
  "form",
  "cookie_banner",
  "footer",
];

export interface Suggestion {
  severity: "critical" | "warning" | "advisory";
  title: string;
  detail: string;
  tool_hint: string;
}

export function suggestImprovements(): { score: number; suggestions: Suggestion[] } {
  const state = stateStore.getState();
  const suggestions: Suggestion[] = [];
  const types = new Set(state.components.map((c) => c.type));

  // Structure completeness
  if (!types.has("navbar")) {
    suggestions.push({
      severity: "warning",
      title: "缺少导航栏",
      detail: "页面顶部没有 navbar，用户缺少导航入口。",
      tool_hint: 'design_add_component(type="navbar", variant="simple", props={brand:"Logo", links:["首页","功能","关于"]})',
    });
  }
  if (!types.has("hero")) {
    suggestions.push({
      severity: "warning",
      title: "缺少首屏 Hero",
      detail: "没有 hero 区域，首屏缺乏价值主张。",
      tool_hint: 'design_add_component(type="hero", variant="centered", props={title:"主标题", subtitle:"副标题", button_text:"立即开始"})',
    });
  }
  if (!types.has("footer")) {
    suggestions.push({
      severity: "advisory",
      title: "缺少页脚",
      detail: "建议补充 footer 以完善页面结构。",
      tool_hint: 'design_add_component(type="footer", props={copyright:"© 2026", links:["隐私","条款"]})',
    });
  }

  // Density
  if (state.components.length < 3) {
    suggestions.push({
      severity: "advisory",
      title: "页面内容过少",
      detail: `当前仅 ${state.components.length} 个组件，可考虑添加内容区块。`,
      tool_hint: 'design_apply_template(template="saas_landing")',
    });
  }

  // Motion
  const animated = state.components.filter((c) => c.animation && (c.animation.entry || c.animation.hover));
  if (state.components.length > 0 && animated.length === 0) {
    suggestions.push({
      severity: "advisory",
      title: "缺少动效",
      detail: "组件没有入场/悬停动画，可提升交互质感。",
      tool_hint: 'design_set_animation(component_id="<hero id>", entry="fadeUp", duration=0.5, curve="ease-out")',
    });
  }

  // Accessibility (from the audit engine)
  const audit = auditDesign("AA");
  const criticalAudit = audit.findings.filter((f) => f.severity === "critical");
  if (criticalAudit.length > 0) {
    suggestions.push({
      severity: "critical",
      title: "存在无障碍关键问题",
      detail: criticalAudit.map((f) => `[${f.rule}] ${f.message}`).join("；"),
      tool_hint: "design_audit_accessibility(level='AA')",
    });
  }

  // Tokens
  const tokenCount = Object.values(state.tokens).reduce((sum, cat) => sum + Object.keys(cat).length, 0);
  if (tokenCount === 0) {
    suggestions.push({
      severity: "critical",
      title: "尚未生成设计令牌",
      detail: "没有令牌集，画布无法应用统一风格。",
      tool_hint: `design_init(project_name="${state.projectName}", style="${state.style || "minimal"}")`,
    });
  }

  const weights: Record<Suggestion["severity"], number> = { critical: 20, warning: 10, advisory: 4 };
  const penalty = suggestions.reduce((sum, s) => sum + weights[s.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { score, suggestions };
}

export function registerSuggestTool(server: McpServer): void {
  server.registerTool(
    "design_suggest_improvements",
    {
      title: "Suggest Design Improvements",
      description: `Heuristic design review: structure completeness, density, motion, accessibility,
and token coverage. Returns an ordered list of actionable suggestions with tool hints.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const result = suggestImprovements();
        const lines = [
          `# Design Review`,
          ``,
          `**Score:** ${result.score}/100`,
          `**Suggestions:** ${result.suggestions.length}`,
          ``,
          ...(result.suggestions.length === 0
            ? ["No improvements suggested."]
            : result.suggestions.map(
                (s, i) => `${i + 1}. [${s.severity.toUpperCase()}] ${s.title}\n   ${s.detail}\n   → ${s.tool_hint}`
              )),
        ].join("\n");
        return {
          content: [{ type: "text" as const, text: lines }],
          structuredContent: { success: true, ...result },
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );
}

// ===== design_auto_improve =====

export interface AutoImproveAction {
  action: string;
  detail: string;
}

/**
 * Apply the most common structural fixes deterministically:
 * generate tokens when missing, and add navbar / hero / footer when absent.
 */
export function autoImprove(): { actions: AutoImproveAction[]; component_count: number } {
  const state = stateStore.getState();
  const actions: AutoImproveAction[] = [];
  const types = new Set(state.components.map((c) => c.type));

  const tokenCount = Object.values(state.tokens).reduce((sum, cat) => sum + Object.keys(cat).length, 0);
  if (tokenCount === 0) {
    applyStyleTokenSet(stateStore, undefined, "ai");
    actions.push({ action: "apply_style_preset", detail: `Generated the neutral default token set.` });
  }

  if (!types.has("navbar")) {
    stateStore.addComponent("navbar", "simple", { brand: "Logo", links: ["首页", "功能", "关于"] }, null, "ai");
    actions.push({ action: "add_navbar", detail: "Added a simple navbar." });
  }
  if (!types.has("hero")) {
    stateStore.addComponent("hero", "centered", { title: "主标题", subtitle: "副标题，突出核心价值", button_text: "立即开始" }, null, "ai");
    actions.push({ action: "add_hero", detail: "Added a centered hero section." });
  }
  if (!types.has("footer")) {
    stateStore.addComponent("footer", undefined, { copyright: "© 2026", links: ["隐私", "条款"] }, null, "ai");
    actions.push({ action: "add_footer", detail: "Added a footer." });
  }

  return { actions, component_count: stateStore.getState().components.length };
}

export function registerAutoImproveTool(server: McpServer): void {
  server.registerTool(
    "design_auto_improve",
    {
      title: "Auto-Improve Design",
      description: `Deterministically apply the most common structural fixes:
generate tokens when missing, and add navbar / hero / footer when absent.
Returns a list of applied actions.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const result = autoImprove();
        const lines =
          result.actions.length === 0
            ? "No structural improvements needed."
            : result.actions.map((a, i) => `${i + 1}. ${a.action} — ${a.detail}`).join("\n");
        return {
          content: [{ type: "text" as const, text: `# Auto-Improve\n\n${lines}\n\nComponents: ${result.component_count}` }],
          structuredContent: { success: true, ...result },
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );
}

// ===== design_review_and_improve =====

export interface ReviewAndImproveResult {
  before_score: number;
  after_score: number;
  suggestions: Suggestion[];
  applied: AutoImproveAction[];
  accessibility: { score: number; critical: number };
}

/**
 * One-call "agent loop": score the design, apply the common structural fixes,
 * and re-score. Returns a full report so the caller can decide what to do next.
 */
export function reviewAndImprove(): ReviewAndImproveResult {
  const before = suggestImprovements();
  const applied = autoImprove().actions;
  const after = suggestImprovements();
  const audit = auditDesign("AA");
  return {
    before_score: before.score,
    after_score: after.score,
    suggestions: after.suggestions,
    applied,
    accessibility: {
      score: audit.score,
      critical: audit.findings.filter((f) => f.severity === "critical").length,
    },
  };
}

export function registerReviewAndImproveTool(server: McpServer): void {
  server.registerTool(
    "design_review_and_improve",
    {
      title: "Review & Improve Design",
      description: `Run the full review loop in one call:
1. score the current design (structure / density / motion / tokens)
2. apply common structural fixes (tokens, navbar, hero, footer)
3. re-score and run the accessibility audit

Returns before/after scores, applied actions, remaining suggestions, and the
accessibility summary.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const result = reviewAndImprove();
        const lines = [
          `# Review & Improve`,
          ``,
          `**Score:** ${result.before_score} → ${result.after_score}`,
          `**Applied:** ${result.applied.length === 0 ? "none" : result.applied.map((a) => a.action).join(", ")}`,
          `**Remaining suggestions:** ${result.suggestions.length}`,
          `**Accessibility:** ${result.accessibility.score}/100 (${result.accessibility.critical} critical)`,
          ``,
          ...result.suggestions.map((s, i) => `${i + 1}. [${s.severity.toUpperCase()}] ${s.title} — ${s.tool_hint}`),
        ].join("\n");
        return {
          content: [{ type: "text" as const, text: lines }],
          structuredContent: { success: true, ...result },
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );
}

// ===== design_create_brand_style =====

export interface BrandDecision {
  category: string;
  key: string;
  value: string;
  reason: string;
}

export function createBrandStyle(
  name: string,
  colors: string[],
  options: { base_style?: string; radius_style?: string; shadow_style?: string }
): { brand_hue: number; decisions: BrandDecision[]; base_style: string } {
  const valid = colors.map((c) => c.trim()).filter((c) => isValidHex(c)).map((c) => normalizeHex(c));
  if (valid.length === 0) {
    throw new Error("No valid hex colors provided. Pass colors like ['#3366FF', '#FF5733']");
  }

  const baseStyle = options.base_style || stateStore.getState().style || "minimal";
  applyStyleTokenSet(stateStore, valid[0], "preset");

  const decisions: BrandDecision[] = [];
  const note = (category: "colors" | "radii" | "shadows", key: string, value: string, reason: string) => {
    stateStore.setToken(category, key, value, "user", reason);
    decisions.push({ category, key, value, reason });
  };

  // Brand hue from the average of the provided colors
  const hslList = valid.map((hex) => hexToHsl(hex));
  const avgHue = hslList.reduce((sum, h) => sum + h.h, 0) / hslList.length;
  const brandHue = Math.round(avgHue) % 360;

  const primary = valid[0];
  const accent = valid[1] || hslToHex(adjustLightness(hexToHsl(primary), -6));
  const primaryHsl = hexToHsl(primary);
  const dark = hslToHex(adjustLightness(primaryHsl, -12));
  const light = hslToHex(adjustLightness(primaryHsl, 12));

  note("colors", "color-primary", primary, `品牌色学习「${name}」主色`);
  note("colors", "color-accent", accent, `品牌色学习「${name}」强调色`);
  note("colors", "color-primary-dark", dark, "主色加深（按钮/链接对比度）");
  note("colors", "color-primary-light", light, "主色提亮（浅色强调背景）");
  note("colors", "color-bg", "#FDFDFF", "品牌基底中性背景");
  note("colors", "color-text", "#111827", "品牌高对比文字");

  if (options.radius_style === "none") {
    for (const name of ["none", "sm", "md", "lg", "xl"]) {
      note("radii", `radius-${name}`, "0px", "品牌无圆角策略");
    }
    note("radii", "radius-full", "9999px", "品牌无圆角策略（full 保留）");
  } else if (options.radius_style && ["sharp", "subtle", "rounded", "pill"].includes(options.radius_style)) {
    const radii = radiusSetFor(options.radius_style as "sharp" | "subtle" | "rounded" | "pill");
    Object.entries(radii).forEach(([key, value]) => {
      note("radii", key, value, `品牌圆角策略 ${options.radius_style}`);
    });
  }

  return { brand_hue: brandHue, decisions, base_style: baseStyle };
}

export function registerBrandStyleTool(server: McpServer): void {
  server.registerTool(
    "design_create_brand_style",
    {
      title: "Create Brand Style",
      description: `Learn a brand style from its colors: computes the dominant hue and applies a
brand-derived token set (primary/accent/dark/light + optional radius strategy).

Args:
  - name (string): Brand name
  - colors (string[]): 1–8 brand hex colors (first = primary, second = accent)
  - base_style (string, optional): Base preset to start from (default: current style)
  - radius_style (string, optional): 'none' | 'sharp' | 'subtle' | 'rounded' | 'pill'`,
      inputSchema: {
        name: z.string().min(1).describe("Brand name"),
        colors: z.array(z.string()).min(1).max(8).describe("Brand hex colors"),
        base_style: z.string().optional(),
        radius_style: z.enum(["none", "sharp", "subtle", "rounded", "pill"]).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = createBrandStyle(params.name, params.colors, {
          base_style: params.base_style,
          radius_style: params.radius_style,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `# Brand Style: ${params.name}\n\nDominant hue: ${result.brand_hue}°\nBase style: ${result.base_style}\nDecisions: ${result.decisions.length}\n\n${result.decisions.map((d) => `- ${d.category}.${d.key} = ${d.value} — ${d.reason}`).join("\n")}`,
            },
          ],
          structuredContent: { success: true, ...result },
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );
}

// ===== design_reflow =====

export function reflowPage(): { moved: Array<{ id: string; type: string }>; order: string[] } {
  const state = stateStore.getState();
  const rank = (type: string) => {
    const idx = CANONICAL_ORDER.indexOf(type);
    return idx === -1 ? CANONICAL_ORDER.length : idx;
  };
  const original = state.components.map((c) => c.id);
  const sorted = [...state.components].sort((a, b) => rank(a.type) - rank(b.type));
  const moved: Array<{ id: string; type: string }> = [];
  sorted.forEach((comp, i) => {
    if (original[i] !== comp.id) moved.push({ id: comp.id, type: comp.type });
  });
  const changed = stateStore.setComponentsOrder(sorted.map((c) => c.id), "ai");
  return { moved: changed ? moved : [], order: stateStore.getState().components.map((c) => c.id) };
}

export function registerReflowTool(server: McpServer): void {
  server.registerTool(
    "design_reflow",
    {
      title: "Reflow Page Layout",
      description: `Reorders the current page's components into a canonical section order
(navbar → hero → features → cards → stats → pricing → testimonials → timeline → faq → cta → form → cookie → footer).
Unknown types stay at the end in their relative order.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const result = reflowPage();
        return {
          content: [
            {
              type: "text" as const,
              text:
                result.moved.length === 0
                  ? "Page is already in canonical order."
                  : `Reflowed ${result.moved.length} components: ${result.moved.map((m) => `${m.type}(${m.id})`).join(", ")}`,
            },
          ],
          structuredContent: { success: true, ...result },
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );
}

/** Canonical order used by the reflow tool (exposed for tests). */
export function canonicalOrder(): string[] {
  return [...CANONICAL_ORDER];
}
