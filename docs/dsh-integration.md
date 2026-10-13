# Prism in DeepSeek Harness

**中文文档：[dsh-integration.zh-CN.md](./dsh-integration.zh-CN.md)**

Prism is an MCP server, and DSH ships an MCP client, so this integration is a
configuration-only bundle plus one UI panel. The bundle lives in
[`dsh-plugin/`](../dsh-plugin/).

## What you get

| Piece | Effect |
|---|---|
| MCP connection | Prism's 42 tools and 4 resources become callable as `mcp__prism__<tool>` |
| Left-rail panel | A **Prism Preview** entry in the sidebar rail; it opens the panel in the main column |
| Right-sidebar tab | The same panel as a right-Sidebar tab, opened from that column's guide (its **Start** tab) |

## Install

Installation runs through `plugin_manager`; do not hand-edit the profile's
`package.json` or `cordis.patch.yml`.

- `plugin_manager` · `action: install_bundle` · `target: D:\Prism\dsh-plugin`

Then confirm it took effect:

```
plugin_manager · action: list_bundles      # the bundle is listed, application: applied
```

`application: applied` means every row activated. The two rows fail
independently, so a warning names exactly which one did not (see
[Troubleshooting](#troubleshooting)).

Re-applying the bundle — or toggling it to pick up a changed Client half —
re-creates the MCP row, which restarts the Prism server process. With
`PRISM_AUTOLOAD=off` the in-memory design resets, so save before the change
(`design_save_project`) or restore after it (`design_load_project`). A page
reload picks up a changed Client half too.

## Prerequisites

- `node` must be resolvable by the Harness process (the bundle spawns
  `node D:\Prism\dist\index.js`). Build first: `npm run build`.
- The absolute paths in `dsh-plugin/cordis.patch.yml` must match this checkout:
  `args[0]` plus the three `PRISM_*` values.
- The Host row names its module by absolute **file URL**
  (`file:///D:/Prism/dsh-plugin/host-entry.mjs`). A bundle linked in from outside
  the profile resolves by package name, but a *subpath* of it does not resolve
  through the profile's module layer — such a row fails with `failed to import`.

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

The panel's Host half declares that config as a **Standard Schema**
(`Config["~standard"].validate`) rather than a Schemastery schema, for two
measured reasons:

- the Loader validates every plugin config through `Config["~standard"].validate`,
  and a plain JSON Schema object has none — the row dies with
  `Cannot read properties of undefined (reading 'validate')`;
- Schemastery cannot be imported from a bundle that lives outside the profile
  (only packages installed into the profile resolve there): a static
  `import z from '@deepseek-ai/schemastery'` fails with `ERR_MODULE_NOT_FOUND`,
  with or without a matching `peerDependencies` entry.

One consequence: the Plugins page shows this row's config as *unsupported* (it
generates no form from a non-native schema). Set the two values in the patch
layer instead.

### Why autosave is off

The patch sets `PRISM_AUTOSAVE=off` and `PRISM_AUTOLOAD=off`. With them on, the
server silently restores the last saved design, so a new session starts from
stale state instead of an empty document. Turn them on only if you want that.

## The live preview

```
agent edits the design        design_preview_sync()        panel polls the file
─────────────────────►  ──────────────────────────►  ──────────────────────────►
mcp__prism__design_*     writes ONE stable HTML file   revision changed → re-render
```

1. `design_preview_sync` exports the **current page** as one complete standalone
   HTML document (inline styles, no external requests) and overwrites a single
   path: `PRISM_PREVIEW_FILE` if set, else `<cwd>/.prism-preview/design.html`.
2. The document carries a `<meta name="prism-preview-revision">` stamp, so a
   viewer can tell a real change from a rewrite of identical content.
3. Every panel instance reads that file each `pollIntervalMs` (default 1500 ms)
   and re-renders its iframe only when the revision changes. The header carries
   the revision and a **Pause/Follow** control.

Because the artifact is one stable path rather than a timestamped file per call,
any file watcher can follow it — the panel, an editor, or a browser.

The preview follows `design_preview_sync` calls, not design mutations. Ask the
agent to sync after each step when you want to watch a page being built:

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

## Client-half contracts

These are the parts that fail *silently* or take a whole column down. Each is now
guarded by [`verify-dsh-bundle.mjs`](../verify-dsh-bundle.mjs).

| Contract | What breaks without it |
|---|---|
| Guide entries read `title` and `description` as **thunks** | `GuideBody` calls `entry.title()` and `entry.description?.()`; a string for either throws inside the guide and blanks that tab |
| Remote calls answer `{ ok, value }` / `{ ok, error }` | reading `result.data` off the envelope yields `undefined`, the bytes decode to an empty string, and the panel reports "The preview file is empty" |
| `dsh.client.inject` lists every package whose services the client half uses | the browser module table must load `@deepseek-ai/dsh-client-ui-sidebar-right` (tab registry), `@deepseek-ai/dsh-client-ui-sidebar` (rail + main column) and `@deepseek-ai/dsh-api-remotes` (file reads) |
| The preview iframe is sandboxed with `allow-scripts` **only** | `allow-scripts allow-same-origin` makes the artifact same-origin with the Harness app: its scripts could reach the parent document and even strip their own sandbox attribute |
| The Host row imports a file URL; the package root only re-exports it | a running Host keeps a module generation in Node's ESM cache — failures included, which is why the row's specifier is a file URL |

A `main` panel is root-scoped and receives **no Session binding**, so it tracks
the Client's current Session itself (`uiSession.adapter.current`) and binds the
file read to that id; the right-Sidebar tab instead receives its session id from
the Slot `inject` factory.

## Troubleshooting

The panel states its own condition in its placeholder box — read that first:

| `state:` | Meaning |
|---|---|
| `ready` | The artifact was read; the iframe renders it |
| `missing` | The read failed; the `read failed: …` line carries the Remote error |
| `empty` | The read succeeded but the payload decoded to nothing (the envelope bug above) |
| `unavailable` | The panel got no bound reader — no Session is current yet |

Console diagnostics are tagged `[prism-design]`: they log the client half
applying, a panel mounting with or without a bound reader, and every failed read.

Verify the MCP half independently — it fails independently of the panel:

```
mcp__prism__design_get_state
mcp__prism__design_list_capabilities
```

Both run without touching the design. If they are absent, the MCP row failed to
activate: check the profile log rather than the panel.

## Verification status

**Verified** — live desktop Harness, plus scripts

- The bundle installs and every row activates: `plugin_manager` reports
  `application: applied`.
- The MCP row registers **42 tools and 4 resources** over a real stdio handshake,
  and the capability manifest matches the registry exactly.
- Both panel entry points are registered in the running Client: `sidebar.panellist`
  with id `prism-preview`, `main` with key `prism-preview`, and the tab body on
  `sidebar.right.pane.tab` — observed through the Client `Slots` inspect provider.
- The read path works end to end: the panel renders a revision-stamped,
  self-contained document written by `design_preview_sync`, and follows it when
  the design changes.
- The preview artifact itself (`node verify-preview.mjs`): written, self-contained
  (no remote references), stamped, and observed changing on disk.
- Static structure (`node verify-dsh-bundle.mjs`, 38 checks): the manifest
  contract, exported paths, patch rows, JavaScript syntax, the client-half
  contracts above, and the locale file.

**Not verified**

- The panel's pixels: nothing asserts how it looks (no screenshot test).
- The panel's own text is English-only; it is not routed through the Client locale
  service.
- The iframe deliberately does **not** inherit the Harness theme. That is
  intentional — the preview is a different design system under test and has to
  show its own colours — so the panel is not a themed Harness page in the way
  `references/practices.md` describes for plugin UI.
