import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  stateStore,
  type ComponentNode,
  type DesignTokens,
  type DesignToken,
  type DesignState,
} from "../state.js";
import {
  STYLE_PRESETS,
  FONT_PAIRINGS,
  TYPE_SCALE_RATIOS,
} from "../constants.js";
import {
  hexToHsl,
  hslToHex,
  generateHarmony,
  generateNeutralGrays,
  normalizeHex,
  isValidHex,
  adjustLightness,
} from "../utils/color.js";

// ===== Extended State Store Type =====
// The following methods and types are being added to DesignStateStore by another
// concurrent task. We declare them here so that TypeScript compilation passes
// regardless of whether the other task has completed yet.

interface PageDef {
  id: string;
  name: string;
  components: ComponentNode[];
}

type ExtendedStateStore = typeof stateStore & {
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  addPage(name: string, source?: "ai" | "user"): PageDef;
  switchPage(pageId: string, source?: "ai" | "user"): boolean;
  removePage(pageId: string, source?: "ai" | "user"): boolean;
  renamePage(pageId: string, name: string, source?: "ai" | "user"): boolean;
  reorderComponent(
    fromId: string,
    toId: string,
    position: "before" | "after",
    source?: "ai" | "user"
  ): boolean;
  setThemeMode(mode: "light" | "dark", source?: "ai" | "user"): void;
  getTokenConflicts(): Array<{ key: string; message: string }>;
  setPendingPrompt(prompt: string): void;
  getPendingPrompt(): string | null;
  clearPendingPrompt(): void;
};

const store = stateStore as ExtendedStateStore;

// ===== Export Helper Functions =====

function escapeHTML(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tokensToCSSVariables(tokens: DesignTokens): string {
  const lines: string[] = ["  :root {"];
  (
    Object.entries(tokens) as [
      keyof DesignTokens,
      Record<string, DesignToken>
    ][]
  ).forEach(([, categoryTokens]) => {
    Object.entries(categoryTokens).forEach(([key, token]) => {
      lines.push(`    --${key}: ${token.value};`);
    });
  });
  lines.push("  }");
  return lines.join("\n");
}

function tokensToObject(tokens: DesignTokens): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  (
    Object.entries(tokens) as [
      keyof DesignTokens,
      Record<string, DesignToken>
    ][]
  ).forEach(([category, categoryTokens]) => {
    result[category as string] = {};
    Object.entries(categoryTokens).forEach(([key, token]) => {
      result[category as string][key] = token.value;
    });
  });
  return result;
}

