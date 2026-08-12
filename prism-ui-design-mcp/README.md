# UI Design MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >= 20](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-60%2B%20passing-brightgreen.svg)](https://nodejs.org/api/test.html)
[![MCP Protocol](https://img.shields.io/badge/MCP-Protocol-purple.svg)](https://modelcontextprotocol.io/)

An MCP (Model Context Protocol) server that provides comprehensive UI design assistance tools for LLMs. Generate color palettes, typography pairings, spacing systems, shadow systems, design tokens, and more — all through the MCP protocol.

> **中文文档**：请阅读 [README.zh-CN.md](./README.zh-CN.md)

## Features

- **68 MCP tools** covering the full spectrum of UI design needs
- **Color theory engine** with HSL-based harmony generation (monochromatic, analogous, complementary, split-complementary, triadic, tetradic)
- **WCAG 2.1 contrast checker** with AA/AAA compliance scoring
- **Curated font pairings** with Google Fonts integration
- **14 style presets** (incl. 8 trend-aligned: Glassmorphism, Neumorphism, Claymorphism, Aurora, Brutalism, Cyberpunk, Organic, Luxury)
- **41 component types** (Atomic Design: input, table, alert, tooltip, bento grid, skeleton, command palette, glass card, FAB, marquee, toggle, cookie banner …)
- **20 animations** (13 entry + 7 hover, with duration/delay/easing/stagger)
- **Complete design token system** generation in a single call
- **Dual transport support**: stdio (local) and Streamable HTTP (remote)
- **Zero external API dependencies** — all generation is algorithmic

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run via stdio (default)
npm start

# Run via HTTP
TRANSPORT=http PORT=3100 npm start
```

## Tools

| Tool | Description |
|------|-------------|
| `ui_generate_color_palette` | Generate harmonious color palettes from a base color using color theory |
| `ui_suggest_typography` | Get curated font pairings (display + body) with Google Fonts links |
| `ui_generate_type_scale` | Generate modular typography scales (golden ratio, perfect fourth, etc.) |
| `ui_generate_spacing_scale` | Generate spacing systems (linear, geometric, fibonacci strategies) |
| `ui_generate_shadow_system` | Generate elevation shadow systems (subtle, medium, sharp) |
| `ui_generate_border_radius_scale` | Generate border-radius scales (sharp, subtle, rounded, pill) |
| `ui_check_color_contrast` | Check WCAG 2.1 contrast ratios with AA/AAA grading |
| `ui_generate_gradient` | Generate CSS gradients with harmonious color stops |
| `ui_suggest_breakpoints` | Generate responsive breakpoint systems (Tailwind, Bootstrap, Material, custom) |
| `ui_generate_design_tokens` | Generate a complete design token system (colors, type, spacing, shadows, radii, transitions) |

### Real-time design tools (18)

| Tool | Description |
|------|-------------|
| `design_init` | Initialize a design project, set style, and generate the complete token set |
| `design_add_component` | Add a UI component (hero, navbar, card, etc.) to the canvas |
| `design_update_component` | Update properties of an existing component |
| `design_remove_component` | Remove a component from the canvas |
| `design_set_animation` | Set entry/hover animations for a component |
| `design_set_token` | Set or update a single design token |
| `design_get_state` | Get the full design state (tokens, components, activity log, undo/redo capability) |
| `design_undo` | Undo the last operation |
| `design_redo` | Redo an undone operation |
| `design_add_page` | Add a new page |
| `design_switch_page` | Switch the current page |
| `design_remove_page` | Remove a page |
| `design_apply_template` | Apply a page template (ecommerce, SaaS, blog, portfolio, dashboard) |
| `design_export` | Export the design as HTML, React, Vue, or Figma Tokens |
| `design_reorder_component` | Reorder components on the canvas |
| `design_set_theme` | Switch between light and dark theme |
| `design_get_conflicts` | Get token contrast conflicts |
| `design_check_prompts` | Read and clear pending user prompts |
| `design_save_project` | Persist the current design to a `.prism.json` file |
| `design_load_project` | Restore a design from a `.prism.json` file |
| `design_list_projects` | List saved project files |
| `design_export_tokens` | Export tokens as W3C DTCG, CSS, Style Dictionary, or Figma Tokens |
| `design_import_tokens` | Import design tokens from DTCG JSON (replace / merge strategies) |
| `design_audit_accessibility` | Score the design against WCAG-oriented accessibility rules |
| `design_render_preview` | Render the design as HTML (and PNG screenshot when Playwright is installed) |
| `design_save_template` | Save the current design as a reusable template |
| `design_load_template` | Load a saved template |
| `design_list_templates` | List saved templates |
| `design_create_version` | Snapshot the design as a named version |
| `design_list_versions` | List version snapshots |
| `design_restore_version` | Restore a previous version |
| `design_diff_versions` | Diff two versions (components + tokens) |
| `design_import_design_md` | Import tokens from a Google DESIGN.md document |
| `design_import_webpage` | Import a webpage URL / HTML as components |
| `design_get_style_guide` | Look up a named style guide (glassmorphism, brutalist, …) |
| `design_apply_style_guide` | Apply a style guide on top of a style preset |
| `design_semantic_style` | Map natural-language adjectives to tokens with traceable reasons |
| `design_list_capabilities` | Self-describing capability manifest for agents |
| `design_list_style_presets` | List the 14 built-in style presets |
| `design_list_components` | List components on the current page |
| `design_list_pages` | List all pages |
| `design_set_project_name` | Rename the project |
| `design_get_tokens` | Get current tokens as DTCG JSON |
| `design_set_token_batch` | Batch-set tokens in a category |
| `design_delete_token` | Delete a single token |
| `design_suggest_improvements` | Heuristic design review with actionable suggestions |
| `design_create_brand_style` | Learn a brand style from its colors (dominant hue + brand palette) |
| `design_reflow` | Reorder the page into canonical section order |
| `design_auto_improve` | Apply common structural fixes (tokens / navbar / hero / footer) |
| `design_set_platform` | Set the preview platform (web / desktop / mobile) |
| `design_save_platform` | Save current pages as a platform-specific design |
| `design_load_platform` | Restore a saved platform design |
| `design_list_platforms` | List saved platform designs |
| `design_add_comment` | Attach a review comment to a component |
| `design_list_comments` | List review comments |
| `design_remove_comment` | Remove a review comment |
| `design_generate_page` | Generate a page from a brief (template + semantic style) |
| `design_review_and_improve` | One-call review loop: score, fix, re-score + a11y audit |

## Testing

```bash
npm test
```

The test suite covers the state store (undo/redo, pages, tokens, conflicts),
style-preset token generation, all MCP tool schemas, the shared service layer,
project persistence, DTCG token interop, accessibility audit, render preview,
and an HTTP + WebSocket integration chain (**254 tests passing**), plus an
optional Playwright browser smoke (`npm run test:e2e`).

## Templates, versions, semantics & style guides

- **Templates** (`design_save_template` / `design_load_template`): persist any
  design as a `.prism-template.json` file and re-apply it later.
- **Versions** (`design_create_version` / `design_restore_version` /
  `design_diff_versions`): session-scoped snapshots with component + token diff.
- **Design review** (`design_suggest_improvements`): heuristic score for
  structure completeness, density, motion, accessibility, and tokens.
- **Brand style learning** (`design_create_brand_style`): derive a brand token
  set from 1–8 brand colors (dominant hue, primary/accent, radius strategy).
- **Reflow** (`design_reflow`): canonical page section order in one call.
- **Semantic styling** (`design_semantic_style`): adjectives such as "温暖 /
  warm" are translated into measurable deltas (hue, saturation, lightness,
  radius, shadow, font mood); every applied token records its reason.
- **Style guides** (`design_get_style_guide` / `design_apply_style_guide`):
  glassmorphism, brutalist, retro, neumorphism, cyberpunk, and editorial
  token overrides.
- **DESIGN.md interop**: `design_import_design_md` parses Google DESIGN.md
  front matter; `design_export_tokens(format="design_md")` generates it.
- **Webpage import**: `design_import_webpage` fetches a URL or accepts pasted
  HTML and extracts navbar/hero/sections/footer components.
- **Presentation export**: `design_export(format="presentation")` turns every
  page into a navigable HTML slide deck (arrow keys + print);
  `design_export(format="react-ts")` emits typed React components and
  `design_export(format="css")` emits tokens + base component CSS.
  `flutter` / `swiftui` formats emit mobile code with token-derived themes.
- **Auto-improve** (`design_auto_improve`): deterministically adds missing
  tokens / navbar / hero / footer in one call.
- **Presence**: the dashboard shows how many clients are online, and the
  active preview platform syncs between server state and every client.
- **Platform designs** (`design_save_platform` / `design_load_platform`):
  keep a separate page layout per platform (web / desktop / mobile) while
  sharing style + tokens.
- **Comments** (`design_add_comment` / `design_list_comments`): attach review
  feedback to any component without changing the design.
- **One-shot generation** (`design_generate_page`): turn a brief into a
  complete page — template detection + semantic adjectives in one call.
- **Review & improve** (`design_review_and_improve`): score the design, apply
  structural fixes, re-score, and run the accessibility audit in one call.
- **Tailwind export**: `design_export_tokens(format="tailwind")` emits a
  Tailwind v4 CSS-first `@theme` block; `design_export(format="svelte")`
  emits a Svelte SFC with token CSS.
- **i18n**: the dashboard shell supports 中文 / English with a topbar toggle
  (persisted in localStorage).
- **Live cursors** (C5): every connected dashboard broadcasts its pointer
  position (throttled); other clients see remote cursors with a client tag.
- **Conflict detection** (C5): every mutation carries the client's last-seen
  `revision`; if the design changed underneath it, the mutation is rejected
  with a `conflict` message and the client auto-resyncs.
- **Premium UI** (spec §5.1–5.3): the dashboard follows a top-tier design
  system — violet brand (`#7C3AED`), white base, 8/12/16 radius ladder,
  restrained shadows, Vercel-style dual focus rings, six micro-states,
  dot-grid canvas, and crafted empty states (canvas guide card with AI /
  library / template entry points, activity clock state, WCAG contrast-pass
  card with the live ratio).
- **Real screenshots**: the screenshot button downloads a PNG rendered by
  Playwright (`/api/render?format=png`), falling back to HTML when browsers
  are unavailable.
- **Client panels**: project switcher, template library (built-in + saved),
  version snapshots, and component comments are now first-class dashboard
  panels; activity/token/library search and conflict reload UI included.
- **Open client UI**: the canvas empty state includes "打开客户端界面", which
  imports the dashboard's own shell (`client/index.html`) as a design page
  (`POST /api/import-client`) so the service can adjust this project's UI.
- **Capture actual UI**: "截取实际界面" screenshots the live dashboard with
  Playwright (`POST /api/capture-client`) and drops the image into the canvas
  as a faithful reference next to the structural components.
- **Prompt queue visibility**: queued user prompts appear in the activity log
  and are broadcast as `prompt_queued` for connected agents/gateways.
- **Canvas fixes**: the preview canvas now scrolls when content overflows, and
  freeform mode lets you drag components anywhere (whole wrapper, not just the
  handle) and resize with corner handles.
- **Freeform canvas**: toggle between flow layout and free positioning —
  drag components anywhere, resize with 8 handles, edit X/Y/W/H in the
  inspector, and auto-arrange into a clean vertical stack.
  Layouts are stored on the component (`layout`, `visible`, `locked`) and
  updated through `design_update_component` / WebSocket.

## Agent context (MCP Resources & Prompts)

The server exposes four resources (`prism://tokens/active`,
`prism://components/registry`, `prism://patterns`, `prism://audit/checklist`)
and three prompts (`build_page`, `design_review`, `import_project`) so agents
can discover design context without guessing.

## Optional: screenshot rendering

`design_render_preview` always returns standalone HTML. To enable PNG
screenshots (the AI visual-verification loop), install the optional runtime:

```bash
npm i -D playwright && npx playwright install chromium
```

## Project persistence

Designs are saved automatically (debounced) to
`~/.prism/projects/autosave.prism.json` and restored on the next startup.
Explicit save/load is available through the MCP tools
(`design_save_project`, `design_load_project`, `design_list_projects`),
the REST endpoints (`/api/project/save`, `/api/project/load`, `/api/projects`),
and the dashboard toolbar (💾 保存 / 📂 加载).
Override the storage directory with `PRISM_PROJECT_DIR`.

## Agent workflow

The browser prompt bar queues instructions for the AI agent. Agents poll the
queue and act on it:

```
loop:
  result = design_check_prompts()        # returns + clears the pending prompt
  if result.has_prompt:
    act_on(result.prompt)                # e.g. design_update_component(...)
  sleep(2s)
```

Every queued prompt is also written to the activity log and broadcast over
WebSocket as `{ type: "prompt_queued", prompt }`.

## Configuration (environment)

| Variable | Default | Effect |
|---|---|---|
| `DASHBOARD_PORT` | `3100` | HTTP/WebSocket port |
| `PRISM_PROJECT_DIR` | `~/.prism/projects` | Project/template storage directory |
| `PRISM_AUTOLOAD` | on | Restore the autosave checkpoint on startup (`off` disables) |
| `PRISM_AUTOIMPORT` | on | Auto-import workspace pages on startup (`off` starts with a fresh Home page) |
| `PRISM_PREVIEWS_DIR` | `.prism-previews` | Screenshot output directory (tool only) |
| `PRISM_SKIP_E2E` | off | Skip Playwright browser smoke tests (`1` skips) |

## Quality gates

```bash
npm run lint      # ESLint (warnings don't block)
npm run format    # Prettier --write
npm run check     # lint + build + test (CI gate)
npm run test:e2e  # optional Playwright browser smoke (needs Chromium)
```

CI (GitHub Actions, `.github/workflows/ci.yml`) runs lint + build + test on
every push/PR with Node 20.

## Configuration

### stdio (local)

```json
{
  "mcpServers": {
    "ui-design": {
      "command": "node",
      "args": ["/path/to/ui-design-mcp-server/dist/index.js"]
    }
  }
}
```

### Streamable HTTP (remote)

```bash
TRANSPORT=http PORT=3100 npm start
```

Endpoint: `http://localhost:3100/mcp`

## Style Presets

| Style | Description | Shadow | Radius | Spacing Base |
|-------|-------------|--------|--------|-------------|
| `minimal` | Clean, airy, neutral palette | subtle | subtle | 8px |
| `bold` | High contrast, vibrant accents | medium | rounded | 8px |
| `playful` | Warm, friendly, rounded shapes | medium | pill | 8px |
| `dark` | Dark-first, luminous accents | sharp | subtle | 8px |
| `editorial` | Magazine-like, elegant serif | subtle | sharp | 8px |
| `tech` | Futuristic, precise, cyan/blue | sharp | sharp | 4px |

## Example Usage

### Generate a complementary color palette

```
Tool: ui_generate_color_palette
Arguments: { "base_color": "#3B82F6", "scheme": "complementary" }
```

### Check WCAG contrast

```
Tool: ui_check_color_contrast
Arguments: { "foreground": "#333333", "background": "#FFFFFF" }
```

### Generate complete design tokens for a dark theme

```
Tool: ui_generate_design_tokens
Arguments: { "style": "dark", "base_color": "#6366F1", "dark_mode": true }
```

## Project Structure

```
ui-design-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main entry point
│   ├── types.ts              # TypeScript interfaces
│   ├── constants.ts          # Font pairings, style presets, breakpoints
│   ├── utils/
│   │   ├── color.ts          # Color theory engine (HSL, contrast, harmony)
│   │   └── formatter.ts      # Output formatting helpers
│   └── tools/
│       ├── color-palette.ts   # Color palette generation
│       ├── typography.ts      # Font pairing + type scale
│       ├── spacing.ts         # Spacing scale generation
│       ├── shadows.ts         # Shadow system generation
│       ├── border-radius.ts   # Border radius scale
│       ├── contrast.ts        # WCAG contrast checking
│       ├── gradient.ts        # Gradient generation
│       ├── breakpoints.ts     # Responsive breakpoints
│       └── design-tokens.ts   # Complete design token system
└── dist/                      # Built JavaScript
```

## Development

```bash
# Development with auto-reload
npm run dev

# Build
npm run build

# Clean build artifacts
npm run clean
```

## Requirements

- Node.js >= 18
- npm
