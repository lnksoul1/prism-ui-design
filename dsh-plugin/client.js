/**
 * Client half of the Prism design bundle: the live preview panel.
 *
 * Registers one page type in the right Sidebar and renders the design artifact
 * that the Prism `design_preview_sync` tool writes. The panel polls that file's
 * content, compares the revision stamped into the document, and re-renders when
 * it changes — so every time the agent edits the design and syncs, the panel
 * follows without the user doing anything.
 *
 * The artifact is a complete standalone HTML document, so it is shown in an
 * iframe via `srcDoc`. That is deliberate and specific to this panel: the
 * preview is a *different design system under test* (its own CSS variables,
 * fonts and colours), so it must NOT inherit the Harness theme — the UI practice
 * of rendering plugin pages as slot components with `--dsw-alias-*` tokens
 * applies to Harness UI, and this panel is a viewport onto foreign output. The
 * panel's own chrome (header, status line, empty state) does use theme tokens.
 *
 * Loaded through the browser module table, so React comes from `require('react')`
 * and no Harness Client package is imported.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-prism-design',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const TAB_KIND = 'prism-preview';
    const DEF_ID = '@local/dsh-prism-design/preview';
    const TITLE = 'Prism Preview';

    /** Default artifact location; the Host row's config can override it. */
    const DEFAULT_PREVIEW_PATH = 'D:\\Prism\\.prism-preview\\design.html';
    const DEFAULT_POLL_MS = 1500;

    /** Pull the revision the exporter stamped into the document. */
    function revisionOf(html) {
      const m = /<meta name="prism-preview-revision" content="(\d+)"/.exec(html);
      return m ? m[1] : null;
    }

    function decodeUtf8(bytes) {
      if (typeof bytes === 'string') return bytes;
      if (!bytes) return '';
      try {
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        return '';
      }
    }

    // ---------------------------------------------------------------- panel ---

    function Panel(props) {
      const remote = props.remote;
      const previewPath = props.previewPath || DEFAULT_PREVIEW_PATH;
      const pollMs = props.pollIntervalMs || DEFAULT_POLL_MS;

      const [html, setHtml] = React.useState(null);
      const [revision, setRevision] = React.useState(null);
      const [status, setStatus] = React.useState('loading');
      const [message, setMessage] = React.useState('');
      const [watching, setWatching] = React.useState(true);

      // One poll loop. Reading the whole document is cheap (tens of KB) and
      // avoids depending on a version field whose semantics are not guaranteed.
      React.useEffect(() => {
        if (!remote || !remote.workspaceFiles) {
          setStatus('unavailable');
          setMessage('The workspace file reader is not available in this page.');
          return undefined;
        }
        let cancelled = false;
        let timer = null;

        const readOnce = async () => {
          try {
            const result = await remote.workspaceFiles.readBytes(previewPath, {});
            if (cancelled) return;
            const text = decodeUtf8(result && result.data);
            if (!text) {
              setStatus('empty');
              setMessage('The preview file is empty.');
              return;
            }
            const rev = revisionOf(text);
            setRevision((prev) => {
              if (prev !== rev) setHtml(text);
              return rev;
            });
            setStatus('ready');
            setMessage('');
          } catch {
            if (cancelled) return;
            // A missing file is the normal "nothing generated yet" state, not a fault.
            setStatus('missing');
            setMessage(
              'No preview yet. Ask the agent to build a design, then it calls design_preview_sync.'
            );
          } finally {
            if (!cancelled && watching) timer = setTimeout(readOnce, pollMs);
          }
        };

        readOnce();
        return () => {
          cancelled = true;
          if (timer) clearTimeout(timer);
        };
      }, [remote, previewPath, pollMs, watching]);

      const chrome = {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--dsw-alias-bg, #ffffff)',
        color: 'var(--dsw-alias-text, #1a1a1a)',
      };
      const header = {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
        borderBottom: '1px solid var(--dsw-alias-border, rgba(0,0,0,0.12))',
        fontSize: '12px',
        opacity: 0.85,
        flex: '0 0 auto',
      };
      const button = {
        marginLeft: 'auto',
        font: 'inherit',
        fontSize: '12px',
        padding: '2px 8px',
        borderRadius: '4px',
        border: '1px solid var(--dsw-alias-border, rgba(0,0,0,0.12))',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
      };
      const body = { flex: '1 1 auto', minHeight: 0, position: 'relative' };
      const frame = { width: '100%', height: '100%', border: '0', display: 'block', background: '#fff' };
      const empty = {
        padding: '16px',
        fontSize: '12px',
        lineHeight: 1.6,
        opacity: 0.75,
      };

      const dot =
        status === 'ready'
          ? 'var(--dsw-alias-success, #4AA367)'
          : status === 'loading'
            ? 'var(--dsw-alias-warning, #C99800)'
            : 'var(--dsw-alias-border, rgba(0,0,0,0.2))';

      return h(
        'div',
        { style: chrome },
        h(
          'div',
          { style: header },
          h('span', {
            style: { width: 8, height: 8, borderRadius: '50%', background: dot, flex: '0 0 auto' },
            'aria-hidden': true,
          }),
          h('span', null, revision ? `${TITLE} · ${revision}` : TITLE),
          h(
            'button',
            {
              type: 'button',
              style: button,
              onClick: () => setWatching((w) => !w),
              title: watching ? 'Pause following the preview file' : 'Resume following the preview file',
            },
            watching ? 'Pause' : 'Follow'
          )
        ),
        h(
          'div',
          { style: body },
          html
            ? h('iframe', {
                // Standalone design document. Sandboxed to scripts + same-origin
                // (a design preview may animate) with navigation and forms removed.
                srcDoc: html,
                sandbox: 'allow-scripts allow-same-origin',
                style: frame,
                title: TITLE,
              })
            : h('div', { style: empty }, h('div', null, message || 'Loading preview…'), h('div', { style: { opacity: 0.7, marginTop: 8, wordBreak: 'break-all' } }, previewPath))
        )
      );
    }

    // --------------------------------------------------------------- plugin ---

    return {
      // `slots` for the registration seat; `remote` for reading the artifact.
      inject: ['slots', 'remote'],

      apply(ctx) {
        const config = (ctx.config && typeof ctx.config === 'object' && ctx.config) || {};
        const previewPath = config.previewPath || DEFAULT_PREVIEW_PATH;
        const pollIntervalMs = config.pollIntervalMs || DEFAULT_POLL_MS;

        ctx.effect(() =>
          ctx.sidebarRightTabs.register({
            id: DEF_ID,
            kind: TAB_KIND,
            title: () => TITLE,
            // Surfaced in the Sidebar's guide, which is how the user opens it.
            guide: [{ id: 'open-preview', title: 'Prism Preview', description: 'Live preview of the design Prism generated.' }],
          })
        );

        ctx.effect(() =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: DEF_ID }, (slotProps) =>
            h(Panel, {
              ...slotProps,
              previewPath,
              pollIntervalMs,
            })
          )
        );
      },
    };
  },
});
