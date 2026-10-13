/**
 * Client half of the Prism design bundle: the live preview panel.
 *
 * Two ways in, one panel:
 *   - the left rail gets a **Prism Preview** entry that selects a main-column
 *     panel — where people look first;
 *   - the right Sidebar gets a tab type of the same panel, opened from its guide.
 *
 * The panel polls the artifact the Prism `design_preview_sync` tool writes,
 * compares the revision stamped into the document, and re-renders when it
 * changes — so every time the agent edits the design and syncs, the panel
 * follows without the user doing anything.
 *
 * The artifact is a complete standalone HTML document, so it is shown in an
 * iframe via `srcDoc`. That is deliberate and specific to this panel: the
 * preview is a *different design system under test* (its own CSS variables,
 * fonts and colours), so it must NOT inherit the Harness theme. The panel's own
 * chrome (header, status line, empty state) does use theme tokens.
 *
 * Loaded through the browser module table, so React comes from `require('react')`
 * and no Harness Client package is imported.
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-prism-design',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const TAB_KIND = 'prism-preview';
    const DEF_ID = 'dsh-plugin-prism-design/preview';
    /** Main-column panel id; the left-rail entry addresses it. */
    const PANEL_ID = 'prism-preview';
    const TITLE = 'Prism Preview';

    /**
     * Fallback artifact location. The Host row always supplies one through the
     * Slot `inject` factory; this default is workspace-relative, so it stays
     * meaningful on machines that never saw the checkout it was written in.
     */
    const DEFAULT_PREVIEW_PATH = '.prism-preview/design.html';
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

    /**
     * Remote calls answer with an envelope: `{ ok: true, value }` on success and
     * `{ ok: false, error }` on failure. Reading `result.data` straight off it
     * silently yields `undefined`, which decodes to an empty document — so unwrap
     * first, and keep accepting a bare value for any path that answers unwrapped.
     */
    function unwrapRemote(result) {
      if (result && typeof result === 'object' && typeof result.ok === 'boolean') {
        return result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error };
      }
      return { ok: true, value: result };
    }

    /** Render a Remote failure (code + message + details) into one line. */
    function remoteErrorText(error) {
      if (!error) return 'unknown error';
      if (typeof error === 'string') return error;
      const parts = [];
      if (error.code) parts.push(String(error.code));
      if (error.message) parts.push(String(error.message));
      if (error.details !== undefined) {
        try {
          parts.push(JSON.stringify(error.details));
        } catch {
          parts.push(String(error.details));
        }
      }
      return parts.length > 0 ? parts.join(' · ') : String(error);
    }

    /**
     * The session the preview is read on behalf of.
     *
     * A `main` panel is root-scoped and gets no Session binding, so it tracks the
     * Client's current Session itself — the same store the right Sidebar uses.
     */
    function currentSessionKey(store) {
      try {
        const snapshot = store.getSnapshot();
        return snapshot ? snapshot.key : undefined;
      } catch {
        return undefined;
      }
    }

    function useCurrentSessionId(uiSession) {
      const store = uiSession && uiSession.adapter ? uiSession.adapter.current : undefined;
      const usable = store && typeof store.getSnapshot === 'function' ? store : undefined;
      const [sessionId, setSessionId] = React.useState(() => currentSessionKey(usable));
      React.useEffect(() => {
        if (!usable || typeof usable.subscribe !== 'function') return undefined;
        const sync = () => setSessionId(currentSessionKey(usable));
        sync();
        const unsubscribe = usable.subscribe(sync);
        return typeof unsubscribe === 'function' ? unsubscribe : undefined;
      }, [usable]);
      return sessionId;
    }

    /** The prism mark: a triangle with the ray entering and leaving it. */
    function PrismIcon(props) {
      const size = props.size || 18;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 18 18',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M8.6 2.4 16 15.2H1.2L8.6 2.4Z' }),
        h('path', { d: 'M8.6 2.4v12.8' }),
        h('path', { d: 'M1.2 9 8.6 9' })
      );
    }

    // ---------------------------------------------------------------- panel ---

    function Panel(props) {
      const readPreview = props.readPreview;
      // Shown in the empty state; the actual read is bound in the Slot `inject`.
      const previewPath = props.previewPath || DEFAULT_PREVIEW_PATH;
      const pollMs = props.pollIntervalMs || DEFAULT_POLL_MS;
      const isMain = props.main === true;

      const [html, setHtml] = React.useState(null);
      const [revision, setRevision] = React.useState(null);
      const [status, setStatus] = React.useState('loading');
      const [message, setMessage] = React.useState('');
      const [detail, setDetail] = React.useState('');
      const [watching, setWatching] = React.useState(true);

      // One poll loop. Reading the whole document is cheap (tens of KB) and
      // avoids depending on a version field whose semantics are not guaranteed.
      React.useEffect(() => {
        if (typeof readPreview !== 'function') {
          console.log('[prism-design] panel mounted with no reader bound', {
            main: isMain,
            session: props.sessionInfo,
          });
          setStatus('unavailable');
          setDetail(`reader: none · session: ${props.sessionInfo || 'unknown'}`);
          setMessage(
            'No Session is bound to this panel yet. Open or start a Session, then sync the design again.'
          );
          return undefined;
        }
        console.log('[prism-design] panel mounted with a bound reader', {
          main: isMain,
          session: props.sessionInfo,
        });
        let cancelled = false;
        let timer = null;
        let controller = null;

        const readOnce = async () => {
          controller = new AbortController();
          try {
            const answer = unwrapRemote(await readPreview(controller.signal));
            if (cancelled) return;
            if (!answer.ok) {
              setStatus('error');
              setDetail(`remote error: ${remoteErrorText(answer.error)}`);
              setMessage('The panel could not read the preview artifact.');
              return;
            }
            const payload = answer.value;
            const bytes = payload && (payload.data !== undefined ? payload.data : payload.bytes);
            const text = decodeUtf8(bytes);
            if (!text) {
              setStatus('empty');
              setDetail(
                payload
                  ? `read returned ${Object.keys(payload).join(', ') || 'an empty object'}`
                  : 'read returned nothing'
              );
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
            setDetail('');
          } catch (error) {
            const text = error && (error.message || String(error));
            console.log('[prism-design] preview read failed', { main: isMain, error: text });
            if (cancelled) return;
            // A missing file is the normal "nothing generated yet" state, not a fault.
            setStatus('missing');
            setDetail(`read failed: ${text || 'unknown error'}`);
            setMessage(
              'No preview yet — or the panel could not read the artifact. Ask the agent to build a design, then it calls design_preview_sync.'
            );
          } finally {
            if (!cancelled && watching) timer = setTimeout(readOnce, pollMs);
          }
        };

        readOnce();
        return () => {
          cancelled = true;
          if (timer) clearTimeout(timer);
          if (controller) controller.abort();
        };
      }, [readPreview, pollMs, watching]);

      const chrome = {
        display: 'flex',
        flexDirection: 'column',
        height: isMain ? 'auto' : '100%',
        minHeight: isMain ? 'calc(100vh - 104px)' : 0,
        background: 'var(--dsw-alias-bg, #ffffff)',
        color: 'var(--dsw-alias-text, #1a1a1a)',
      };
      const header = {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: isMain ? '10px 16px' : '6px 10px',
        borderBottom: '1px solid var(--dsw-alias-border, rgba(0,0,0,0.12))',
        background: 'var(--dsw-alias-bg-secondary, rgba(127,127,127,0.08))',
        fontSize: isMain ? '13px' : '12px',
        fontWeight: 600,
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
      const body = isMain
        ? { flex: '1 1 auto', minHeight: '70vh', position: 'relative' }
        : { flex: '1 1 auto', minHeight: 0, position: 'relative' };
      const frame = {
        width: '100%',
        height: '100%',
        border: '0',
        display: 'block',
        background: '#fff',
      };
      const empty = {
        margin: isMain ? '40px auto' : '16px',
        maxWidth: '44rem',
        padding: isMain ? '20px 24px' : '16px',
        fontSize: isMain ? '14px' : '12px',
        lineHeight: 1.6,
        border: '1px dashed var(--dsw-alias-border, rgba(0,0,0,0.25))',
        borderRadius: '10px',
        background: 'var(--dsw-alias-bg, #ffffff)',
        color: 'var(--dsw-alias-text, #1a1a1a)',
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
              title: watching
                ? 'Pause following the preview file'
                : 'Resume following the preview file',
            },
            watching ? 'Pause' : 'Follow'
          )
        ),
        h(
          'div',
          { style: body },
          html
            ? h('iframe', {
                // Standalone design document, shown without navigation or forms.
                //
                // `allow-scripts` only: a preview may animate, but the artifact is
                // agent-authored (and `html_fragment` / webpage imports can carry
                // markup), so it must not share the Harness origin. Adding
                // `allow-same-origin` would make the framed document same-origin
                // with the app — its scripts could then reach the parent document
                // and even strip its own sandbox attribute (Chromium warns exactly
                // about that pairing).
                srcDoc: html,
                sandbox: 'allow-scripts',
                style: frame,
                title: TITLE,
              })
            : h(
                'div',
                { style: empty },
                h('div', { style: { fontWeight: 600, marginBottom: 6 } }, message || 'Loading preview…'),
                h(
                  'div',
                  { style: { opacity: 0.75, wordBreak: 'break-all', fontSize: '0.92em' } },
                  previewPath
                ),
                h(
                  'div',
                  { style: { opacity: 0.6, marginTop: 10, fontSize: '0.85em' } },
                  `state: ${status} · polling every ${pollMs} ms`
                ),
                detail
                  ? h(
                      'div',
                      {
                        style: {
                          marginTop: 6,
                          fontSize: '0.85em',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          wordBreak: 'break-all',
                        },
                      },
                      detail
                    )
                  : null
              )
        )
      );
    }

    /** The main-column face: binds the read to the Client's current Session. */
    function MainPanel(props) {
      const sessionId = useCurrentSessionId(props.uiSession);
      const readPreview = React.useMemo(
        () =>
          sessionId && typeof props.makeReader === 'function'
            ? props.makeReader(sessionId)
            : undefined,
        [sessionId, props.makeReader]
      );
      React.useEffect(() => {
        console.log('[prism-design] main panel mounted', {
          sessionId: sessionId ? 'yes' : 'none',
          makeReader: typeof props.makeReader,
          uiSession: props.uiSession ? 'yes' : 'none',
        });
      }, []);
      return h(Panel, {
        readPreview,
        previewPath: props.previewPath,
        pollIntervalMs: props.pollIntervalMs,
        sessionInfo: sessionId ? `bound (${String(sessionId).slice(0, 12)}…)` : 'none',
        main: true,
      });
    }

    // --------------------------------------------------------------- plugin ---

    return {
      // `slots` for the registration seats, `sidebarRightTabs` for the right
      // Sidebar tab type, `remote` (and its `workspaceFiles` face) for reading the
      // artifact. `uiSession` is reached through `ctx.get` instead: a hard inject
      // would stall the whole plugin when that service is absent.
      inject: ['slots', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles'],

      apply(ctx, config = {}) {
        const settings = (config && typeof config === 'object' && config) || {};
        const previewPath = settings.previewPath || DEFAULT_PREVIEW_PATH;
        const pollIntervalMs = settings.pollIntervalMs || DEFAULT_POLL_MS;

        let uiSession;
        try {
          uiSession = ctx.get('uiSession');
        } catch {
          uiSession = undefined;
        }

        console.log('[prism-design] client half applied', {
          previewPath,
          pollIntervalMs,
          uiSession: uiSession !== undefined,
        });

        const makeReader = (sessionId) => (signal) =>
          ctx.remote.workspaceFiles.readBytes(sessionId, previewPath, {}, signal);

        // Left rail: a main-column panel, selected from the sidebar entry below.
        ctx.effect(
          () =>
            ctx.slots.inject('main', () =>
              ctx.slots.register(
                {
                  name: 'main',
                  key: PANEL_ID,
                  inject: () => ({ uiSession, makeReader, previewPath, pollIntervalMs }),
                },
                MainPanel
              )
            ),
          'prism-design: preview main panel'
        );

        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.panellist', () =>
              ctx.slots.register(
                {
                  name: 'sidebar.panellist',
                  id: PANEL_ID,
                  order: 40,
                  label: () => TITLE,
                },
                PrismIcon
              )
            ),
          'prism-design: preview rail entry'
        );

        // Right Sidebar: the tab type, and the body it dispatches to.
        ctx.effect(
          () =>
            ctx.sidebarRightTabs.register({
              id: DEF_ID,
              kind: TAB_KIND,
              title: () => TITLE,
              // Surfaced in the Sidebar's guide, which is how the user opens it.
              // GuideBody reads both fields as thunks (`entry.title()`,
              // `entry.description?.()`), so a plain string for `description`
              // throws inside the guide and takes the whole tab down with it.
              guide: [
                {
                  id: 'open-preview',
                  order: 0,
                  title: () => TITLE,
                  description: () => 'Live preview of the design Prism generated.',
                },
              ],
            }),
          'prism-design: preview tab type'
        );

        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.right.pane.tab', () =>
              ctx.slots.register(
                {
                  name: 'sidebar.right.pane.tab',
                  key: DEF_ID,
                  // The Slot `inject` factory: the tab's session id comes from the
                  // owner, and the bound read closes over it plus the row config.
                  inject: (sessionId) => ({
                    previewPath,
                    pollIntervalMs,
                    readPreview: makeReader(sessionId),
                  }),
                },
                Panel
              )
            ),
          'prism-design: preview tab body'
        );
      },
    };
  },
});
