# dsh-plugin-prism-design

Prism's design tools inside the DeepSeek Harness: it connects the Prism MCP server
and adds a live preview panel.

- **MCP connection** — Prism's 42 tools and 4 resources, callable as `mcp__prism__<tool>`
- **Left-rail panel** — a **Prism Preview** entry that opens the design in the main column
- **Right-Sidebar tab** — the same panel, opened from that column's guide (its **Start** tab)
- **Self-contained** — it packages the server it launches and derives every path at load
  time, so it needs no checkout, no build step, and no machine-specific configuration

## Install

```
dsh plugin add dsh-plugin-prism-design
```

Or from a checkout of [prism-ui-design](https://github.com/lnksoul1/prism-ui-design):

```
npm run build && node dsh-plugin/scripts/copy-server.mjs
# in DSH: plugin_manager · install_bundle · target: <checkout>/dsh-plugin
```

Requirement: `node` on `PATH` — the MCP row spawns `node <package>/server/index.js`.

## What it writes

| Path | What lives there |
|---|---|
| `<DSH_HOME>/prism/design.html` | The live-preview artifact `design_preview_sync` overwrites |
| `<DSH_HOME>/prism/projects` | Projects written by `design_save_project` |

Both are overridable from your profile patch layer — see
[docs/dsh-integration.md](https://github.com/lnksoul1/prism-ui-design/blob/main/docs/dsh-integration.md)
for the full row config, the client-half contracts, and troubleshooting.

## The panel follows `design_preview_sync`

The panel polls that artifact every 1500 ms and re-renders when the revision stamped
into the document changes. Ask the agent to call `mcp__prism__design_preview_sync`
after each step when you want to watch a page being built.

## License

MIT.
