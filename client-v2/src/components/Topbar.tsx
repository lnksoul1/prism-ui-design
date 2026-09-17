import { useRef, useState } from "react";
import { useDesignStore } from "../stores/design";
import { undo, redo } from "../collab/edits";
import { api } from "../api";

const BP_LABELS = { desktop: "桌面", tablet: "平板", mobile: "手机" } as const;

/** 提示词简报弹层: 只读 textarea + 复制（优先剪贴板 API，回退选中文本复制）。 */
function PromptModal({ brief, onClose }: { brief: string; onClose: () => void }) {
  const showToast = useDesignStore((s) => s.showToast);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(brief);
      showToast("提示词已复制");
    } catch {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.select();
        showToast(document.execCommand("copy") ? "提示词已复制" : "复制失败，请手动选择复制");
      } else {
        showToast("复制失败，请手动选择复制");
      }
    }
  };

  return (
    <div
      className="prompt-modal"
      data-testid="prompt-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="prompt-modal-card">
        <div className="prompt-modal-head">
          <span>提示词简报</span>
          <button className="prompt-modal-close" onClick={onClose}>关闭</button>
        </div>
        <textarea ref={taRef} className="prompt-textarea" readOnly value={brief} />
        <div className="prompt-modal-actions">
          <button className="prompt-copy-btn" data-testid="prompt-copy" onClick={() => void copy()}>
            复制
          </button>
        </div>
      </div>
    </div>
  );
}

export function Topbar() {
  const state = useDesignStore((s) => s.state);
  const connected = useDesignStore((s) => s.connected);
  const breakpoint = useDesignStore((s) => s.breakpoint);
  const setBreakpoint = useDesignStore((s) => s.setBreakpoint);
  const linkMode = useDesignStore((s) => s.linkMode);
  const setLinkMode = useDesignStore((s) => s.setLinkMode);
  const playMode = useDesignStore((s) => s.playMode);
  const setPlayMode = useDesignStore((s) => s.setPlayMode);
  const showToast = useDesignStore((s) => s.showToast);
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openPrompt = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await api.promptBrief();
      setBrief(res.brief);
    } catch {
      showToast("提示词生成失败");
    } finally {
      setLoading(false);
    }
  };

  const tidy = async (): Promise<void> => {
    try {
      const res = await api.tidyLayout();
      showToast(`已整理 ${res.applied} 个组件`);
    } catch {
      showToast("整理失败");
    }
  };

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
      <button
        className={`toolbar-btn ${linkMode ? "active" : ""}`}
        onClick={() => setLinkMode(!linkMode)}
        title="原型连线模式"
      >
        ⇄
      </button>
      <button
        className={`toolbar-btn toolbar-btn-text ${playMode ? "active" : ""}`}
        onClick={() => setPlayMode(!playMode)}
        title="预览模式"
      >
        {playMode ? "退出预览" : "预览"}
      </button>
      <button
        className="toolbar-btn toolbar-btn-text"
        onClick={() => void tidy()}
        title="一键整理页面布局（重叠成组移动 + 语义间距）"
      >
        整理
      </button>
      <button
        className="toolbar-btn toolbar-btn-text"
        disabled={loading}
        onClick={() => void openPrompt()}
        title="导出给 AI 编码工具的提示词简报"
      >
        {loading ? "生成中" : "提示词"}
      </button>
      <div className="spacer" />
      <button className="toolbar-btn" onClick={() => undo()} title="撤销（协同）">↶</button>
      <button className="toolbar-btn" onClick={() => redo()} title="重做（协同）">↷</button>
      {brief !== null && <PromptModal brief={brief} onClose={() => setBrief(null)} />}
    </header>
  );
}
