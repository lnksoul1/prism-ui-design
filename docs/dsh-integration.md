# Prism in DeepSeek Harness

**中文文档：[dsh-integration.zh-CN.md](./dsh-integration.zh-CN.md)**

Prism is an MCP server, and DSH ships an MCP client, so this integration is a
configuration-only bundle plus one small UI panel. The bundle lives in
[`dsh-plugin/`](../dsh-plugin/).

## What you get

| Piece | Effect |
|---|---|
| MCP connection | Prism's 42 tools become callable as `mcp__prism__<tool>`, e.g. `mcp__prism__design_add_component` |
| Live preview panel | A **Prism Preview** tab in the right Sidebar that follows the design as it changes |
| Guide entry | The panel is opened from the Sidebar guide, so no file needs to be opened first |

## How the live preview works

```
agent edits the design        design_preview_sync()        panel polls the file
──────────────────────►  ──────────────────────────►  ──────────────────────────►
mcp__prism__design_*     writes ONE stable HTML file   revision changed → re-render
```

1. `design_preview_sync` exports the current design as one complete standalone
   HTML document (inline styles, no external requests) and overwrites a single
   path:
   - `PRISM_PREVIEW_FILE` if set, else `<cwd>/.prism-preview/design.html`.
2. The document carries a `<meta name="prism-preview-revision">` stamp, so a
   viewer can tell a real change from a rewrite of identical content.
3. The panel reads that file every `pollIntervalMs` (default 1500 ms), compares
   the revision, and re-renders the iframe when it changes.

Because the artifact is one stable path rather than a timestamped file per call,
any file watcher can follow it — the panel, an editor, or a browser.

## Install

Installation runs through `plugin_manager`; do not hand-edit the profile's
`package.json` or `cordis.patch.yml`.

From a session with Full access (Creator mode), ask the agent to install the
bundle, or use the **Plugins** page in the Web sidebar:

- `plugin_manager` · `action: install_bundle` · `target: D:\Prism\dsh-plugin`

Then confirm it took effect:

```
plugin_manager · action: list_bundles      # the bundle is listed, application: applied
```

A new Host bundle can activate through HMR. Replacing an already-installed
package needs a **restart** to load a fresh JavaScript module generation, and a
changed Client bundle needs a page reload.

### Verify the MCP half independently

Once the MCP row is live, Prism's tools appear under the `prism` namespace. The
cheapest proof is a read-only call:

```
mcp__prism__design_get_state
mcp__prism__design_list_capabilities
```

Both run without touching the design. If they are absent, the MCP row failed to
activate — check the profile log rather than the panel, because the panel and the
MCP row fail independently.

## Prerequisites

- `node` must be resolvable by the Harness process (the bundle spawns
  `node D:\Prism\dist\index.js`). Build first: `npm run build`.
- The absolute path in `dsh-plugin/cordis.patch.yml` must match this checkout. Edit
  `args[0]` and the three `PRISM_*` paths if Prism lives elsewhere.

## Configuration

Both rows are configured in [`dsh-plugin/cordis.patch.yml`](../dsh-plugin/cordis.patch.yml)
and can be overridden from your profile patch layer:

| Row | Field | Default | Meaning |
|---|---|---|---|
| `mcp-prism` | `command` / `args` | `node` + `D:\Prism\dist\index.js` | How to start the server |
| `mcp-prism` | `toolCallTimeoutMs` | `120000` | Per-call timeout; raising it helps screenshot calls |
| `mcp-prism` | `failOnStartupError` | `true` | Refuse activation instead of silently starting with no tools |
| `prism-design-panel` | `previewPath` | `D:\Prism\.prism-preview\design.html` | Must equal the server's `PRISM_PREVIEW_FILE` |
| `prism-design-panel` | `pollIntervalMs` | `1500` | Preview refresh interval |

### Why autosave is off

The patch sets `PRISM_AUTOSAVE=off` and `PRISM_AUTOLOAD=off`. With them on, the
server silently restores the last saved design, so a new session starts from
stale state instead of an empty document. Turn them on only if you want that.

## Prompting the agent

The preview only follows when the agent syncs it. State this once in the session
(or add it to a persona) so it does not drift:

> After changing the design, call `mcp__prism__design_preview_sync` so the Prism
> Preview panel updates.

A typical run:

```
mcp__prism__design_init            project_name="Coffee Roastery", base_color="#8B5E3C"
mcp__prism__design_semantic_style  adjectives=["温暖","优雅"]
mcp__prism__design_apply_template  template="saas_landing"
mcp__prism__design_preview_sync    → the panel now shows the page
mcp__prism__design_audit_accessibility level="AA"
mcp__prism__design_add_component   … then sync again
```

## Verification status

Be aware of what has and has not been checked.

**Verified**

- The preview artifact: written, self-contained (no remote references), stamped
  with a revision, and observed changing on disk when the design changes
  (`verify-preview.mjs`).
- The tool surface: 42 tools registered over a real stdio handshake, the
  capability manifest matches the registry exactly.
- The bundle's structure only, via `verify-dsh-bundle.mjs`: manifest contract,
  export targets, YAML plugin names resolvable against the shipped runtime,
  JavaScript parses, and the Client half uses the documented module-loader shape
  and imports no Harness Client package.

**Not verified**

- That DSH loads the bundle, and that the panel renders. This environment has no
  `plugin_manager` tool, no `dsh` CLI, and cannot restart the running Harness, so
  the bundle has never been activated. The install step above is the first real
  test.
- The panel's own text is not routed through the Client locale service, so it is
  English-only.
- The iframe deliberately does **not** inherit the Harness theme. That is
  intentional — the preview is a different design system under test, and it has
  to show its own colours — but it means the panel is not a themed Harness page
  in the way `references/practices.md` describes for plugin UI.
