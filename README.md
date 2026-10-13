# Prism

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-stdio-purple.svg)](https://modelcontextprotocol.io/)

**中文文档：[README.zh-CN.md](./README.zh-CN.md)**

**An MCP server for design work.** Give an AI agent the ability to generate design
tokens, assemble a page from 38 component types, review it for accessibility and
design quality, and export it as code or tokens.

- **42 tools**, 4 resources, 3 prompts over **stdio**
- **38 component types** with validated Zod prop schemas
- **Export** to HTML, React, Vue, React-TS, Svelte, CSS, presentation, Flutter, SwiftUI
- **Tokens** in DTCG, CSS custom properties, Style Dictionary, Figma Tokens, Tailwind v4 `@theme`, DESIGN.md
- **Sessions** are stateful and persisted: save/load a project as `.prism.json`
- **Live preview**: one stable artifact any viewer can follow (`design_preview_sync`), plus a self-contained DeepSeek Harness plugin (`dsh-plugin-prism-design`) whose panel opens from the sidebar rail or the right Sidebar
- **No dashboard, no HTTP server, no external APIs.** Exported pages are self-contained (pure CSS animation, no CDN runtime)

---

## Quick start

```bash
npm install
npm run build
npm start            # speak MCP over stdio
```

### Wire it into an MCP client

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": ["/absolute/path/to/prism/dist/index.js"]
    }
  }
}
```

Any MCP-capable client works (Claude Desktop, Cursor, Claude Code, or your own).
Once connected, ask the agent for something like:

> Build a landing page for a coffee roastery, warm and editorial. Then audit it
> for accessibility and export the React version.

The agent will call `design_init` → `design_add_component` → `design_audit_accessibility`
→ `design_export` and can inspect its own work through `design_get_state`.

### Verify the server

```bash
npm run smoke    # spawns dist/index.js, handshakes, lists tools/resources/prompts
```

---

## Tools

Call `design_list_capabilities` for the machine-readable manifest. It lists
**exactly** the registered tools — this is enforced by `tests/tools.test.ts`,
so the manifest cannot drift from the registry.

### Generation — stateless token and asset generators (10)

| Tool | What it does |
|---|---|
| `ui_generate_color_palette` | Harmonious palettes from a base colour (6 harmony schemes) |
| `ui_suggest_typography` | Curated font pairings with Google Fonts links |
| `ui_generate_type_scale` | Modular type scales (golden ratio, perfect fourth, …) |
| `ui_generate_spacing_scale` | Spacing systems (linear, geometric, fibonacci) |
| `ui_generate_shadow_system` | Elevation shadow sets (subtle, medium, sharp) |
| `ui_generate_border_radius_scale` | Radius scales (sharp, subtle, rounded, pill) |
| `ui_check_color_contrast` | WCAG 2.1 contrast ratios with AA/AAA grading |
| `ui_generate_gradient` | CSS gradients with harmonious stops |
| `ui_suggest_breakpoints` | Responsive breakpoint systems (Tailwind, Bootstrap, Material) |
| `ui_generate_design_tokens` | A complete token system in one call |

### Session — build a design in the server's state (18 + 3 persistence)

| Tool | What it does |
|---|---|
| `design_init` | Start a session (neutral default tokens + optional base colour) |
| `design_add_component` | Add a component by type, with validated props |
| `design_update_component` | Update props, layout, visibility, lock |
| `design_rename_component` | Rename a layer |
| `design_remove_component` | Remove a component |
| `design_reorder_component` | Reorder siblings |
| `design_align_components` | Align/distribute (single undo step) |
| `design_z_order_component` | Stacking: front/back/forward/backward |
| `design_set_token` | Set one token |
| `design_set_theme` | Light/dark |
| `design_apply_template` | One of 5 page templates |
| `design_add_page` / `design_switch_page` / `design_remove_page` | Multi-page sessions |
| `design_get_state` | Read the whole session (tokens, pages, components, activity) |
| `design_get_conflicts` | Token contrast conflicts |
| `design_undo` / `design_redo` | History (50 snapshots) |
| `design_save_project` / `design_load_project` / `design_list_projects` | Persist and restore a session as `.prism.json` |

### Review, delivery and meta (11)

| Tool | What it does |
|---|---|
| `design_audit_accessibility` | WCAG-oriented audit with a 0–100 score |
| `design_suggest_improvements` | Heuristic review: structure, density, motion, a11y, tokens |
| `design_render_preview` | Standalone HTML preview (PNG when Playwright is installed) |
| `design_preview_sync` | Write the live-preview file so a watching viewer shows the latest design |
| `design_export` | html / react / vue / react-ts / svelte / css / presentation / flutter / swiftui |
| `design_export_tokens` | DTCG / CSS / Style Dictionary / Figma Tokens / DESIGN.md / Tailwind v4 |
| `design_import_tokens` | Import DTCG tokens (replace / merge-overwrite / merge-keep) |
| `design_import_webpage` | Import a URL or pasted HTML as components |
| `design_import_design_md` | Import tokens from a Google DESIGN.md document |
| `design_semantic_style` | Map adjectives ("warm", "温暖") onto measurable token deltas |
| `design_list_capabilities` | The manifest |

### Resources and prompts

- Resources: `prism://tokens/active`, `prism://components/registry`,
  `prism://patterns`, `prism://audit/checklist`
