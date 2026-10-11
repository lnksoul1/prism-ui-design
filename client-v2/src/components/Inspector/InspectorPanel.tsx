import { useEffect, useState } from "react";
import { useDesignStore } from "../../stores/design";
import { editComponent } from "../../collab/edits";
import { isBoxModeComponent } from "../../lib/boxMode";
import { PAGE_LINK_TRANSITIONS, DEFAULT_LINK_TRANSITION } from "../../lib/transitions";
import { api } from "../../api";
import type { ComponentNode, DesignStateView } from "../../types";

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
      <GeometrySection node={node} />
      <ConstraintsSection node={node} />
      <StyleSection node={node} breakpoint={breakpoint} />
      <ActionFlowSection node={node} />
      <LinksSection node={node} />
    </div>
  );
}

const GEOMETRY_FIELDS = [
  { key: "x", label: "X", testid: "insp-x" },
  { key: "y", label: "Y", testid: "insp-y" },
  { key: "w", label: "宽", testid: "insp-w" },
  { key: "h", label: "高", testid: "insp-h" },
] as const;

type GeometryKey = (typeof GEOMETRY_FIELDS)[number]["key"];

/** M4 几何区: X/Y/宽/高 数字输入，blur 或 Enter 提交（merge 进 layout，无布局则创建）。 */
function GeometrySection({ node }: { node: ComponentNode }) {
  const [values, setValues] = useState<Record<GeometryKey, string>>({ x: "", y: "", w: "", h: "" });

  useEffect(() => {
    const l = node.layout;
    setValues({
      x: l ? String(l.x ?? "") : "",
      y: l ? String(l.y ?? "") : "",
      w: l ? String(l.w ?? "") : "",
      h: l ? String(l.h ?? "") : "",
    });
  }, [node.id, node.layout]);

  const commit = (key: GeometryKey, raw: string): void => {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) return;
    editComponent(node.id, (entry) => {
      const prev = (entry.layout as Record<string, number> | undefined) ?? {};
      entry.layout = { ...prev, [key]: n };
    });
  };

  return (
    <section className="insp-section">
      <div className="insp-title">位置与尺寸</div>
      {GEOMETRY_FIELDS.map(({ key, label, testid }) => (
        <label key={key} className="insp-row">
          <span>{label}</span>
          <input
            data-testid={testid}
            type="number"
            value={values[key]}
            onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            onBlur={(e) => commit(key, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(key, e.currentTarget.value);
            }}
          />
        </label>
      ))}
    </section>
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

/** R1 M2 修正记忆: 页面布局约束区——把当前组件「记为约束」+ 本页约束列表（可删）。 */
function ConstraintsSection({ node }: { node: ComponentNode }) {
  const state = useDesignStore((s) => s.state);
  const page = state?.pages?.find((p) => p.id === state.currentPageId) ?? state?.pages?.[0];
  const constraints = page?.constraints ?? [];
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.addPageConstraint(node.id);
      setMessage(`已记为约束（${res.constraint.component_type}）`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "记录约束失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="insp-section">
      <div className="insp-title">布局约束（AI 生成时保留这些位置）</div>
      {node.layout ? (
        <button
          className="insp-btn"
          data-testid="insp-add-constraint"
          disabled={busy}
          onClick={() => void add()}
        >
          记为约束
        </button>
      ) : (
        <div className="insp-hint">无布局组件不能记约束</div>
      )}
      {constraints.length > 0 && (
        <div className="insp-constraints" data-testid="insp-constraints">
          {constraints.map((c) => (
            <div key={c.id} className="insp-constraint-row">
              <span className="insp-constraint-label">
                {c.component_type} {Math.round(c.layout.x)},{Math.round(c.layout.y)} · {Math.round(c.layout.w)}×{Math.round(c.layout.h)}
              </span>
              <button
                className="insp-btn"
                data-testid={`insp-remove-constraint-${c.id}`}
                onClick={() => void api.removePageConstraint(c.id)}
              >
                删
              </button>
            </div>
          ))}
        </div>
      )}
      {message && <div className="insp-hint" data-testid="insp-constraint-message">{message}</div>}
    </section>
  );
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

/** M3 ActionFlow: 选中组件的交互流程列表 + JSON 步骤编辑器。 */
function ActionFlowSection({ node }: { node: ComponentNode }) {
  const state = useDesignStore((s) => s.state);
  const flows = Object.values(state?.actionFlows ?? {}).filter(
    (f) => f.componentId === node.id
  );

  return (
    <section className="insp-section">
      <div className="insp-title">交互流程</div>
      <button
        className="insp-btn"
        onClick={() =>
          void api.createActionFlow({
            name: "新流程",
            componentId: node.id,
            steps: [{ id: `step_${Date.now()}`, action: "toast", params: { message: "Hello Prism" } }],
          })
        }
      >
        新建流程
      </button>
      {flows.map((f) => (
        <FlowEditor key={f.id} flow={f} />
      ))}
      {flows.length === 0 && <div className="insp-hint">暂无流程，点击「新建流程」创建</div>}
    </section>
  );
}

function FlowEditor({ flow }: { flow: NonNullable<DesignStateView["actionFlows"]>[string] }) {
  const [json, setJson] = useState(() => JSON.stringify({ name: flow.name, steps: flow.steps }, null, 2));
  const [error, setError] = useState<string | null>(null);

  const commit = (): void => {
    try {
      const parsed = JSON.parse(json) as { name?: string; steps?: unknown[] };
      setError(null);
      void api.updateActionFlow(flow.id, { name: parsed.name, steps: parsed.steps });
    } catch {
      setError("JSON 格式错误，未提交");
    }
  };

  return (
    <div className="flow-editor">
      <div className="flow-head">
        <b>{flow.name}</b>
        <button className="insp-btn" onClick={() => void api.removeActionFlow(flow.id)}>删除</button>
      </div>
      <label className="insp-row insp-row-column">
        <span>{flow.id}</span>
        <textarea
          aria-label={flow.id}
          className="insp-json"
          value={json}
          onChange={(e) => setJson(e.target.value)}
          onBlur={commit}
          rows={6}
        />
      </label>
      {error && <div className="insp-error">{error}</div>}
    </div>
  );
}

/** M4 链接区: 选中组件的出边连线列表——转场下拉（api.updatePageLink）+ 删除。 */
function LinksSection({ node }: { node: ComponentNode }) {
  const state = useDesignStore((s) => s.state);
  const links = (state?.pageLinks ?? []).filter((l) => l.source_component_id === node.id);
  if (links.length === 0) return null;

  return (
    <section className="insp-section">
      <div className="insp-title">链接</div>
      {links.map((l) => {
        const target = state?.pages?.find((p) => p.id === l.to_page_id);
        return (
          <div key={l.id} className="insp-row link-row">
            <span>{target?.name ?? l.to_page_id}</span>
            <select
              data-testid="link-transition"
              aria-label={`转场 ${l.id}`}
              value={l.transition ?? DEFAULT_LINK_TRANSITION}
              onChange={(e) => void api.updatePageLink(l.id, { transition: e.target.value })}
            >
              {PAGE_LINK_TRANSITIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button className="insp-btn" onClick={() => void api.removePageLink(l.id)}>删除</button>
          </div>
        );
      })}
    </section>
  );
}
