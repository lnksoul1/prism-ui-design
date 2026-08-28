import { useDesignStore } from "../stores/design";
import { undo, redo } from "../collab/edits";

const BP_LABELS = { desktop: "桌面", tablet: "平板", mobile: "手机" } as const;

export function Topbar() {
  const state = useDesignStore((s) => s.state);
  const connected = useDesignStore((s) => s.connected);
  const breakpoint = useDesignStore((s) => s.breakpoint);
  const setBreakpoint = useDesignStore((s) => s.setBreakpoint);

  return (
    <header className="topbar">
      <span className="logo">✦ Prism V2</span>
      <span className="project-name">{state?.projectName ?? "加载中…"}</span>
      <span className={`status-dot ${connected ? "on" : "off"}`} title={connected ? "已连接" : "未连接"} />
      <div className="bp-switcher">
        {(Object.keys(BP_LABELS) as Array<keyof typeof BP_LABELS>).map((bp) => (
          <button
            key={bp}
            className={`bp-btn ${breakpoint === bp ? "active" : ""}`}
            onClick={() => setBreakpoint(bp)}
          >
            {BP_LABELS[bp]}
          </button>
        ))}
      </div>
      <div className="spacer" />
      <button className="toolbar-btn" onClick={() => undo()} title="撤销（协同）">↶</button>
      <button className="toolbar-btn" onClick={() => redo()} title="重做（协同）">↷</button>
    </header>
  );
}