- Prompts: `build_page`, `design_review`, `import_project`

### Live preview

`design_preview_sync` renders the current page to one stable file
(`PRISM_PREVIEW_FILE`, default `<cwd>/.prism-preview/design.html`), stamped with
a revision. Because it is a single path that is overwritten in place, any watcher
can follow it — see [DeepSeek Harness integration](docs/dsh-integration.md), whose
bundle also adds a Prism Preview panel (left sidebar rail, or a right-Sidebar tab)
that re-renders whenever the revision changes. That bundle is self-contained — it
packages the MCP server it launches, derives every path from where it is
installed, and declares no machine-specific configuration.

---

## Component types

38 types the exporter can render. Values are validated by
`src/component-schemas.ts` (unknown keys pass through, missing keys are tolerant);
a test asserts the schema map and the catalog list the same types.

`accordion` · `alert` · `avatar` · `badge` · `bento_grid` · `breadcrumb` · `button` ·
`card` · `card_grid` · `carousel` · `container` · `cta` · `faq` · `feature_grid` ·
`feature_list` · `footer` · `form` · `glass_card` · `grid` · `hero` ·
`html_fragment` · `image` · `input` · `marquee` · `navbar` · `pagination` ·
`pricing` · `progress` · `sidebar` · `skeleton` · `stats` · `table` · `tabs` ·
`testimonial` · `text` · `text_section` · `timeline` · `tooltip`

Two of them are produced by the store rather than typed by hand: `text` comes from
`promoteElementToComponent`, and `container` from `groupComponents`. `items` is the
canonical list prop for every list-bearing type (`links` / `plans` / `tabs` /
`slides` are accepted aliases), and `design_add_component` warns instead of silently
rendering an empty component when the list is missing or is not an array.

`html_fragment` is how imported HTML is represented: an imported page becomes
faithful regions (header / nav / main / footer / section-N / content) that keep
the original CSS, and edits are written back through
`applyHtmlFragmentsToDocument` with head and scripts preserved.

---

## Configuration

| Variable | Default | Effect |
|---|---|---|
| `PRISM_PROJECT_DIR` | `~/.prism/projects` | Where `design_save_project` / autosave write |
| `PRISM_AUTOSAVE` | on (set `off` to disable) | Rolling autosave of the session |
| `PRISM_AUTOLOAD` | on (set `off` to disable) | Restore the autosave checkpoint on start |
| `PRISM_PREVIEW_FILE` | `<cwd>/.prism-preview/design.html` | The live-preview artifact `design_preview_sync` writes |
| `PRISM_PREVIEWS_DIR` | `<cwd>/.prism-previews` | Where `design_render_preview` writes PNG screenshots |

The LLM API key is never involved: Prism has no built-in AI channel — the agent
driving the MCP server *is* the intelligence. Nothing leaves your machine except
the exported files you ask for.

---

## Architecture

```
┌──────────────┐   stdio (MCP)   ┌────────────────────────────────────────┐
│  MCP client  │ ◄─────────────► │  src/index.ts                          │
│  (agent)     │                 │   ├─ McpServer: 42 tools               │
└──────────────┘                 │   ├─ 4 resources · 3 prompts           │
                                 │   └─ DesignStateStore (in-memory + disk)│
                                 └────────────────────────────────────────┘
```

One mutation path: every tool calls `design-service`, which calls
`DesignStateStore`. Undo/redo, activity logging, conflict detection and the
export pipeline all hang off that single store, so no two tools can disagree
about state. This is enforced: `tests/mutation-path.test.ts` fails if a tool
reaches past the service to a store mutator, which is what keeps the component
type allowlist, the prop schemas and the token-category check from being bypassed.

