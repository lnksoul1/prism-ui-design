/**
 * Heuristic design review.
 *
 *   - design_suggest_improvements — score the design and return actionable,
 *     tool-shaped suggestions (structure completeness, density, motion,
 *     accessibility, tokens).
 *
 * Route B: the other review tools (auto-improve, review-and-improve, brand-style
 * learning, reflow) were removed with the dashboard-driven workflows. What
 * remains is the read-only review an agent can call before delivering.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { stateStore } from "../state.js";
import { auditDesign } from "./design-audit.js";

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
      tool_hint: "add copy, structure or token changes with design_add_component / design_set_token — per-component animation scripting is not part of this server",
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

/** Canonical order used by the reflow tool (exposed for tests). */
export function canonicalOrder(): string[] {
  return [...CANONICAL_ORDER];
}
