/**
 * MCP Resources (improvement plan B4).
 *
 * Resources give agents structured context about the current design without
 * requiring a tool call: active tokens, the component catalog, the audit
 * checklist, and available page templates.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { stateStore } from "../state.js";
import { tokensToDtcg } from "../tokens/dtcgi.js";
import { COMPONENT_TYPES } from "../service/design-service.js";

const PAGE_TEMPLATES = [
  "ecommerce_home",
  "saas_landing",
  "blog_post",
  "portfolio",
  "dashboard",
];

function componentsRegistryJson(): string {
  const registry = [...COMPONENT_TYPES].sort().map((type) => ({
    type,
    variant: "see design_add_component tool schema",
    renderer: "dashboard client",
  }));
  return JSON.stringify({ schema: "prism.components", version: 1, count: registry.length, components: registry }, null, 2);
}

export function registerResources(server: McpServer): void {
  server.registerResource(
    "Active Design Tokens",
    "prism://tokens/active",
    {
      title: "Active Design Tokens",
      description: "Current design tokens (colors, typography, spacing, shadows, radii, transitions) in W3C DTCG format.",
      mimeType: "application/json",
    },
    async () => {
      const tokens = stateStore.getState().tokens;
      return {
        contents: [
          {
            uri: "prism://tokens/active",
            mimeType: "application/json",
            text: JSON.stringify(tokensToDtcg(tokens), null, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    "Component Registry",
    "prism://components/registry",
    {
      title: "Component Registry",
      description: "The catalog of UI component types the design canvas can render.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "prism://components/registry",
          mimeType: "application/json",
          text: componentsRegistryJson(),
        },
      ],
    })
  );

  server.registerResource(
    "Page Templates",
    "prism://patterns",
    {
      title: "Page Templates",
      description: "Pre-built page templates available through design_apply_template.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "prism://patterns",
          mimeType: "application/json",
          text: JSON.stringify({ templates: PAGE_TEMPLATES }, null, 2),
        },
      ],
    })
  );

  server.registerResource(
    "Accessibility Audit Checklist",
    "prism://audit/checklist",
    {
      title: "Accessibility Audit Checklist",
      description: "WCAG-oriented rules evaluated by design_audit_accessibility.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "prism://audit/checklist",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              rules: [
                { id: "contrast-aa-text", description: "Text vs background contrast ≥ 4.5:1 (AA)" },
                { id: "contrast-aa-large", description: "Large text vs background contrast ≥ 3:1 (AA)" },
                { id: "contrast-aaa-text", description: "Text vs background contrast ≥ 7:1 (AAA)" },
                { id: "img-alt", description: "Every image has non-empty alt text" },
                { id: "form-labels", description: "Every form field has an associated label" },
                { id: "accessible-name", description: "Interactive elements (buttons/links) have an accessible name" },
                { id: "min-font-size", description: "Body text is at least 12px (16px recommended)" },
                { id: "motion-safety", description: "Animations respect prefers-reduced-motion" },
                { id: "target-size", description: "Interactive targets are at least 24×24 CSS px (WCAG 2.2)" },
              ],
            },
            null,
            2
          ),
        },
      ],
    })
  );
}
