import { useEffect, useState } from "react";
import { useDesignStore } from "../../stores/design";
import { editComponent } from "../../collab/edits";
import { isBoxModeComponent } from "../../lib/boxMode";
import type { ComponentNode } from "../../types";

const TEXT_PROP_KEYS = ["text", "title", "label", "button_text", "cta_text", "heading", "brand"];

export function InspectorPanel() {
  const state = useDesignStore((s) => s.state);
  const selection = useDesignStore((s) => s.selection);
  const breakpoint = useDesignStore((s) => s.breakpoint);

  const page = state?.pages?.find((p) => p.id === state.currentPageId) ?? state?.pages?.[0];
  const node = selection.length === 1 ? findNode(page?.components ?? [], selection[0]) : null;

  if (!node) return <div className="panel-title">检查器（未选中组件）</div>;

  return (
    <div className="inspector">
      <h3 className="panel-title">{node.name || node.type}{node.variant ? ` · ${node.variant}` : ""}</h3>
      {isBoxModeComponent(node) && <BoxModeSection node={node} />}
      <PropsSection node={node} />
      <StyleSection node={node} breakpoint={breakpoint} />
    </div>
  );
}

function findNode(nodes: ComponentNode[], id: string): ComponentNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children ?? [], id);
    if (found) return found;
  }
  return null;
}

/** 盒子模式区：编辑器只控外层容器，内部配置以 JSON 形式维护、预览时挂载。 */
function BoxModeSection({ node }: { node: ComponentNode }) {
  const [json, setJson] = useState(() => JSON.stringify(node.boxMode?.internalConfig ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(node.boxMode?.enabled ?? true);

  const patchBoxMode = (patch: { enabled?: boolean; internalConfig?: Record<string, unknown> }): void => {
    editComponent(node.id, (draft) => {
      const prev = draft.boxMode as { enabled: boolean; internalConfig: Record<string, unknown> } | undefined;
      draft.boxMode = {
        enabled: patch.enabled ?? prev?.enabled ?? false,
        internalConfig: { ...(prev?.internalConfig ?? {}), ...(patch.internalConfig ?? {}) },
      };
    });
  };

  const commitJson = (): void => {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      setError(null);
      patchBoxMode({ enabled, internalConfig: parsed });
    } catch {
      setError("JSON 格式错误，未提交");
    }
  };

  return (
    <section className="insp-section">
      <div className="insp-title">盒子模式</div>
      <label className="insp-row">
        <span>启用</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            patchBoxMode({ enabled: e.target.checked });
          }}
        />
      </label>
      <label className="insp-row insp-row-column">
        <span>internalConfig</span>
        <textarea
          aria-label="internalConfig"
          className="insp-json"
          value={json}
          onChange={(e) => setJson(e.target.value)}
          onBlur={commitJson}
          rows={6}
        />
      </label>
      {error && <div className="insp-error">{error}</div>}
    </section>
  );
}

function PropsSection({ node }: { node: ComponentNode }) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const key of TEXT_PROP_KEYS) {
      const v = node.props[key];
      if (typeof v === "string") next[key] = v;
    }
    setValues(next);
  }, [node]);

  return (
    <section className="insp-section">
      <div className="insp-title">属性</div>
      {Object.entries(values).map(([key, value]) => (
        <label key={key} className="insp-row">
          <span>{key}</span>
          <input value={value} readOnly />
        </label>
      ))}
    </section>
  );
}

function StyleSection({ node, breakpoint }: { node: ComponentNode; breakpoint: string }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const base = node.baseStyle || {};
  const override = breakpoint === "desktop" ? {} : node.breakpointOverrides?.[breakpoint as "mobile" | "tablet"] || {};

  useEffect(() => {
    const next: Record<string, string> = { ...base };
    if (breakpoint !== "desktop") {
      for (const [k, v] of Object.entries(override)) {
        if (typeof v === "string") next[k] = v;
      }
    }
    setDraft(next);
  }, [node.id, breakpoint]);

  const commit = (key: string, value: string): void => {
    if (breakpoint === "desktop") {
      const next = { ...draft, [key]: value };
      editComponent(node.id, (entry) => {
        const prev = (entry.baseStyle as Record<string, string> | undefined) ?? {};
        entry.baseStyle = { ...prev, ...next };
      });
    } else {
      // 断点模式只提交与基线不同的键
      const diff: Record<string, string> = {};
      for (const [k, v] of Object.entries({ ...draft, [key]: value })) {
        if (base[k] !== v) diff[k] = v;
      }
      editComponent(node.id, (entry) => {
        const prev = (entry.breakpointOverrides as Record<string, Record<string, string>> | undefined) ?? {};
        entry.breakpointOverrides = { ...prev, [breakpoint]: { ...(prev[breakpoint] ?? {}), ...diff } };
      });
    }
  };

  const keys = Object.keys(draft);
  return (
    <section className="insp-section">
      <div className="insp-title">{breakpoint === "desktop" ? "基础样式" : `${breakpoint} 差异样式`}</div>
      {keys.map((key) => (
        <label key={key} className="insp-row">
          <span>{key}</span>
          <input
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            onBlur={(e) => commit(key, e.target.value)}
          />
        </label>
      ))}
      <label className="insp-row">
        <span>+ 新样式键</span>
        <NewStyleKeyInput
          node={node}
          breakpoint={breakpoint}
          draft={draft}
          onAdd={(k) => setDraft({ ...draft, [k]: "" })}
        />
      </label>
    </section>
  );
}

function NewStyleKeyInput({ node, breakpoint, draft, onAdd }: {
  node: ComponentNode;
  breakpoint: string;
  draft: Record<string, string>;
  onAdd: (key: string) => void;
}) {
  const [key, setKey] = useState("");
  return (
    <input
      value={key}
      placeholder="如 fontSize"
      onChange={(e) => setKey(e.target.value)}
      onBlur={() => {
        const k = key.trim();
        if (!k || k in draft) return;
        if (breakpoint === "desktop") {
          const next = { ...draft, [k]: "" };
          editComponent(node.id, (entry) => {
            const prev = (entry.baseStyle as Record<string, string> | undefined) ?? {};
            entry.baseStyle = { ...prev, ...next };
          });
        } else {
          const next = { [k]: "" };
          editComponent(node.id, (entry) => {
            const prev = (entry.breakpointOverrides as Record<string, Record<string, string>> | undefined) ?? {};
            entry.breakpointOverrides = { ...prev, [breakpoint]: { ...(prev[breakpoint] ?? {}), ...next } };
          });
        }
        onAdd(k);
        setKey("");
      }}
    />
  );
}
