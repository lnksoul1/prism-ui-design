/**
 * Accessibility audit tool (improvement plan B2).
 *
 * Evaluates the current design against a pragmatic WCAG-oriented rule set:
 * color contrast (AA/AAA), image alt text, form labels, accessible names for
 * interactive elements, minimum font size, and motion safety.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateStore, type ComponentNode } from "../state.js";
import { getContrastRatio } from "../utils/color.js";

export interface AuditFinding {
  rule: string;
  severity: "critical" | "warning" | "advisory";
  component_id?: string;
  component_type?: string;
  message: string;
  suggestion: string;
}

function contrastRatio(a: string, b: string): number | null {
  try {
    return getContrastRatio(a, b);
  } catch {
    return null;
  }
}

function findComponents(nodes: ComponentNode[]): ComponentNode[] {
  const out: ComponentNode[] = [];
  const walk = (list: ComponentNode[]) => {
    for (const node of list) {
      out.push(node);
      if (node.children && node.children.length > 0) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

function hasAccessibleName(props: Record<string, unknown>): boolean {
  const candidates = [
    props.text,
    props.label,
    props.button_text,
    props.cta_text,
    props.title,
    props.brand,
    props.name,
  ];
  return candidates.some((v) => typeof v === "string" && v.trim().length > 0);
}

export function auditDesign(level: "AA" | "AAA" = "AA"): {
  score: number;
  findings: AuditFinding[];
} {
  const state = stateStore.getState();
  const findings: AuditFinding[] = [];
  const components = findComponents(state.components);
  const tokens = state.tokens;

  // --- Token contrast ---
  const text = tokens.colors["color-text"]?.value;
  const bg = tokens.colors["color-bg"]?.value;
  const primary = tokens.colors["color-primary"]?.value;
  if (text && bg) {
    const ratio = contrastRatio(text, bg);
    if (ratio !== null) {
      const thresholdAA = 4.5;
      const thresholdAAA = 7;
      const pass = level === "AAA" ? ratio >= thresholdAAA : ratio >= thresholdAA;
      if (!pass) {
        findings.push({
          rule: "contrast-aa-text",
          severity: "critical",
          message: `Text/background contrast is ${ratio.toFixed(2)}:1 (requires ${level === "AAA" ? "7:1" : "4.5:1"}).`,
          suggestion: "Darken color-text or lighten color-bg via design_set_token.",
        });
      }
    }
  }
  if (primary && text) {
    const ratio = contrastRatio(text, primary);
    if (ratio !== null && ratio < 4.5) {
      findings.push({
        rule: "contrast-aa-text",
        severity: "warning",
        message: `Text on primary color is ${ratio.toFixed(2)}:1 (< 4.5:1).`,
        suggestion: "Adjust color-primary or use color-primary-dark for text backgrounds.",
      });
    }
  }

  // --- Per-component rules ---
  for (const comp of components) {
    const props = comp.props || {};
    const id = comp.id;
    const type = comp.type;

    if (type === "image" && (!props.alt || String(props.alt).trim() === "")) {
      findings.push({
        rule: "img-alt",
        severity: "critical",
        component_id: id,
        component_type: type,
        message: "Image has no alt text.",
        suggestion: "Add an alt prop (or empty alt for decorative images).",
      });
    }

    if (type === "form") {
      const fields = Array.isArray(props.fields) ? props.fields : [];
      const unlabeled = fields.filter((f: Record<string, unknown>) => !f.label && !f.placeholder);
      if (unlabeled.length > 0) {
        findings.push({
          rule: "form-labels",
          severity: "warning",
          component_id: id,
          component_type: type,
          message: `${unlabeled.length} form field(s) have neither a label nor a placeholder.`,
          suggestion: "Add a label to each field for assistive technology.",
        });
      }
    }

    if (["button", "cta", "navbar", "pagination", "badge"].includes(type) && !hasAccessibleName(props)) {
      findings.push({
        rule: "accessible-name",
        severity: "warning",
        component_id: id,
        component_type: type,
        message: "Interactive component has no visible text/accessible name.",
        suggestion: "Add button_text/text/label props.",
      });
    }
  }

  // --- Typography ---
  const xs = tokens.typography["text-xs"]?.value;
  if (xs) {
    const px = parseFloat(xs) * 16;
    if (px < 12) {
      findings.push({
        rule: "min-font-size",
        severity: "advisory",
        message: `text-xs is ${px.toFixed(0)}px, below the 12px readability floor.`,
        suggestion: "Use text-sm or larger for body content.",
      });
    }
  }

  // --- Motion safety ---
  const animated = components.filter((c) => c.animation && (c.animation.entry || c.animation.hover));
  if (animated.length > 0) {
    findings.push({
      rule: "motion-safety",
      severity: "advisory",
      message: `${animated.length} component(s) use animation.`,
      suggestion: "Ensure generated CSS includes @media (prefers-reduced-motion: reduce) to disable entry/hover motion.",
    });
  }

  // --- WCAG 2.2 target size (advisory: measurable in rendered output) ---
  const interactive = components.filter((c) => ["button", "cta", "navbar", "fab", "toggle"].includes(c.type));
  if (interactive.length > 0) {
    findings.push({
      rule: "target-size",
      severity: "advisory",
      message: `${interactive.length} interactive component(s) present — verify targets are at least 24×24 CSS px.`,
      suggestion: "Ensure buttons/links meet WCAG 2.2 minimum target size (24×24px, 44×44px recommended).",
    });
  }

  // --- Focus ring (keyboard operability) ---
  if (components.length > 0) {
    findings.push({
      rule: "focus-ring",
      severity: "advisory",
      message: "Ensure a visible focus ring (:focus-visible) is defined for all interactive elements.",
      suggestion: "Add :focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; } to the generated CSS.",
    });
  }

  const weights: Record<AuditFinding["severity"], number> = {
    critical: 20,
    warning: 10,
    advisory: 4,
  };
  const penalty = findings.reduce((sum, f) => sum + weights[f.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return { score, findings };
}

export function registerAuditTool(server: McpServer): void {
  server.registerTool(
    "design_audit_accessibility",
    {
      title: "Audit Accessibility",
      description: `Audit the current design against WCAG-oriented accessibility rules.

Rules: text/background contrast (AA or AAA), image alt text, form field labels,
accessible names on interactive components, minimum font size, and motion safety.

Args:
  - level (string, optional): 'AA' (default) | 'AAA'

Returns a 0–100 score plus per-finding details with fix suggestions.`,
      inputSchema: {
        level: z.enum(["AA", "AAA"]).optional().describe("Conformance level (default AA)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = auditDesign(params.level || "AA");
        const lines = [
          `# Accessibility Audit (${params.level || "AA"})`,
          ``,
          `**Score:** ${result.score}/100`,
          `**Findings:** ${result.findings.length}`,
          ``,
          ...(result.findings.length === 0
            ? ["No issues found."]
            : result.findings.map(
                (f, i) =>
                  `${i + 1}. [${f.severity.toUpperCase()}] ${f.rule}${f.component_id ? ` — ${f.component_type} (${f.component_id})` : ""}\n   ${f.message}\n   → ${f.suggestion}`
              )),
        ].join("\n");
        return {
          content: [{ type: "text" as const, text: lines }],
          structuredContent: { success: true, level: params.level || "AA", ...result },
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
