// client-v2/src/components/Canvas/LibraryView.tsx
// 设计库组件的最小保真渲染器：纯结构化标记（div/span/button/input/table），
// 交互元素仅作展示、不绑定行为；未知类型回退到 .cv-placeholder。
import type { ReactNode } from "react";
import type { ComponentNode } from "../../types";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown): boolean => v === true;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const strArr = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");
const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);

/** 旧版 pickText 语义：按钮/文本等旧类型仍从这组键里取展示文字。 */
function firstText(props: Record<string, unknown>): string {
  for (const key of ["text", "title", "label", "button_text", "cta_text", "heading", "brand"]) {
    const v = props[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

/** 变体解析：node.variant 优先，回退 props.variant（服务端会把变体写进两处）。 */
function nodeVariant(node: ComponentNode): string {
  const fromProps = node.props?.variant;
  return node.variant || (typeof fromProps === "string" ? fromProps : "");
}

/** label + 控件 的通用字段布局（input/select 等表单族）。 */
function fieldBox(label: string, control: ReactNode): ReactNode {
  return (
    <div className="lv-field">
      {label ? <span className="lv-field-label">{label}</span> : null}
      {control}
    </div>
  );
}

/** select 族展示盒：边框盒内显示当前值或占位文案。 */
function selectBox(value: string, placeholder: string): ReactNode {
  return <div className="lv-select">{value || placeholder}</div>;
}

/**
 * 渲染设计库组件内容。覆盖 button/text/heading/image 旧类型与
 * src/design-library.ts defaultPropsFor 中的全部组件类型；
 * 未知类型回退到带类型标签的 .cv-placeholder。
 */
export function renderLibraryContent(node: ComponentNode): ReactNode {
  const p = node.props ?? {};
  switch (node.type) {
    // ---- 旧类型（保持既有 cv-* 呈现） ----
    case "button": {
      const v = nodeVariant(node) || "primary";
      return <button className={`cv-button cv-button--${v}`}>{firstText(p)}</button>;
    }
    case "text":
    case "heading":
      return <span className="cv-text">{firstText(p)}</span>;

    // ---- 页面区块 ----
    case "navbar": {
      const v = nodeVariant(node);
      const ctaText = str(p.cta_text) || (v === "with_cta" ? "开始使用" : "");
      return (
        <div className={v ? `lv-navbar lv-navbar--${v}` : "lv-navbar"}>
          <span className="lv-navbar-brand">{str(p.brand)}</span>
          <div className="lv-navbar-links">
            {strArr(p.links).map((l, i) => (
              <span key={i} className="lv-navbar-link">{l}</span>
            ))}
          </div>
          {ctaText && <button className="lv-btn lv-btn-primary lv-btn-sm">{ctaText}</button>}
        </div>
      );
    }
    case "hero": {
      const v = nodeVariant(node);
      if (v === "split" || v === "image_right") {
        return (
          <div className="lv-hero lv-hero--split">
            <div className="lv-hero-copy">
              <div className="lv-hero-title">{str(p.title)}</div>
              {str(p.subtitle) && <div className="lv-hero-subtitle">{str(p.subtitle)}</div>}
              {str(p.button_text) && <button className="lv-btn lv-btn-primary">{str(p.button_text)}</button>}
            </div>
            <div className="lv-hero-figure" />
          </div>
        );
      }
      return (
        <div className={v ? `lv-hero lv-hero--${v}` : "lv-hero"}>
          <div className="lv-hero-title">{str(p.title)}</div>
          {str(p.subtitle) && <div className="lv-hero-subtitle">{str(p.subtitle)}</div>}
          {str(p.button_text) && <button className="lv-btn lv-btn-primary">{str(p.button_text)}</button>}
        </div>
      );
    }
    case "cta": {
      const v = nodeVariant(node);
      if (v === "split") {
        return (
          <div className="lv-cta lv-cta--split">
            <div className="lv-cta-copy">
              <div className="lv-cta-title">{str(p.title)}</div>
              {str(p.subtitle) && <div className="lv-cta-subtitle">{str(p.subtitle)}</div>}
            </div>
            {str(p.button_text) && <button className="lv-btn">{str(p.button_text)}</button>}
          </div>
        );
      }
      return (
        <div className={v ? `lv-cta lv-cta--${v}` : "lv-cta"}>
          <div className="lv-cta-title">{str(p.title)}</div>
          {str(p.subtitle) && <div className="lv-cta-subtitle">{str(p.subtitle)}</div>}
          {str(p.button_text) && <button className="lv-btn lv-btn-primary">{str(p.button_text)}</button>}
        </div>
      );
    }
    case "card": {
      const v = nodeVariant(node);
      return (
        <div className={v ? `lv-card lv-card--${v}` : "lv-card"}>
          {str(p.image_url) && <img className="lv-card-image" src={str(p.image_url)} alt="" />}
          <div className="lv-card-body">
            <div className="lv-card-title">{str(p.title)}</div>
            {str(p.description) && <div className="lv-card-desc">{str(p.description)}</div>}
            {str(p.price) && <div className="lv-card-price">{str(p.price)}</div>}
          </div>
        </div>
      );
    }
    case "footer":
      return (
        <div className="lv-footer">
          <span className="lv-footer-text">{str(p.text)}</span>
          <div className="lv-footer-links">
            {strArr(p.links).map((l, i) => (
              <span key={i} className="lv-footer-link">{l}</span>
            ))}
          </div>
        </div>
      );
    case "text_section":
      return (
        <div className="lv-text-section">
          <div className="lv-section-title">{str(p.title)}</div>
          <div className="lv-section-body">{str(p.body)}</div>
        </div>
      );
    case "faq":
      return (
        <div className="lv-faq">
          {arr(p.items).map((item, i) => {
            const q = rec(item);
            return (
              <div key={i} className="lv-faq-item">
                <div className="lv-faq-q">{str(q.q)}</div>
                <div className="lv-faq-a">{str(q.a)}</div>
              </div>
            );
          })}
        </div>
      );
    case "pricing":
      return (
        <div className="lv-pricing">
          {str(p.title) && <div className="lv-pricing-title">{str(p.title)}</div>}
          <div className="lv-pricing-plans">
            {arr(p.plans).map((raw, i) => {
              const plan = rec(raw);
              const featured = bool(plan.featured);
              return (
                <div key={i} className={`lv-plan${featured ? " lv-plan-featured" : ""}`}>
                  <div className="lv-plan-name">{str(plan.name)}</div>
                  <div className="lv-plan-price">{str(plan.price)}</div>
                  <ul className="lv-plan-features">
                    {strArr(plan.features).map((f, j) => (
                      <li key={j} className="lv-plan-feature">{f}</li>
                    ))}
                  </ul>
                  {str(plan.cta) && (
                    <button className={`lv-btn lv-btn-sm ${featured ? "lv-btn-primary" : "lv-btn-outline"}`}>
                      {str(plan.cta)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    case "statistic": {
      const trend = str(p.trend);
      return (
        <div className="lv-statistic">
          <div className="lv-stat-label">{str(p.label)}</div>
          <div className="lv-stat-value-row">
            <span className="lv-stat-value">{str(p.value)}</span>
            {str(p.suffix) && <span className="lv-stat-suffix">{str(p.suffix)}</span>}
          </div>
          {trend && (
            <div className={`lv-stat-trend ${str(p.trendDir) === "down" ? "lv-stat-trend-down" : "lv-stat-trend-up"}`}>
              {trend}
            </div>
          )}
        </div>
      );
    }

    // ---- 表单族 ----
    case "input":
      return fieldBox(str(p.label), <input className="lv-input" placeholder={str(p.placeholder)} readOnly />);
    case "select":
      return fieldBox(str(p.label), selectBox(str(p.value), str(p.placeholder)));
    case "autocomplete":
    case "cascader":
    case "tree_select":
      return fieldBox(str(p.label), selectBox("", str(p.placeholder)));
    case "date_picker":
    case "time_picker":
      return fieldBox(str(p.label), selectBox(str(p.value), str(p.placeholder)));
    case "textarea":
      return fieldBox(
        str(p.label),
        <textarea className="lv-textarea" placeholder={str(p.placeholder)} rows={clamp(num(p.rows, 3), 1, 20)} readOnly />
      );
    case "input_number":
      return fieldBox(str(p.label), <input className="lv-input" type="number" value={num(p.value, 0)} readOnly />);
    case "radio":
      return (
        <div className="lv-field">
          {str(p.label) && <span className="lv-field-label">{str(p.label)}</span>}
          <div className="lv-radio-group">
            {strArr(p.options).map((o, i) => (
              <span key={i} className="lv-radio">
                <span className="lv-radio-dot" />
                <span className="lv-radio-text">{o}</span>
              </span>
            ))}
          </div>
        </div>
      );
    case "checkbox":
      return (
        <div className="lv-checkbox">
          <span className={`lv-checkbox-box${bool(p.checked) ? " checked" : ""}`} />
          <span className="lv-checkbox-label">{str(p.label)}</span>
        </div>
      );
    case "switch":
      return (
        <div className="lv-switch-row">
          <span className={`lv-switch${bool(p.checked) ? " on" : ""}`}>
            <span className="lv-switch-knob" />
          </span>
          <span className="lv-switch-label">{str(p.label)}</span>
        </div>
      );
    case "slider": {
      const min = num(p.min, 0);
      const max = num(p.max, 100);
      const value = clamp(num(p.value, min), min, max);
      const pct = max > min ? Math.round(((value - min) / (max - min)) * 100) : 0;
      return fieldBox(
        str(p.label),
        <div className="lv-slider">
          <div className="lv-slider-track">
            <div className="lv-slider-fill" style={{ width: `${pct}%` }} />
            <div className="lv-slider-thumb" style={{ left: `${pct}%` }} />
          </div>
          <span className="lv-slider-value">{value}</span>
        </div>
      );
    }
    case "rate": {
      const max = clamp(num(p.max, 5), 1, 10);
      const value = clamp(num(p.value, 0), 0, max);
      return fieldBox(
        str(p.label),
        <div className="lv-rate">
          {Array.from({ length: max }, (_, i) => (
            <span key={i} className={`lv-rate-star${i < value ? " active" : ""}`} />
          ))}
        </div>
      );
    }
    case "form":
      return (
        <div className="lv-form">
          {str(p.title) && <div className="lv-form-title">{str(p.title)}</div>}
          {arr(p.fields).map((raw, i) => {
            const f = rec(raw);
            return (
              <div key={i} className="lv-form-field">
                <span className="lv-field-label">{str(f.label)}</span>
                <input className="lv-input" placeholder={str(f.placeholder)} readOnly />
              </div>
            );
          })}
        </div>
      );
    case "upload":
      return fieldBox(str(p.label), <div className="lv-upload">{str(p.hint)}</div>);
    case "color_picker":
      return fieldBox(
        str(p.label),
        <div className="lv-color-picker">
          <span className="lv-color-swatch" style={{ background: str(p.value) || "#2383e2" }} />
        </div>
      );

    // ---- 数据展示 ----
    case "table": {
      const columns = strArr(p.columns);
      const rows = arr(p.rows).map((r) => strArr(r));
      return (
        <div className="lv-table">
          {str(p.title) && <div className="lv-table-title">{str(p.title)}</div>}
          <table className="lv-table-el">
            <thead>
              <tr>
                {columns.map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "list":
      return (
        <div className="lv-list">
          {str(p.title) && <div className="lv-list-title">{str(p.title)}</div>}
          <ul className="lv-list-items">
            {strArr(p.items).map((it, i) => (
              <li key={i} className="lv-list-item">{it}</li>
            ))}
          </ul>
        </div>
      );
    case "tag":
      return (
        <div className="lv-tags">
          {arr(p.tags).map((raw, i) => {
            const t = rec(raw);
            return (
              <span key={i} className={`lv-tag lv-tag-${str(t.color) || "default"}`}>{str(t.text)}</span>
            );
          })}
        </div>
      );
    case "badge":
      return (
        <span className="lv-badge">
          <span className="lv-badge-text">{str(p.text)}</span>
          <span className="lv-badge-count">{num(p.count, 0)}</span>
        </span>
      );
    case "avatar": {
      const size = clamp(num(p.size, 40), 16, 128);
      return (
        <span className="lv-avatar" style={{ width: size, height: size }}>{str(p.text)}</span>
      );
    }
    case "descriptions":
      return (
        <div className="lv-descriptions">
          {str(p.title) && <div className="lv-descriptions-title">{str(p.title)}</div>}
          <div className="lv-descriptions-grid">
            {arr(p.items).map((raw, i) => {
              const item = rec(raw);
              return (
                <div key={i} className="lv-descriptions-item">
                  <span className="lv-descriptions-label">{str(item.label)}</span>
                  <span className="lv-descriptions-value">{str(item.value)}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    case "tabs":
      return (
        <div className="lv-tabs">
          <div className="lv-tabs-bar">
            {arr(p.tabs).map((raw, i) => {
              const tab = rec(raw);
              return (
                <span key={i} className={`lv-tab${bool(tab.active) ? " active" : ""}`}>{str(tab.title)}</span>
              );
            })}
          </div>
          <div className="lv-tabs-content">{str(p.content)}</div>
        </div>
      );
    case "segmented":
      return fieldBox(
        str(p.label),
        <div className="lv-segmented">
          {strArr(p.options).map((o, i) => (
            <span key={i} className={`lv-segmented-item${o === str(p.value) ? " active" : ""}`}>{o}</span>
          ))}
        </div>
      );
    case "accordion":
      return (
        <div className="lv-accordion">
          {arr(p.items).map((raw, i) => {
            const item = rec(raw);
            return (
              <div key={i} className="lv-accordion-item">
                <div className="lv-accordion-header">{str(item.title)}</div>
                {bool(item.open) && <div className="lv-accordion-content">{str(item.content)}</div>}
              </div>
            );
          })}
        </div>
      );
    case "timeline":
      return (
        <div className="lv-timeline">
          {arr(p.items).map((raw, i) => {
            const item = rec(raw);
            return (
              <div key={i} className="lv-timeline-item">
                <span className={`lv-timeline-dot lv-dot-${str(item.color) || "blue"}`} />
                <div className="lv-timeline-body">
                  <div className="lv-timeline-title">{str(item.title)}</div>
                  {str(item.desc) && <div className="lv-timeline-desc">{str(item.desc)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      );
    case "tree":
      return (
        <div className="lv-tree">
          {arr(p.nodes).map((raw, i) => {
            const n = rec(raw);
            return (
              <div key={i} className="lv-tree-node">
                <div className="lv-tree-title">{str(n.title)}</div>
                {arr(n.children).map((child, j) => (
                  <div key={j} className="lv-tree-child">{str(rec(child).title)}</div>
                ))}
              </div>
            );
          })}
        </div>
      );
    case "carousel":
      return (
        <div className="lv-carousel">
          <div className="lv-carousel-slide">{str(rec(arr(p.items)[0]).text)}</div>
          <div className="lv-carousel-dots">
            {arr(p.items).map((_, i) => (
              <span key={i} className={`lv-carousel-dot${i === 0 ? " active" : ""}`} />
            ))}
          </div>
        </div>
      );
    case "empty":
      return (
        <div className="lv-empty">
          <div className="lv-empty-figure" />
          <div className="lv-empty-text">{str(p.text)}</div>
          {str(p.desc) && <div className="lv-empty-desc">{str(p.desc)}</div>}
        </div>
      );
    case "image": {
      const src = str(p.src);
      if (src) {
        return (
          <img
            className="lv-image"
            src={src}
            alt={str(p.alt)}
            width={num(p.width, 0) || undefined}
            height={num(p.height, 0) || undefined}
          />
        );
      }
      return <div className="cv-image">{str(p.alt) || node.type}</div>;
    }
    case "file":
      return (
        <div className="lv-file">
          <div className="lv-file-icon" />
          <div className="lv-file-body">
            <div className="lv-file-name">{str(p.name)}</div>
            <div className="lv-file-meta">{str(p.size)}</div>
            <div className="lv-progress">
              <div className="lv-progress-fill" style={{ width: `${clamp(num(p.progress, 0), 0, 100)}%` }} />
            </div>
          </div>
        </div>
      );
    case "icon": {
      const size = clamp(num(p.size, 24), 8, 128);
      return (
        <div className="lv-icon" style={{ width: size, height: size }}>
          <span className="lv-icon-name">{str(p.name)}</span>
        </div>
      );
    }

    // ---- 反馈 ----
    case "alert":
      return (
        <div className={`lv-alert lv-alert-${str(p.variant) || "info"}`}>
          <div className="lv-alert-title">{str(p.title)}</div>
          {str(p.message) && <div className="lv-alert-message">{str(p.message)}</div>}
        </div>
      );
    case "toast":
      return <div className={`lv-toast lv-toast-${str(p.variant) || "success"}`}>{str(p.message)}</div>;
    case "notification":
      return (
        <div className="lv-notification">
          <div className="lv-notification-head">
            <span className="lv-notification-title">{str(p.title)}</span>
            <span className="lv-notification-time">{str(p.time)}</span>
          </div>
          <div className="lv-notification-message">{str(p.message)}</div>
        </div>
      );
    case "modal":
      return (
        <div className="lv-modal">
          <div className="lv-modal-head">{str(p.title)}</div>
          <div className="lv-modal-body">{str(p.body)}</div>
          <div className="lv-modal-foot">
            <button className="lv-btn lv-btn-outline lv-btn-sm">取消</button>
            <button className="lv-btn lv-btn-primary lv-btn-sm">确定</button>
          </div>
        </div>
      );
    case "drawer":
      return (
        <div className="lv-drawer">
          <div className="lv-drawer-head">{str(p.title)}</div>
          <div className="lv-drawer-body">{str(p.body)}</div>
        </div>
      );
    case "popconfirm":
      return (
        <div className="lv-popconfirm">
          <div className="lv-popconfirm-title">{str(p.title)}</div>
          <div className="lv-popconfirm-actions">
            <button className="lv-btn lv-btn-outline lv-btn-sm">{str(p.cancelText) || "取消"}</button>
            <button className="lv-btn lv-btn-primary lv-btn-sm">{str(p.okText) || "确定"}</button>
          </div>
        </div>
      );
    case "popover":
      return (
        <div className="lv-popover">
          <div className="lv-popover-title">{str(p.title)}</div>
          <div className="lv-popover-content">{str(p.content)}</div>
        </div>
      );
    case "tooltip":
      return (
        <span className="lv-tooltip">
          <span className="lv-tooltip-text">{str(p.text)}</span>
          <span className="lv-tooltip-tip">{str(p.tip)}</span>
        </span>
      );
    case "progress": {
      const value = clamp(num(p.value, 0), 0, 100);
      return (
        <div className="lv-progress-block">
          {str(p.label) && (
            <div className="lv-progress-label">
              <span>{str(p.label)}</span>
              <span>{value}%</span>
            </div>
          )}
          <div className="lv-progress">
            <div className="lv-progress-fill" style={{ width: `${value}%` }} />
          </div>
        </div>
      );
    }
    case "skeleton":
      return (
        <div className="lv-skeleton">
          {Array.from({ length: clamp(num(p.lines, 3), 1, 12) }, (_, i) => (
            <div key={i} className={`lv-skeleton-line${i === 0 ? " lv-skeleton-title" : ""}`} />
          ))}
        </div>
      );
    case "result":
      return (
        <div className={`lv-result lv-result-${str(p.variant) || "success"}`}>
          <div className="lv-result-figure" />
          <div className="lv-result-title">{str(p.title)}</div>
          {str(p.desc) && <div className="lv-result-desc">{str(p.desc)}</div>}
        </div>
      );
    case "spinner": {
      const size = clamp(num(p.size, 32), 8, 128);
      return <div className="lv-spinner" style={{ width: size, height: size }} />;
    }

    // ---- 导航 ----
    case "menu":
      return (
        <div className="lv-menu">
          {arr(p.items).map((raw, i) => {
            const item = rec(raw);
            return (
              <div key={i} className={`lv-menu-item${bool(item.active) ? " active" : ""}`}>{str(item.text)}</div>
            );
          })}
        </div>
      );
    case "breadcrumb":
      return (
        <div className="lv-breadcrumb">
          {strArr(p.items).map((it, i) => (
            <span key={i} className="lv-breadcrumb-item">
              {i > 0 && <span className="lv-breadcrumb-sep">/</span>}
              {it}
            </span>
          ))}
        </div>
      );
    case "pagination": {
      const total = num(p.total, 0);
      const pageSize = num(p.pageSize, 10) || 10;
      const current = num(p.current, 1);
      const pages = Math.min(Math.max(1, Math.ceil(total / pageSize)), 20);
      return (
        <div className="lv-pagination">
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} className={`lv-page${i + 1 === current ? " active" : ""}`}>{i + 1}</span>
          ))}
          <span className="lv-pagination-total">共 {total} 条</span>
        </div>
      );
    }
    case "steps":
      return (
        <div className="lv-steps">
          {arr(p.items).map((raw, i) => {
            const item = rec(raw);
            const current = num(p.current, 0);
            const state = i < current ? "done" : i === current ? "active" : "wait";
            return (
              <div key={i} className={`lv-step ${state}`}>
                <span className="lv-step-index">{i + 1}</span>
                <div className="lv-step-body">
                  <div className="lv-step-title">{str(item.title)}</div>
                  {str(item.desc) && <div className="lv-step-desc">{str(item.desc)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      );
    case "dropdown":
      return (
        <div className="lv-dropdown">
          <div className="lv-dropdown-label">{str(p.label)}</div>
          <div className="lv-dropdown-menu">
            {strArr(p.items).map((it, i) => (
              <div key={i} className="lv-dropdown-item">{it}</div>
            ))}
          </div>
        </div>
      );

    // ---- 其它 ----
    case "divider":
      return str(p.text)
        ? <div className="lv-divider lv-divider-text"><span>{str(p.text)}</span></div>
        : <div className="lv-divider" />;
    case "link":
      return <span className="lv-link">{str(p.text)}</span>;
    case "label":
      return <span className="lv-label">{str(p.text)}</span>;

    // ---- 未知类型：保持旧占位盒 ----
    default: {
      const text = firstText(p);
      return <div className="cv-placeholder">{text || node.type}</div>;
    }
  }
}