function componentToHTML(node: ComponentNode): string {
  const p = node.props;
  const v = node.variant ? ` ${node.type}--${node.variant}` : "";

  let html: string;

  switch (node.type) {
    case "navbar": {
      const brand = escapeHTML(String(p.brand ?? ""));
      const links = Array.isArray(p.links)
        ? (p.links as unknown[]).map((l) => `<a href="#">${escapeHTML(String(l))}</a>`).join("")
        : "";
      const ctaBtn = p.cta_text
        ? `<button class="btn btn--primary">${escapeHTML(String(p.cta_text))}</button>`
        : "";
      html = `<nav class="navbar${v}"><div class="navbar__brand">${brand}</div><div class="navbar__links">${links}</div>${ctaBtn}</nav>`;
      break;
    }
    case "hero": {
      const title = escapeHTML(String(p.title ?? ""));
      const subtitle = escapeHTML(String(p.subtitle ?? ""));
      const btn = p.button_text
        ? `<button class="btn btn--primary">${escapeHTML(String(p.button_text))}</button>`
        : "";
      const img = p.image_url
        ? `<div class="hero__image"><img src="${escapeHTML(String(p.image_url))}" alt="${title}"/></div>`
        : "";
      html = `<section class="hero${v}"><div class="hero__content"><h1>${title}</h1><p>${subtitle}</p>${btn}</div>${img}</section>`;
      break;
    }
    case "card": {
      const title = escapeHTML(String(p.title ?? ""));
      const desc = escapeHTML(String(p.description ?? ""));
      const price = p.price
        ? `<span class="card__price">${escapeHTML(String(p.price))}</span>`
        : "";
      html = `<div class="card${v}">${price}<h3>${title}</h3><p>${desc}</p></div>`;
      break;
    }
    case "card_grid": {
      const items = Array.isArray(p.items)
        ? (p.items as Record<string, unknown>[])
            .map((item) => {
              const title = escapeHTML(String(item.title ?? ""));
              const desc = escapeHTML(String(item.description ?? ""));
              const price = item.price
                ? `<span class="card__price">${escapeHTML(String(item.price))}</span>`
                : "";
              return `<div class="card">${price}<h3>${title}</h3><p>${desc}</p></div>`;
            })
            .join("")
        : "";
      html = `<div class="card-grid${v}">${items}</div>`;
      break;
    }
    case "cta": {
      const title = escapeHTML(String(p.title ?? ""));
      const subtitle = escapeHTML(String(p.subtitle ?? ""));
      const btn = p.button_text
        ? `<button class="btn btn--primary">${escapeHTML(String(p.button_text))}</button>`
        : "";
      html = `<section class="cta${v}"><h2>${title}</h2><p>${subtitle}</p>${btn}</section>`;
      break;
    }
    case "footer": {
      const copyright = escapeHTML(String(p.copyright ?? ""));
      const links = Array.isArray(p.links)
        ? (p.links as unknown[]).map((l) => `<a href="#">${escapeHTML(String(l))}</a>`).join("")
        : "";
      html = `<footer class="footer${v}"><div class="footer__copyright">${copyright}</div><div class="footer__links">${links}</div></footer>`;
      break;
    }
    case "stats": {
      const title = p.title ? `<h2>${escapeHTML(String(p.title))}</h2>` : "";
      const items = Array.isArray(p.items)
        ? (p.items as Record<string, unknown>[])
            .map(
              (item) =>
                `<div class="stat"><span class="stat__value">${escapeHTML(String(item.value ?? ""))}</span><span class="stat__label">${escapeHTML(String(item.label ?? ""))}</span></div>`
            )
            .join("")
        : "";
      html = `<section class="stats${v}">${title}<div class="stats__grid">${items}</div></section>`;
      break;
    }
    case "feature_list": {
      const title = p.title ? `<h2>${escapeHTML(String(p.title))}</h2>` : "";
      const items = Array.isArray(p.items)
        ? (p.items as Record<string, unknown>[])
            .map(
              (item) =>
                `<div class="feature"><h3>${escapeHTML(String(item.title ?? ""))}</h3><p>${escapeHTML(String(item.description ?? ""))}</p></div>`
            )
            .join("")
        : "";
      html = `<section class="feature-list${v}">${title}<div class="feature-list__grid">${items}</div></section>`;
      break;
    }
    case "pricing": {
      const title = p.title ? `<h2>${escapeHTML(String(p.title))}</h2>` : "";
      const plans = Array.isArray(p.plans)
        ? (p.plans as Record<string, unknown>[])
            .map((plan) => {
              const features = Array.isArray(plan.features)
                ? (plan.features as unknown[])
                    .map((f) => `<li>${escapeHTML(String(f))}</li>`)
                    .join("")
                : "";
              return `<div class="pricing__plan"><h3>${escapeHTML(String(plan.name ?? ""))}</h3><div class="pricing__price">${escapeHTML(String(plan.price ?? ""))}</div><ul>${features}</ul></div>`;
            })
            .join("")
        : "";
      html = `<section class="pricing${v}">${title}<div class="pricing__grid">${plans}</div></section>`;
      break;
    }
    case "text_section": {
      const title = p.title ? `<h2>${escapeHTML(String(p.title))}</h2>` : "";
      const body = p.body
        ? `<p>${escapeHTML(String(p.body))}</p>`
        : "";
      html = `<section class="text-section${v}">${title}${body}</section>`;
      break;
    }
    case "image": {
      const src = escapeHTML(String(p.src ?? p.image_url ?? ""));
      const alt = escapeHTML(String(p.alt ?? ""));
      html = `<figure class="image${v}"><img src="${src}" alt="${alt}"/></figure>`;
      break;
    }
    case "button": {
      const text = escapeHTML(String(p.text ?? p.label ?? "Button"));
      html = `<button class="btn btn--${node.variant || "primary"}">${text}</button>`;
      break;
    }
    case "form": {
      const title = p.title ? `<h2>${escapeHTML(String(p.title))}</h2>` : "";
      html = `<section class="form-section${v}">${title}<form><button type="submit" class="btn btn--primary">提交</button></form></section>`;
      break;
    }
    case "testimonial": {
      const items = Array.isArray(p.items)
        ? (p.items as Record<string, unknown>[])
            .map(
              (item) =>
                `<div class="testimonial"><blockquote>${escapeHTML(String(item.quote ?? item.text ?? ""))}</blockquote><cite>${escapeHTML(String(item.author ?? item.name ?? ""))}</cite></div>`
            )
            .join("")
        : "";
      html = `<section class="testimonials${v}">${items}</section>`;
      break;
    }
    case "faq": {
      const items = Array.isArray(p.items)
        ? (p.items as Record<string, unknown>[])
            .map(
              (item) =>
                `<div class="faq__item"><h3>${escapeHTML(String(item.question ?? item.title ?? ""))}</h3><p>${escapeHTML(String(item.answer ?? item.body ?? ""))}</p></div>`
            )
            .join("")
        : "";
      html = `<section class="faq${v}">${items}</section>`;
      break;
    }
    case "timeline": {
      const items = Array.isArray(p.items)
        ? (p.items as Record<string, unknown>[])
            .map(
              (item) =>
                `<div class="timeline__item"><span class="timeline__date">${escapeHTML(String(item.date ?? ""))}</span><h3>${escapeHTML(String(item.title ?? ""))}</h3><p>${escapeHTML(String(item.description ?? ""))}</p></div>`
            )
            .join("")
        : "";
      html = `<section class="timeline${v}">${items}</section>`;
      break;
    }
    case "banner": {
      const title = escapeHTML(String(p.title ?? ""));
      const subtitle = escapeHTML(String(p.subtitle ?? ""));
      html = `<section class="banner${v}"><h2>${title}</h2><p>${subtitle}</p></section>`;
      break;
    }
    case "tabs": {
      const tabs = Array.isArray(p.tabs)
        ? (p.tabs as Record<string, unknown>[])
            .map(
              (t, i) =>
                `<div class="tab${i === 0 ? " tab--active" : ""}">${escapeHTML(String(t.label ?? t.title ?? ""))}</div>`
            )
            .join("")
        : "";
      html = `<div class="tabs${v}">${tabs}</div>`;
      break;
    }
    case "accordion": {
      const items = Array.isArray(p.items)
        ? (p.items as Record<string, unknown>[])
            .map(
              (item) =>
                `<details class="accordion__item"><summary>${escapeHTML(String(item.title ?? item.question ?? ""))}</summary><p>${escapeHTML(String(item.content ?? item.answer ?? ""))}</p></details>`
            )
            .join("")
        : "";
      html = `<div class="accordion${v}">${items}</div>`;
      break;
    }
    case "carousel": {
      const slides = Array.isArray(p.slides)
        ? (p.slides as Record<string, unknown>[])
            .map(
              (s) =>
                `<div class="carousel__slide"><h3>${escapeHTML(String(s.title ?? ""))}</h3><p>${escapeHTML(String(s.description ?? ""))}</p></div>`
            )
            .join("")
        : "";
      html = `<div class="carousel${v}">${slides}</div>`;
      break;
    }
    case "modal": {
      const title = escapeHTML(String(p.title ?? ""));
      const body = escapeHTML(String(p.body ?? ""));
      html = `<div class="modal${v}"><div class="modal__content"><h3>${title}</h3><p>${body}</p></div></div>`;
      break;
    }
    case "sidebar": {
      const links = Array.isArray(p.links)
        ? (p.links as unknown[]).map((l) => `<a href="#">${escapeHTML(String(l))}</a>`).join("")
        : "";
      html = `<aside class="sidebar${v}">${links}</aside>`;
      break;
    }
    case "breadcrumb": {
      const items = Array.isArray(p.items)
        ? (p.items as unknown[])
            .map((l) => `<span class="breadcrumb__item">${escapeHTML(String(l))}</span>`)
            .join('<span class="breadcrumb__sep">/</span>')
        : "";
      html = `<nav class="breadcrumb${v}">${items}</nav>`;
      break;
    }
    case "pagination": {
      const total = Number(p.total ?? 5);
      const pages = Array.from(
        { length: total },
        (_, i) =>
          `<span class="pagination__page${i === 0 ? " pagination__page--active" : ""}">${i + 1}</span>`
      ).join("");
      html = `<div class="pagination${v}">${pages}</div>`;
      break;
    }
    case "progress": {
      const value = Number(p.value ?? 50);
      html = `<div class="progress${v}"><div class="progress__bar" style="width: ${value}%"></div></div>`;
      break;
    }
    case "badge": {
      const text = escapeHTML(String(p.text ?? p.label ?? ""));
      html = `<span class="badge${v}">${text}</span>`;
      break;
    }
    case "avatar": {
      const name = escapeHTML(String(p.name ?? ""));
      const src = p.src ? String(p.src) : "";
      html = `<div class="avatar${v}">${src ? `<img src="${escapeHTML(src)}" alt="${name}"/>` : `<span>${name.charAt(0)}</span>`}</div>`;
      break;
    }
    default: {
      const text = escapeHTML(JSON.stringify(p));
      html = `<div class="component component--${escapeHTML(node.type)}">${text}</div>`;
      break;
    }
  }

  // Recursively render children
  if (node.children && node.children.length > 0) {
    const childrenHTML = node.children
      .map((c) => `  ${componentToHTML(c)}`)
      .join("\n");
    const lastClose = html.lastIndexOf("</");
    if (lastClose > 0) {
      html = html.slice(0, lastClose) + "\n" + childrenHTML + "\n" + html.slice(lastClose);
    }
  }

  return html;
}