```
src/
├── index.ts              # MCP registration + stdio bootstrap
├── state.ts              # DesignStateStore: state, undo/redo, mutators
├── service/design-service.ts  # the only mutation path + input validation
├── component-schemas.ts  # per-type Zod prop schemas + the list-prop contract
├── tools/                # one module per area (design-tools, design-preview, …)
├── tokens.ts + tokens/dtcgi.ts # token generation and interop
├── layout/snap.ts        # grid snapping used by snapComponentsToGrid
├── import-project.ts     # HTML → html_fragment regions → back again
├── semantics.ts          # adjective → token deltas
├── project-store.ts      # .prism.json persistence + autosave
└── resources/, prompts/  # MCP context surfaces

dsh-plugin/               # DeepSeek Harness bundle (MCP connection + preview panel)
```

The geometry layer (a layout engine, a tidy-up pass, and an auto-layout pass) was
removed: exports are CSS flow layout and never read `layout` coordinates, so
nothing consumed it.

---

## Development

```bash
npm run dev      # tsx watch src/index.ts
npm run build    # tsc
npm test         # build + compile tests + node --test (glob over .test-build/tests)
npm run lint     # eslint
npm run check    # lint + test
```

The test suite is 166 tests over 18 suites, covering the state store, the service
layer, all 42 tool contracts, component schemas, the export formats, token interop,
and HTML import fidelity. Three contract tests are worth knowing about:

- `tests/tools.test.ts` — the registered tool set must equal the
  `design_list_capabilities` manifest, every tool must accept its documented
  parameters and respond.
- `tests/mutation-path.test.ts` — no tool may call a `DesignStateStore` mutator
  directly; the service's validation must not be bypassable.
- `tests/component-schemas.test.ts` — the prop-schema map and the component
  catalog must list exactly the same types.

`.githooks/pre-push` runs `npm run lint && npm test && npm run smoke`; install it
with `npm run hooks:install`. CI runs the same plus a dependency audit.

### Reproducible audits

These scripts check properties that unit tests cannot, and each regenerates what
it needs:

| Script | What it proves |
|---|---|
| `npm run smoke` | The server starts over real stdio, handshakes, and registers the expected surface |
| `node verify-dsh-bundle.mjs` | The Harness bundle is well formed: manifest and exported paths, patch rows, JS syntax, and the client-half contracts (guide thunks, the Remote result envelope, the iframe sandbox, the service inject list) |
| `node verify-preview.mjs` | The live-preview artifact is written, self-contained (no remote references) and revision-stamped |
| `node audit-rendered-css.mjs` | Every variant class an export emits actually has a CSS rule that takes effect in a browser |
| `node verify-components.mjs` | The reworked components behave (tabs switch, tooltip hides until hover, marquee animates, carousel scrolls) |

`verify-dsh-bundle.mjs` and `npm run smoke` run anywhere; the CSS and component
audits need `playwright` (a devDependency) and a cached Chromium.

### Examples

`examples/` holds exported pages next to their screenshots: `saas-landing`,
`ecommerce-home` and `dark-dashboard`, plus the DSH-era `apple-style` and
`coffee-demo`. `node showcase.mjs` builds the first three through the real MCP
server over stdio and re-shoots them.

---

## History

This repository previously contained a much larger product: an Electron desktop
app, a vanilla-JS dashboard, a React 19 client, Yjs real-time collaboration,
JSX bidirectional sync, a scraped design-library catalog, and a built-in LLM
channel — 82 tools in total. That surface was removed in the **route B refactor**
because it was not reachable from the MCP server, not verifiable, or actively
drifted from the code (much of the documentation described features that had been
deleted, and the capability manifest advertised tools that were never registered).

Everything that described that removed product was deleted rather than left to
mislead: `DESIGN.md`, `PRD.md`, `prism-product-definition-v2.md`,
`docs/archive/*`, the dated V2.0 plans, and — for the same reason — the refactor
plan itself, which tracked a target surface (22 tools) the implementation never
had and quoted numbers that every later change invalidated.

Two later cleanups followed the refactor: the component catalog was trimmed from
45 to 38 types (removing entries that could not do anything meaningful in a static
export, or duplicated another type), and the dead layout geometry layer was
deleted. Then came the [DeepSeek Harness integration](docs/dsh-integration.md) —
an MCP connection plus its preview panel, and the only part of this repository
that talks to another application.

What remains is this README, its [Chinese translation](./README.zh-CN.md), and the
integration guide with its
[Chinese translation](./docs/dsh-integration.zh-CN.md). `src/` is the source of
truth.

## License

MIT.