function htmlToJSX(html: string): string {
  return html
    .replace(/\bclass=/g, "className=")
    .replace(/<img([^>]*?)(?<!\/)>/g, "<img$1 />")
    .replace(/<input([^>]*?)(?<!\/)>/g, "<input$1 />")
    .replace(/<br([^>]*?)(?<!\/)>/g, "<br$1 />");
}

function exportToHTML(state: DesignState): string {
  const cssVars = tokensToCSSVariables(state.tokens);
  const componentsHTML = state.components
    .map((c) => `  ${componentToHTML(c)}`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(state.projectName)}</title>
  <style>
${cssVars}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--font-body, sans-serif); background: var(--color-bg, #ffffff); color: var(--color-text, #1a1a1a); line-height: var(--line-height-normal, 1.5); }
    .navbar { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background: var(--color-surface, #fff); border-bottom: 1px solid var(--color-border, #e5e5e5); }
    .navbar__brand { font-family: var(--font-display, sans-serif); font-weight: 700; font-size: var(--text-lg, 1.25rem); }
    .navbar__links a { margin-left: 1.5rem; text-decoration: none; color: var(--color-text, #333); }
    .hero { text-align: center; padding: 4rem 2rem; }
    .hero--split { display: flex; align-items: center; gap: 2rem; text-align: left; max-width: 1200px; margin: 0 auto; }
    .hero h1 { font-family: var(--font-display, sans-serif); font-size: var(--text-4xl, 2.5rem); margin-bottom: 1rem; }
    .hero p { font-size: var(--text-lg, 1.25rem); color: var(--color-text-muted, #666); margin-bottom: 2rem; }
    .hero__image img { max-width: 100%; border-radius: var(--radius-lg, 16px); }
    .btn { display: inline-block; padding: 0.75rem 2rem; border: none; border-radius: var(--radius-md, 8px); font-size: var(--text-base, 1rem); cursor: pointer; text-decoration: none; }
    .btn--primary { background: var(--color-primary, #6366F1); color: #fff; }
    .btn--secondary { background: var(--color-surface, #fff); color: var(--color-primary, #6366F1); border: 1px solid var(--color-border, #e5e5e5); }
    .btn--ghost { background: transparent; color: var(--color-primary, #6366F1); }
    .card { padding: 1.5rem; border: 1px solid var(--color-border, #e5e5e5); border-radius: var(--radius-md, 8px); background: var(--color-surface, #fff); }
    .card h3 { margin-bottom: 0.5rem; }
    .card__price { display: block; font-size: var(--text-xl, 1.5rem); font-weight: 700; color: var(--color-primary, #6366F1); margin-bottom: 0.5rem; }
    .card-grid { display: grid; gap: 1.5rem; padding: 2rem; max-width: 1200px; margin: 0 auto; }
    .card-grid--2col { grid-template-columns: repeat(2, 1fr); }
    .card-grid--3col { grid-template-columns: repeat(3, 1fr); }
    .card-grid--4col { grid-template-columns: repeat(4, 1fr); }
    .cta { text-align: center; padding: 4rem 2rem; background: var(--color-primary, #6366F1); color: #fff; }
    .cta--banner { border-radius: var(--radius-lg, 16px); margin: 2rem; }
    .cta--split { display: flex; justify-content: space-between; align-items: center; }
    .cta h2 { font-size: var(--text-3xl, 2rem); margin-bottom: 1rem; }
    .cta .btn { background: #fff; color: var(--color-primary, #6366F1); }
    .footer { padding: 2rem; background: var(--color-surface, #f5f5f5); border-top: 1px solid var(--color-border, #e5e5e5); display: flex; justify-content: space-between; align-items: center; }
    .footer__links a { margin-left: 1.5rem; text-decoration: none; color: var(--color-text-muted, #666); }
    .stats { padding: 3rem 2rem; text-align: center; }
    .stats__grid { display: flex; justify-content: center; gap: 3rem; flex-wrap: wrap; }
    .stat__value { display: block; font-size: var(--text-3xl, 2rem); font-weight: 700; color: var(--color-primary, #6366F1); }
    .stat__label { color: var(--color-text-muted, #666); }
    .feature-list { padding: 3rem 2rem; max-width: 1200px; margin: 0 auto; }
    .feature-list__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; }
    .feature h3 { margin-bottom: 0.5rem; }
    .pricing { padding: 3rem 2rem; text-align: center; }
    .pricing__grid { display: flex; justify-content: center; gap: 2rem; flex-wrap: wrap; }
    .pricing__plan { padding: 2rem; border: 1px solid var(--color-border, #e5e5e5); border-radius: var(--radius-md, 8px); min-width: 250px; text-align: center; }
    .pricing__price { font-size: var(--text-2xl, 1.5rem); font-weight: 700; margin: 1rem 0; color: var(--color-primary, #6366F1); }
    .text-section { padding: 3rem 2rem; max-width: 800px; margin: 0 auto; }
    .text-section h2 { margin-bottom: 1rem; }
    .image { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    .image img { max-width: 100%; height: auto; border-radius: var(--radius-md, 8px); }
    .testimonials { padding: 3rem 2rem; max-width: 1200px; margin: 0 auto; }
    .testimonial { text-align: center; margin-bottom: 2rem; }
    .faq { padding: 3rem 2rem; max-width: 800px; margin: 0 auto; }
    .faq__item { margin-bottom: 1rem; }
    .timeline { padding: 3rem 2rem; max-width: 800px; margin: 0 auto; }
    .timeline__item { padding-left: 2rem; border-left: 2px solid var(--color-border, #e5e5e5); margin-bottom: 2rem; }
    .tabs { display: flex; gap: 1rem; padding: 1rem 2rem; border-bottom: 1px solid var(--color-border, #e5e5e5); }
    .tab { padding: 0.5rem 1rem; cursor: pointer; }
    .tab--active { border-bottom: 2px solid var(--color-primary, #6366F1); font-weight: 600; }
    .accordion__item { margin-bottom: 0.5rem; }
    .accordion__item summary { cursor: pointer; padding: 1rem; background: var(--color-surface, #f5f5f5); border-radius: var(--radius-sm, 4px); }
    .carousel { position: relative; overflow: hidden; }
    .carousel__slide { padding: 3rem; text-align: center; background: var(--color-surface, #f5f5f5); }
    .sidebar { padding: 1.5rem; background: var(--color-surface, #f5f5f5); min-height: 100vh; }
    .sidebar a { display: block; padding: 0.5rem 0; text-decoration: none; color: var(--color-text, #333); }
    .breadcrumb { padding: 1rem 2rem; }
    .breadcrumb__item { font-weight: 500; }
    .breadcrumb__sep { margin: 0 0.5rem; color: var(--color-text-muted, #999); }
    .pagination { display: flex; gap: 0.5rem; justify-content: center; padding: 1rem; }
    .pagination__page { padding: 0.5rem 1rem; border: 1px solid var(--color-border, #e5e5e5); border-radius: var(--radius-sm, 4px); cursor: pointer; }
    .pagination__page--active { background: var(--color-primary, #6366F1); color: #fff; }
    .progress { height: 8px; background: var(--color-border, #e5e5e5); border-radius: var(--radius-full, 9999px); overflow: hidden; }
    .progress__bar { height: 100%; background: var(--color-primary, #6366F1); transition: width var(--transition-normal, 250ms ease); }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: var(--radius-full, 9999px); font-size: var(--text-sm, 0.875rem); background: var(--color-primary, #6366F1); color: #fff; }
    .avatar { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: var(--radius-full, 9999px); background: var(--color-primary, #6366F1); color: #fff; overflow: hidden; }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
  </style>
</head>
<body>
${componentsHTML}
</body>
</html>`;
}

function exportToReact(state: DesignState): string {
  const cssVars = tokensToCSSVariables(state.tokens);
  const componentsJSX = state.components
    .map((c) => `      ${htmlToJSX(componentToHTML(c))}`)
    .join("\n");

  return `import React from 'react';

/**
 * ${escapeHTML(state.projectName)}
 * Style: ${escapeHTML(state.style)}
 * Generated by UI Design MCP Server
 */
export default function DesignPage() {
  return (
    <div className="design-page">
      <style>{\`
${cssVars}
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: var(--font-body, sans-serif); background: var(--color-bg, #ffffff); color: var(--color-text, #1a1a1a); }
      \`}</style>
${componentsJSX}
    </div>
  );
}`;
}

function exportToVue(state: DesignState): string {
  const cssVars = tokensToCSSVariables(state.tokens);
  const componentsHTML = state.components
    .map((c) => `    ${componentToHTML(c)}`)
    .join("\n");

  return `<template>
  <div class="design-page">
${componentsHTML}
  </div>
</template>

<script>
/**
 * ${escapeHTML(state.projectName)}
 * Style: ${escapeHTML(state.style)}
 * Generated by UI Design MCP Server
 */
export default {
  name: 'DesignPage',
};
</script>

<style>
${cssVars}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: var(--font-body, sans-serif); background: var(--color-bg, #ffffff); color: var(--color-text, #1a1a1a); }
</style>`;
}

function tokensToFigmaJSON(tokens: DesignTokens): string {
  const typeMap: Record<string, string> = {
    colors: "color",
    typography: "typography",
    spacing: "spacing",
    shadows: "shadow",
    radii: "borderRadius",
    transitions: "transition",
  };
  const result: Record<
    string,
    Record<string, { value: string; type: string }>
  > = {};
  (
    Object.entries(tokens) as [
      keyof DesignTokens,
      Record<string, DesignToken>
    ][]
  ).forEach(([category, categoryTokens]) => {
    result[category as string] = {};
    Object.entries(categoryTokens).forEach(([key, token]) => {
      result[category as string][key] = {
        value: token.value,
        type: typeMap[category as string] || "other",
      };
    });
  });
  return JSON.stringify(result, null, 2);
}

export function exportDesign(
  format: "html" | "react" | "vue" | "figma_tokens"
): string {
  const state = stateStore.getState();
  switch (format) {
    case "html":
      return exportToHTML(state);
    case "react":
      return exportToReact(state);
    case "vue":
      return exportToVue(state);
    case "figma_tokens":
      return tokensToFigmaJSON(state.tokens);
    default:
      return "";
  }
}

// ===== Tool: design_init =====
// Initialize a design project with style and optional base color

export function registerDesignInitTool(server: McpServer): void {
  server.registerTool(
    "design_init",
    {
      title: "Initialize Design Project",
      description: `Initialize a new design project. Sets the overall style, generates a complete token set, and clears any previous state.

The client dashboard will update in real-time when this is called.

Args:
  - project_name (string): Name for this design project
  - style (string): Design style — 'minimal', 'bold', 'playful', 'dark', 'editorial', 'tech'
  - base_color (string, optional): Override the preset base color (hex like "#6366F1")

Examples:
  - design_init(project_name="电商促销页", style="bold", base_color="#F97316")
  - design_init(project_name="极简博客", style="minimal")`,
      inputSchema: {
        project_name: z.string().describe("Project name"),
        style: z
          .enum(["minimal", "bold", "playful", "dark", "editorial", "tech"])
          .describe("Design style preset"),
        base_color: z
          .string()
          .optional()
          .describe("Override base color (hex, e.g. '#6366F1')"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        stateStore.clearAll("ai");
        stateStore.setProjectName(params.project_name, "ai");
        stateStore.setStyle(params.style, "ai");

        const preset = STYLE_PRESETS[params.style];

        // Determine base color
        let baseHex: string;
        if (params.base_color && isValidHex(params.base_color)) {
          baseHex = normalizeHex(params.base_color);
        } else {
          baseHex = hslToHex({
            h: preset.base_hue,
            s: preset.saturation,
            l: preset.lightness,
          });
        }

        const baseHsl = hexToHsl(baseHex);
        const harmonyColors = generateHarmony(baseHsl, "monochromatic");
        const neutralHsls = generateNeutralGrays(baseHsl, 11);

        // Set color tokens
        const colorTokens: Record<string, string> = {
          "color-primary": hslToHex(harmonyColors[1]),
          "color-primary-dark": hslToHex(harmonyColors[0]),
          "color-primary-light": hslToHex(harmonyColors[2]),
          "color-accent": hslToHex(harmonyColors[3]),
          "color-bg": preset.bg_light,
          "color-surface": hslToHex(adjustLightness({ h: baseHsl.h, s: 10, l: 98 }, 0)),
          "color-text": preset.text_light,
          "color-text-muted": hslToHex(neutralHsls[5]),
          "color-border": hslToHex(adjustLightness(neutralHsls[8], -5)),
          "color-success": "#22C55E",
          "color-warning": "#F59E0B",
          "color-error": "#EF4444",
        };

        stateStore.setTokenBatch("colors", colorTokens, "ai");

        // Set typography tokens
        const fontMatch = FONT_PAIRINGS.find((p) => p.style === params.style) || FONT_PAIRINGS[0];
        const ratio = TYPE_SCALE_RATIOS.perfect_fourth;
        const baseSize = 16;
        const typeNames = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];
        const typeSteps = [-2, -1, 0, 1, 2, 3, 4, 5];

        const typoTokens: Record<string, string> = {
          "font-display": fontMatch.display.family,
          "font-body": fontMatch.body.family,
          "font-mono": "'JetBrains Mono', monospace",
          "font-weight-normal": "400",
          "font-weight-medium": "500",
          "font-weight-semibold": "600",
          "font-weight-bold": "700",
          "line-height-tight": "1.2",
          "line-height-normal": "1.5",
          "line-height-relaxed": "1.75",
        };
        typeNames.forEach((name, i) => {
          const size = baseSize * Math.pow(ratio, typeSteps[i]);
          typoTokens[`text-${name}`] = `${(size / 16).toFixed(3)}rem`;
        });
        stateStore.setTokenBatch("typography", typoTokens, "ai");

        // Set spacing tokens
        const spacingBase = preset.spacing_base;
        const spacingValues = [0, spacingBase, spacingBase * 1.5, spacingBase * 2, spacingBase * 3, spacingBase * 4, spacingBase * 6, spacingBase * 8];
        const spacingNames = ["0", "xs", "sm", "md", "lg", "xl", "2xl", "3xl"];
        const spacingTokens: Record<string, string> = {};
        spacingNames.forEach((name, i) => {
          const px = Math.round(spacingValues[i]);
          spacingTokens[`space-${name}`] = `${(px / 16).toFixed(px % 16 === 0 ? 0 : 3)}rem`;
        });
        stateStore.setTokenBatch("spacing", spacingTokens, "ai");

        // Set radius tokens
        const radiusPresets: Record<string, number[]> = {
          sharp: [0, 2, 4, 6, 8],
          subtle: [0, 4, 6, 8, 12],
          rounded: [0, 8, 12, 16, 24],
          pill: [0, 12, 16, 24, 32],
        };
        const radiusVals = radiusPresets[preset.radius_style];
        const radiusNames = ["none", "sm", "md", "lg", "xl"];
        const radiusTokens: Record<string, string> = {};
        radiusNames.forEach((name, i) => {
          radiusTokens[`radius-${name}`] = `${radiusVals[i]}px`;
        });
        radiusTokens["radius-full"] = "9999px";
        stateStore.setTokenBatch("radii", radiusTokens, "ai");

        // Set transition tokens
        const transitionTokens: Record<string, string> = {
          "transition-fast": "150ms ease",
          "transition-normal": "250ms ease",
          "transition-slow": "400ms ease",
          "transition-spring": "500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        };
        stateStore.setTokenBatch("transitions", transitionTokens, "ai");

        const state = stateStore.getState();
        const summary = [
          `# Design Project Initialized: ${params.project_name}`,
          ``,
          `**Style:** ${params.style}`,
          `**Base Color:** ${baseHex}`,
          `**Font:** ${fontMatch.display.name} + ${fontMatch.body.name}`,
          ``,
          `Tokens generated:`,
          `- Colors: ${Object.keys(colorTokens).length}`,
          `- Typography: ${Object.keys(typoTokens).length}`,
          `- Spacing: ${Object.keys(spacingTokens).length}`,
          `- Radii: ${Object.keys(radiusTokens).length}`,
          `- Transitions: ${Object.keys(transitionTokens).length}`,
          ``,
          `The client dashboard is now live. Use design_add_component to start building the UI.`,
        ].join("\n");

        return {
          content: [{ type: "text", text: summary }],
          structuredContent: { success: true, project_name: params.project_name, style: params.style, base_color: baseHex, token_count: Object.keys(colorTokens).length + Object.keys(typoTokens).length + Object.keys(spacingTokens).length + Object.keys(radiusTokens).length + Object.keys(transitionTokens).length },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_add_component =====

export function registerDesignAddComponentTool(server: McpServer): void {
  server.registerTool(
    "design_add_component",
    {
      title: "Add UI Component",
      description: `Add a UI component to the design canvas. The component will appear in the client dashboard in real-time.

Component types: hero, navbar, card, card_grid, button, form, text_section, image, cta, footer, stats, timeline, pricing, testimonial, faq, feature_list, banner, tabs, accordion, carousel, modal, sidebar, breadcrumb, pagination, progress, badge, avatar

Each type has variants:
  - hero: 'centered', 'split', 'fullbleed'
  - navbar: 'simple', 'with_cta', 'mega'
  - card: 'product', 'feature', 'article', 'profile'
  - card_grid: '2col', '3col', '4col'
  - button: 'primary', 'secondary', 'ghost'
  - cta: 'centered', 'split', 'banner'

Args:
  - type (string): Component type
  - variant (string, optional): Component variant
  - props (object, optional): Component properties (title, subtitle, text, image_url, items, etc.)
  - parent_id (string, optional): Parent component ID for nesting

Examples:
  - design_add_component(type="hero", variant="centered", props={"title": "夏季大促", "subtitle": "精选商品5折起", "button_text": "立即抢购"})
  - design_add_component(type="card_grid", variant="3col", props={"items": [{...}, {...}, {...}]})`,
      inputSchema: {
        type: z.string().describe("Component type (hero, navbar, card, card_grid, button, form, text_section, image, cta, footer, stats, timeline, pricing, testimonial, faq, feature_list, banner, tabs, accordion, carousel, modal, sidebar, breadcrumb, pagination, progress, badge, avatar)"),
        variant: z.string().optional().describe("Component variant"),
        props: z.record(z.unknown()).optional().describe("Component properties"),
        parent_id: z.string().optional().describe("Parent component ID for nesting"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const node = stateStore.addComponent(
          params.type,
          params.variant,
          params.props || {},
          params.parent_id || null,
          "ai"
        );

        return {
          content: [{
            type: "text",
            text: `Component added: ${params.type}${params.variant ? ` (${params.variant})` : ""}\nID: ${node.id}\nThe client dashboard has been updated.`,
          }],
          structuredContent: { success: true, component_id: node.id, type: params.type, variant: params.variant },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_update_component =====

export function registerDesignUpdateComponentTool(server: McpServer): void {
  server.registerTool(
    "design_update_component",
    {
      title: "Update Component Properties",
      description: `Update properties of an existing component on the canvas. Changes appear in real-time on the client dashboard.

Args:
  - id (string): Component ID (from design_add_component response)
  - props (object): Properties to update (merges with existing)

Example:
  - design_update_component(id="comp_12345", props={"title": "新标题", "button_text": "点击这里"})`,
      inputSchema: {
        id: z.string().describe("Component ID"),
        props: z.record(z.unknown()).describe("Properties to update"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const success = stateStore.updateComponent(params.id, params.props, "ai");
        if (!success) {
          return {
            content: [{ type: "text", text: `Error: Component with ID "${params.id}" not found.` }],
          };
        }
        return {
          content: [{ type: "text", text: `Component ${params.id} updated. Client dashboard refreshed.` }],
          structuredContent: { success: true, component_id: params.id },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_set_animation =====

export function registerDesignAnimationTool(server: McpServer): void {
  server.registerTool(
    "design_set_animation",
    {
      title: "Set Component Animation",
      description: `Set animation for a component. The client dashboard will play the animation in real-time.

Animation entries: fadeUp, fadeIn, scaleIn, slideRight, slideLeft, slideUp, spring
Curves: ease, easeOut, easeInOut, spring, linear, bounce

Args:
  - component_id (string): Component to animate
  - entry (string, optional): Entry animation type
  - hover (string, optional): Hover animation type (scaleUp, lift, glow)
  - duration (number, optional): Duration in seconds (0.1 - 3.0). Default: 0.3
  - delay (number, optional): Delay in seconds (0 - 3.0). Default: 0
  - curve (string, optional): Easing curve. Default: 'easeOut'

Example:
  - design_set_animation(component_id="comp_123", entry="fadeUp", duration=0.5, delay=0.2, curve="spring")`,
      inputSchema: {
        component_id: z.string().describe("Component ID"),
        entry: z.string().optional().describe("Entry animation (fadeUp, fadeIn, scaleIn, slideRight, etc.)"),
        hover: z.string().optional().describe("Hover animation (scaleUp, lift, glow)"),
        duration: z.number().min(0.1).max(3.0).optional().describe("Duration in seconds"),
        delay: z.number().min(0).max(3.0).optional().describe("Delay in seconds"),
        curve: z.string().optional().describe("Easing curve (ease, easeOut, spring, etc.)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const success = stateStore.setAnimation(params.component_id, {
          entry: params.entry,
          hover: params.hover,
          duration: params.duration,
          delay: params.delay,
          curve: params.curve,
        }, "ai");

        if (!success) {
          return {
            content: [{ type: "text", text: `Error: Component "${params.component_id}" not found.` }],
          };
        }
        return {
          content: [{ type: "text", text: `Animation set for component ${params.component_id}. Playing in client dashboard.` }],
          structuredContent: { success: true, component_id: params.component_id },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_get_state =====

export function registerDesignGetStateTool(server: McpServer): void {
  server.registerTool(
    "design_get_state",
    {
      title: "Get Current Design State",
      description: `Get the complete current design state including all tokens, components, and animations.

Use this to check what's on the canvas before making changes, or to see if the user has made manual adjustments via the client dashboard.

Returns: Full design state (project name, style, all tokens, component tree, activity log)`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const state = stateStore.getState();
        const summary = [
          `# Current Design State`,
          ``,
          `**Project:** ${state.projectName}`,
          `**Style:** ${state.style}`,
          `**Components:** ${state.components.length}`,
          `**Color tokens:** ${Object.keys(state.tokens.colors).length}`,
          `**Typography tokens:** ${Object.keys(state.tokens.typography).length}`,
          ``,
          `## Components on Canvas:`,
          ...state.components.map((c, i) => `${i + 1}. ${c.type}${c.variant ? ` (${c.variant})` : ""} — ID: ${c.id}`),
          ``,
          `## Recent Activity:`,
          ...state.activityLog.slice(0, 5).map((a) => `- [${a.source}] ${a.detail}`),
        ].join("\n");

        return {
          content: [{ type: "text", text: summary }],
          structuredContent: state,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_set_token =====

export function registerDesignSetTokenTool(server: McpServer): void {
  server.registerTool(
    "design_set_token",
    {
      title: "Set Design Token",
      description: `Set or update a single design token. The client dashboard updates in real-time.

Categories: colors, typography, spacing, shadows, radii, transitions

Args:
  - category (string): Token category (colors, typography, spacing, shadows, radii, transitions)
  - key (string): Token key (e.g. "color-primary", "font-display", "space-md")
  - value (string): Token value (e.g. "#FF5733", "1.5rem", "12px")

Example:
  - design_set_token(category="colors", key="color-primary", value="#FF5733")`,
      inputSchema: {
        category: z.enum(["colors", "typography", "spacing", "shadows", "radii", "transitions"]).describe("Token category"),
        key: z.string().describe("Token key (e.g. 'color-primary')"),
        value: z.string().describe("Token value"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        stateStore.setToken(params.category, params.key, params.value, "ai");
        return {
          content: [{ type: "text", text: `Token set: ${params.category}.${params.key} = ${params.value}` }],
          structuredContent: { success: true, category: params.category, key: params.key, value: params.value },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_remove_component =====

export function registerDesignRemoveComponentTool(server: McpServer): void {
  server.registerTool(
    "design_remove_component",
    {
      title: "Remove Component",
      description: `Remove a component from the canvas by its ID.

Args:
  - id (string): Component ID to remove

Example:
  - design_remove_component(id="comp_12345")`,
      inputSchema: {
        id: z.string().describe("Component ID to remove"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const success = stateStore.removeComponent(params.id, "ai");
        if (!success) {
          return {
            content: [{ type: "text", text: `Error: Component "${params.id}" not found.` }],
          };
        }
        return {
          content: [{ type: "text", text: `Component ${params.id} removed from canvas.` }],
          structuredContent: { success: true, removed_id: params.id },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_undo =====

export function registerDesignUndoTool(server: McpServer): void {
  server.registerTool(
    "design_undo",
    {
      title: "Undo Last Operation",
      description: `Undo the last design operation. Reverts the most recent change to the design state.

No arguments required. Returns whether the undo was successful and the current state summary.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const success = store.undo();
        const state = stateStore.getState();
        const summary = [
          `# Undo ${success ? "Successful" : "Failed (nothing to undo)"}`,
          ``,
          `**Project:** ${state.projectName}`,
          `**Components:** ${state.components.length}`,
          `**Can undo more:** ${store.canUndo()}`,
          `**Can redo:** ${store.canRedo()}`,
        ].join("\n");
        return {
          content: [{ type: "text", text: summary }],
          structuredContent: {
            success,
            canUndo: store.canUndo(),
            canRedo: store.canRedo(),
            componentCount: state.components.length,
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_redo =====

export function registerDesignRedoTool(server: McpServer): void {
  server.registerTool(
    "design_redo",
    {
      title: "Redo Last Undone Operation",
      description: `Redo the last undone operation. Re-applies the most recently undone change.

No arguments required. Returns whether the redo was successful and the current state summary.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const success = store.redo();
        const state = stateStore.getState();
        const summary = [
          `# Redo ${success ? "Successful" : "Failed (nothing to redo)"}`,
          ``,
          `**Project:** ${state.projectName}`,
          `**Components:** ${state.components.length}`,
          `**Can undo:** ${store.canUndo()}`,
          `**Can redo more:** ${store.canRedo()}`,
        ].join("\n");
        return {
          content: [{ type: "text", text: summary }],
          structuredContent: {
            success,
            canUndo: store.canUndo(),
            canRedo: store.canRedo(),
            componentCount: state.components.length,
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_add_page =====

export function registerDesignAddPageTool(server: McpServer): void {
  server.registerTool(
    "design_add_page",
    {
      title: "Add Page",
      description: `Add a new page to the design project. The new page becomes the current active page.

Args:
  - name (string): Name for the new page

Example:
  - design_add_page(name="产品详情页")`,
      inputSchema: {
        name: z.string().describe("Page name"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const page = store.addPage(params.name, "ai");
        return {
          content: [{ type: "text", text: `Page added: ${params.name}\nPage ID: ${page.id}\nSwitched to new page.` }],
          structuredContent: { success: true, page_id: page.id, name: params.name },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_switch_page =====

export function registerDesignSwitchPageTool(server: McpServer): void {
  server.registerTool(
    "design_switch_page",
    {
      title: "Switch Page",
      description: `Switch to a different page in the design project.

Args:
  - page_id (string): ID of the page to switch to

Example:
  - design_switch_page(page_id="page_12345")`,
      inputSchema: {
        page_id: z.string().describe("Page ID to switch to"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const success = store.switchPage(params.page_id, "ai");
        if (!success) {
          return {
            content: [{ type: "text", text: `Error: Page "${params.page_id}" not found.` }],
          };
        }
        return {
          content: [{ type: "text", text: `Switched to page ${params.page_id}.` }],
          structuredContent: { success: true, page_id: params.page_id },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_remove_page =====

export function registerDesignRemovePageTool(server: McpServer): void {
  server.registerTool(
    "design_remove_page",
    {
      title: "Remove Page",
      description: `Remove a page from the design project by its ID.

Args:
  - page_id (string): ID of the page to remove

Example:
  - design_remove_page(page_id="page_12345")`,
      inputSchema: {
        page_id: z.string().describe("Page ID to remove"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const success = store.removePage(params.page_id, "ai");
        if (!success) {
          return {
            content: [{ type: "text", text: `Error: Page "${params.page_id}" not found.` }],
          };
        }
        return {
          content: [{ type: "text", text: `Page ${params.page_id} removed.` }],
          structuredContent: { success: true, removed_page_id: params.page_id },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_apply_template =====

export function registerDesignApplyTemplateTool(server: McpServer): void {
  server.registerTool(
    "design_apply_template",
    {
      title: "Apply Page Template",
      description: `Apply a pre-built page template. Automatically adds multiple components to the current page.

Available templates:
  - ecommerce_home: Navbar + Hero (centered) + Card Grid (3col) + CTA (centered) + Footer
  - saas_landing: Navbar (with_cta) + Hero (split) + Feature List + Stats + Pricing + CTA (banner) + Footer
  - blog_post: Navbar + Text Section + Image + Text Section + Footer
  - portfolio: Navbar + Hero (centered) + Card Grid (4col) + Text Section + Footer
  - dashboard: Navbar + Stats + Card Grid (2col) + Feature List

Args:
  - template (string): Template name — 'ecommerce_home', 'saas_landing', 'blog_post', 'portfolio', 'dashboard'

Example:
  - design_apply_template(template="ecommerce_home")`,
      inputSchema: {
        template: z
          .enum(["ecommerce_home", "saas_landing", "blog_post", "portfolio", "dashboard"])
          .describe("Template name"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const addedIds: string[] = [];

        const templates: Record<string, () => void> = {
          ecommerce_home: () => {
            addedIds.push(stateStore.addComponent("navbar", undefined, { brand: "ShopMax", links: ["首页", "商品", "优惠", "关于"] }, null, "ai").id);
            addedIds.push(stateStore.addComponent("hero", "centered", { title: "夏季大促", subtitle: "精选商品5折起", button_text: "立即抢购" }, null, "ai").id);
            addedIds.push(stateStore.addComponent("card_grid", "3col", { items: [
              { title: "商品A", price: "¥99", description: "优质好物" },
              { title: "商品B", price: "¥199", description: "精挑细选" },
              { title: "商品C", price: "¥299", description: "品质之选" },
            ] }, null, "ai").id);
            addedIds.push(stateStore.addComponent("cta", "centered", { title: "立即下单", subtitle: "限时优惠，不容错过", button_text: "去购物" }, null, "ai").id);
            addedIds.push(stateStore.addComponent("footer", undefined, { copyright: "© 2024 ShopMax", links: ["关于我们", "联系方式", "隐私政策"] }, null, "ai").id);
          },
          saas_landing: () => {
            addedIds.push(stateStore.addComponent("navbar", "with_cta", { brand: "CloudFlow", links: ["功能", "价格", "文档", "博客"], cta_text: "免费试用" }, null, "ai").id);
            addedIds.push(stateStore.addComponent("hero", "split", { title: "提升团队效率十倍", subtitle: "一站式协作平台，让工作更高效", button_text: "开始使用", image_url: "https://picsum.photos/seed/saas/600/400" }, null, "ai").id);
            addedIds.push(stateStore.addComponent("feature_list", undefined, { title: "核心功能", items: [
              { title: "任务管理", description: "可视化任务看板，高效追踪进度" },
              { title: "实时协作", description: "多人同时编辑，无缝协作" },
              { title: "数据报表", description: "智能数据分析，洞察业务趋势" },
            ] }, null, "ai").id);
            addedIds.push(stateStore.addComponent("stats", undefined, { title: "数据见证", items: [
              { label: "活跃用户", value: "50万+" },
              { label: "企业客户", value: "3000+" },
              { label: "好评率", value: "98%" },
              { label: "服务年限", value: "8年" },
            ] }, null, "ai").id);
            addedIds.push(stateStore.addComponent("pricing", undefined, { title: "价格方案", plans: [
              { name: "基础版", price: "¥99/月", features: ["10人团队", "5GB存储", "基础支持"] },
              { name: "专业版", price: "¥299/月", features: ["50人团队", "50GB存储", "优先支持", "高级报表"] },
              { name: "企业版", price: "定制", features: ["不限人数", "无限存储", "专属客服", "定制开发"] },
            ] }, null, "ai").id);
            addedIds.push(stateStore.addComponent("cta", "banner", { title: "立即开启高效协作", subtitle: "14天免费试用，无需信用卡", button_text: "免费开始" }, null, "ai").id);
            addedIds.push(stateStore.addComponent("footer", undefined, { copyright: "© 2024 CloudFlow", links: ["关于我们", "联系方式", "隐私政策", "服务条款"] }, null, "ai").id);
          },
          blog_post: () => {
            addedIds.push(stateStore.addComponent("navbar", undefined, { brand: "技术博客", links: ["首页", "文章", "分类", "关于"] }, null, "ai").id);
            addedIds.push(stateStore.addComponent("text_section", undefined, { title: "深入理解 TypeScript 类型系统", body: "TypeScript 的类型系统是其最强大的特性之一。通过静态类型检查，我们可以在编译时捕获大量潜在错误，提升代码质量和可维护性。本文将深入探讨 TypeScript 类型系统的核心概念和高级用法。" }, null, "ai").id);
            addedIds.push(stateStore.addComponent("image", undefined, { src: "https://picsum.photos/seed/blog/800/400", alt: "TypeScript 类型系统图解" }, null, "ai").id);
            addedIds.push(stateStore.addComponent("text_section", undefined, { title: "高级类型技巧", body: "条件类型和映射类型是 TypeScript 中最强大但也最复杂的特性。掌握它们可以让你写出更加灵活和可复用的类型定义，显著提升开发效率。" }, null, "ai").id);
            addedIds.push(stateStore.addComponent("footer", undefined, { copyright: "© 2024 技术博客", links: ["关于", "订阅", "归档"] }, null, "ai").id);
          },
          portfolio: () => {
            addedIds.push(stateStore.addComponent("navbar", undefined, { brand: "Design Studio", links: ["作品", "关于", "服务", "联系"] }, null, "ai").id);
            addedIds.push(stateStore.addComponent("hero", "centered", { title: "创意设计工作室", subtitle: "用设计连接品牌与用户", button_text: "查看作品" }, null, "ai").id);
            addedIds.push(stateStore.addComponent("card_grid", "4col", { items: [
              { title: "品牌设计", description: "视觉识别系统" },
              { title: "网页设计", description: "响应式网站" },
              { title: "UI/UX设计", description: "用户体验优化" },
              { title: "插画设计", description: "商业插画创作" },
            ] }, null, "ai").id);
            addedIds.push(stateStore.addComponent("text_section", undefined, { title: "关于我们", body: "我们是一支充满激情的设计团队，专注于为品牌打造独特的视觉体验。从概念到落地，我们用心对待每一个项目。" }, null, "ai").id);
            addedIds.push(stateStore.addComponent("footer", undefined, { copyright: "© 2024 Design Studio", links: ["作品", "关于", "联系"] }, null, "ai").id);
          },
          dashboard: () => {
            addedIds.push(stateStore.addComponent("navbar", undefined, { brand: "数据看板", links: ["概览", "分析", "设置"] }, null, "ai").id);
            addedIds.push(stateStore.addComponent("stats", undefined, { title: "今日数据", items: [
              { label: "访问量", value: "12,345" },
              { label: "订单数", value: "328" },
              { label: "收入", value: "¥45,600" },
              { label: "转化率", value: "2.6%" },
            ] }, null, "ai").id);
            addedIds.push(stateStore.addComponent("card_grid", "2col", { items: [
              { title: "销售趋势", description: "近30天销售数据走势" },
              { title: "用户分析", description: "用户行为深度分析" },
              { title: "热销商品", description: "TOP10商品排行" },
              { title: "地区分布", description: "销售地区分布图" },
            ] }, null, "ai").id);
            addedIds.push(stateStore.addComponent("feature_list", undefined, { title: "快捷操作", items: [
              { title: "导出报表", description: "一键导出数据报表" },
              { title: "添加商品", description: "快速上架新商品" },
              { title: "消息通知", description: "查看系统消息通知" },
            ] }, null, "ai").id);
          },
        };

        const templateFn = templates[params.template];
        if (!templateFn) {
          return {
            content: [{ type: "text", text: `Error: Unknown template "${params.template}".` }],
          };
        }

        templateFn();

        return {
          content: [{ type: "text", text: `Template "${params.template}" applied.\n${addedIds.length} components added.\nComponent IDs: ${addedIds.join(", ")}` }],
          structuredContent: { success: true, template: params.template, component_ids: addedIds, count: addedIds.length },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_export =====

export function registerDesignExportTool(server: McpServer): void {
  server.registerTool(
    "design_export",
    {
      title: "Export Design as Code",
      description: `Export the current design as code in the specified format.

Supported formats:
  - html: Complete standalone HTML file with CSS variables and all component markup
  - react: React JSX component code
  - vue: Vue Single File Component (SFC) code
  - figma_tokens: Design tokens in Figma token JSON format

Args:
  - format (string): Export format — 'html', 'react', 'vue', 'figma_tokens'

Example:
  - design_export(format="html")`,
      inputSchema: {
        format: z
          .enum(["html", "react", "vue", "figma_tokens"])
          .describe("Export format"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const code = exportDesign(params.format);
        const state = stateStore.getState();
        const summary = [
          `# Export Complete (${params.format})`,
          ``,
          `**Project:** ${state.projectName}`,
          `**Components:** ${state.components.length}`,
          `**Code length:** ${code.length} characters`,
        ].join("\n");
        return {
          content: [{ type: "text", text: summary }],
          structuredContent: { success: true, format: params.format, code, code_length: code.length, component_count: state.components.length },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_reorder_component =====

export function registerDesignReorderComponentTool(server: McpServer): void {
  server.registerTool(
    "design_reorder_component",
    {
      title: "Reorder Component",
      description: `Reorder a component relative to another component in the canvas.

Args:
  - from_id (string): ID of the component to move
  - to_id (string): ID of the reference component
  - position (string): Where to place the moved component relative to the reference — 'before' or 'after'

Example:
  - design_reorder_component(from_id="comp_123", to_id="comp_456", position="before")`,
      inputSchema: {
        from_id: z.string().describe("ID of the component to move"),
        to_id: z.string().describe("ID of the reference component"),
        position: z.enum(["before", "after"]).describe("Position relative to reference component"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const success = store.reorderComponent(params.from_id, params.to_id, params.position, "ai");
        if (!success) {
          return {
            content: [{ type: "text", text: `Error: Could not reorder. Check that both component IDs exist.` }],
          };
        }
        return {
          content: [{ type: "text", text: `Component ${params.from_id} moved ${params.position} ${params.to_id}.` }],
          structuredContent: { success: true, from_id: params.from_id, to_id: params.to_id, position: params.position },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_set_theme =====

export function registerDesignSetThemeTool(server: McpServer): void {
  server.registerTool(
    "design_set_theme",
    {
      title: "Set Theme Mode",
      description: `Set the theme mode for the design project (light or dark). The client dashboard will update accordingly.

Args:
  - mode (string): Theme mode — 'light' or 'dark'

Example:
  - design_set_theme(mode="dark")`,
      inputSchema: {
        mode: z.enum(["light", "dark"]).describe("Theme mode"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        store.setThemeMode(params.mode, "ai");
        return {
          content: [{ type: "text", text: `Theme mode set to "${params.mode}".` }],
          structuredContent: { success: true, mode: params.mode },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_get_conflicts =====

export function registerDesignGetConflictsTool(server: McpServer): void {
  server.registerTool(
    "design_get_conflicts",
    {
      title: "Check Token Conflicts",
      description: `Check for token conflicts such as low contrast color combinations or inconsistent spacing.

No arguments required. Returns a list of conflicts found, or an empty list if none.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const conflicts = store.getTokenConflicts();
        const summary = conflicts.length > 0
          ? `# Token Conflicts Found (${conflicts.length})\n\n${conflicts.map((c, i) => `${i + 1}. **${c.key}**: ${c.message}`).join("\n")}`
          : `# No Token Conflicts\n\nAll design tokens look good!`;
        return {
          content: [{ type: "text", text: summary }],
          structuredContent: { success: true, conflicts, conflict_count: conflicts.length },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_check_prompts =====

export function registerDesignCheckPromptsTool(server: McpServer): void {
  server.registerTool(
    "design_check_prompts",
    {
      title: "Check User Prompts",
      description: `Check if the user has sent any natural language prompts via the client dashboard.

If a pending prompt exists, it is returned and then cleared. Use this to periodically poll for user instructions sent from the browser client.

No arguments required.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const prompt = store.getPendingPrompt();
        if (prompt) {
          store.clearPendingPrompt();
          return {
            content: [{ type: "text", text: `# User Prompt Found\n\nThe user sent the following instruction via the client dashboard:\n\n"${prompt}"\n\nThe prompt has been cleared. Consider acting on it now.` }],
            structuredContent: { success: true, has_prompt: true, prompt },
          };
        }
        return {
          content: [{ type: "text", text: `No pending user prompts.` }],
          structuredContent: { success: true, has_prompt: false, prompt: null },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Register All Design Tools =====

export function registerAllDesignTools(server: McpServer): void {
  registerDesignInitTool(server);
  registerDesignAddComponentTool(server);
  registerDesignUpdateComponentTool(server);
  registerDesignAnimationTool(server);
  registerDesignGetStateTool(server);
  registerDesignSetTokenTool(server);
  registerDesignRemoveComponentTool(server);
  registerDesignUndoTool(server);
  registerDesignRedoTool(server);
  registerDesignAddPageTool(server);
  registerDesignSwitchPageTool(server);
  registerDesignRemovePageTool(server);
  registerDesignApplyTemplateTool(server);
  registerDesignExportTool(server);
  registerDesignReorderComponentTool(server);
  registerDesignSetThemeTool(server);
  registerDesignGetConflictsTool(server);
  registerDesignCheckPromptsTool(server);
}
