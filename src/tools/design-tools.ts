import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  stateStore,
  type ComponentNode,
  type DesignTokens,
  type DesignToken,
  type DesignState,
} from "../state.js";
import { applyStyleTokenSet } from "../tokens.js";
import { getMotionProfile } from "../constants.js";
import { applyBehaviorTemplate, applyComponentTemplate } from "../service/design-service.js";
import {
  CDN_URLS,
  cdnScriptsForDeps,
  collectDeps,
  generateLenisGsapInit,
} from "../animations/serializer.js";
import { getVantaEffect } from "../vanta-effects.js";

// All methods used below now live directly on DesignStateStore (state.ts),
// so no type extension or cast is needed.
const store = stateStore;

// ===== Export Helper Functions =====

function escapeHTML(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape a CSS value (used inside style blocks, not attributes). */
function escapeCSS(value: string): string {
  return String(value).replace(/<\s*\/\s*style/gi, "<\\/style");
}

/** Sanitize a user-provided identifier for use as a CSS animation name. */
function cssIdent(value: string | undefined): string {
  const sanitized = String(value || "prismBgFlow").replace(/[^a-zA-Z0-9_-]/g, "");
  return sanitized || "prismBgFlow";
}

/** Built-in page-background animation keyframes (背景编辑 P1). */
function pageBackgroundAnimationCSS(name: string | undefined): string {
  const id = cssIdent(name);
  switch (id) {
    case "aurora":
      return `    @keyframes ${id} {
      0% { background-position: 0% 50%; filter: hue-rotate(0deg); }
      50% { background-position: 100% 50%; filter: hue-rotate(45deg); }
      100% { background-position: 0% 50%; filter: hue-rotate(0deg); }
    }`;
    case "gradientShift":
      return `    @keyframes ${id} {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }`;
    case "pulse":
      return `    @keyframes ${id} {
      0%, 100% { opacity: 0.85; }
      50% { opacity: 1; }
    }`;
    default:
      return `    @keyframes ${id} {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }`;
  }
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

export function componentToHTML(node: ComponentNode): string {
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
    // Spec 3.4 — new component types
    case "input": {
      const label = p.label ? `<label class="input__label">${escapeHTML(String(p.label))}</label>` : "";
      html = `<div class="input${v}">${label}<input type="${escapeHTML(String(p.type ?? "text"))}" placeholder="${escapeHTML(String(p.placeholder ?? ""))}" value="${escapeHTML(String(p.value ?? ""))}"/></div>`;
      break;
    }
    case "grid": {
      const items = Array.isArray(p.items)
        ? (p.items as (string | Record<string, unknown>)[])
            .map((it) => {
              const title = typeof it === "string" ? it : String(it.title ?? "");
              const desc = typeof it === "object" ? String(it.description ?? "") : "";
              return `<div class="grid__cell"><h3>${escapeHTML(title)}</h3>${desc ? `<p>${escapeHTML(desc)}</p>` : ""}</div>`;
            })
            .join("")
        : "";
      html = `<div class="grid${v}">${items}</div>`;
      break;
    }
    case "table": {
      const columns = Array.isArray(p.columns)
        ? (p.columns as unknown[]).map((c) => `<th>${escapeHTML(String(c))}</th>`).join("")
        : "";
      const rows = Array.isArray(p.rows)
        ? (p.rows as unknown[][])
            .map((row) => `<tr>${row.map((cell) => `<td>${escapeHTML(String(cell))}</td>`).join("")}</tr>`)
            .join("")
        : "";
      html = `<table class="table${v}"><thead><tr>${columns}</tr></thead><tbody>${rows}</tbody></table>`;
      break;
    }
    case "alert": {
      const type = node.variant || String(p.type ?? "info");
      html = `<div class="alert alert--${escapeHTML(type)}"><strong>${escapeHTML(String(p.title ?? ""))}</strong><p>${escapeHTML(String(p.text ?? ""))}</p></div>`;
      break;
    }
    case "tooltip": {
      html = `<span class="tooltip${v}">${escapeHTML(String(p.trigger ?? "?"))}<span class="tooltip__bubble">${escapeHTML(String(p.text ?? ""))}</span></span>`;
      break;
    }
    case "bento_grid": {
      const items = Array.isArray(p.items)
        ? (p.items as Record<string, unknown>[])
            .map(
              (it) =>
                `<div class="bento__tile bento__${escapeHTML(String(it.size ?? "medium"))}"><h3>${escapeHTML(String(it.title ?? ""))}</h3>${it.text ? `<p>${escapeHTML(String(it.text))}</p>` : ""}</div>`
            )
            .join("")
        : "";
      html = `<div class="bento${v}">${items}</div>`;
      break;
    }
    case "skeleton": {
      const rows = Number(p.rows ?? 3);
      html = `<div class="skeleton${v}">${Array.from({ length: rows }, (_, i) => `<div class="skeleton__line" style="width:${92 - i * 14}%"></div>`).join("")}</div>`;
      break;
    }
    case "command_palette": {
      const items = Array.isArray(p.items)
        ? (p.items as (string | Record<string, unknown>)[])
            .map((it) => `<div class="command__item">${escapeHTML(typeof it === "string" ? it : String(it.label ?? ""))}</div>`)
            .join("")
        : "";
      html = `<div class="command${v}"><div class="command__search">⌘ ${escapeHTML(String(p.placeholder ?? ""))}</div>${items}</div>`;
      break;
    }
    case "glass_card": {
      html = `<div class="glass-card${v}"><h3>${escapeHTML(String(p.title ?? ""))}</h3><p>${escapeHTML(String(p.text ?? ""))}</p></div>`;
      break;
    }
    case "fab": {
      html = `<button class="fab${v}" title="${escapeHTML(String(p.hint ?? ""))}">${escapeHTML(String(p.label ?? "+"))}</button>`;
      break;
    }
    case "marquee": {
      const items = Array.isArray(p.items)
        ? (p.items as (string | Record<string, unknown>)[])
            .map((it) => `<span class="marquee__item">${escapeHTML(typeof it === "string" ? it : String(it.title ?? ""))}</span>`)
            .join("")
        : "";
      html = `<div class="marquee${v}">${items}</div>`;
      break;
    }
    case "feature_grid": {
      const items = Array.isArray(p.items)
        ? (p.items as Record<string, unknown>[])
            .map(
              (it) =>
                `<div class="feature-grid__cell"><span class="feature-grid__icon">${escapeHTML(String(it.icon ?? "✦"))}</span><h3>${escapeHTML(String(it.title ?? ""))}</h3><p>${escapeHTML(String(it.description ?? ""))}</p></div>`
            )
            .join("")
        : "";
      html = `<div class="feature-grid${v}">${items}</div>`;
      break;
    }
    case "cookie_banner": {
      html = `<div class="cookie-banner${v}"><span>🍪 ${escapeHTML(String(p.text ?? ""))}</span><button class="btn">${escapeHTML(String(p.accept_text ?? "接受"))}</button><button class="btn btn--ghost">${escapeHTML(String(p.decline_text ?? "拒绝"))}</button></div>`;
      break;
    }
    case "toggle": {
      const checked = p.checked ? " checked" : "";
      html = `<label class="toggle${v}"><span class="toggle__track${checked}"><span class="toggle__thumb"></span></span><span>${escapeHTML(String(p.label ?? ""))}</span></label>`;
      break;
    }
    case "html_fragment": {
      // 忠实显示：原片段 HTML + 原 CSS（Shadow DOM 由客户端渲染；导出时
      // 内联 <style> + 片段一起输出，保证写回产物与画布一致）。
      const fragCss = String(p.css ?? "");
      const fragHtml = String(p.html ?? "");
      html = `<div class="prism-fragment prism-fragment-${escapeHTML(String(p.region ?? "region"))}">${fragCss ? `<style>${fragCss}</style>` : ""}${fragHtml}</div>`;
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

export function htmlToJSX(html: string): string {
  return html
    .replace(/\bclass=/g, "className=")
    .replace(/<img([^>]*?)(?<!\/)>/g, "<img$1 />")
    .replace(/<input([^>]*?)(?<!\/)>/g, "<input$1 />")
    .replace(/<br([^>]*?)(?<!\/)>/g, "<br$1 />");
}

/**
 * Export a single component as code (Inspect mode).
 * - html: raw semantic HTML fragment
 * - react: JSX fragment (className/self-closing tags normalized)
 * - css: design-token CSS variables the component styling depends on
 */
export function exportComponentCode(
  node: ComponentNode,
  format: string,
  tokens?: DesignTokens
): string {
  const html = componentToHTML(node);
  switch (format) {
    case "react":
      return htmlToJSX(html);
    case "css":
      return tokens ? tokensToCSSVariables(tokens) : "/* no tokens available */";
    case "html":
    default:
      return html;
  }
}

/**
 * Build the runtime asset blocks (head CDNs + body init scripts) for HTML export,
 * gated by the `exportRuntime` level (upgrade plan U4):
 *   - minimal  : no external JS; only inline CSS animations are emitted.
 *   - standard : inject GSAP (+ ScrollTrigger) and Lenis when the style prefers
 *                gsap or the scroll mode is lenis-gsap.
 *   - full     : standard + Vanta/three.js CDNs and per-background init scripts.
 *
 * Per-component animation codegen is the serializer's job; this helper only
 * bootstraps the runtime so the exported page is ready to run those animations.
 */
function buildRuntimeAssets(state: DesignState): { headScripts: string; bodyScripts: string } {
  const runtime = state.exportRuntime || "standard";
  if (runtime === "minimal") {
    return { headScripts: "", bodyScripts: "" };
  }

  const motion = getMotionProfile(state.style || "minimal");
  const scrollMode = state.scroll?.mode || "native";
  const vantaEntries = Object.entries(state.vantaBackgrounds || {});

  const needGsap = motion.engine === "gsap" || scrollMode === "lenis-gsap";
  const needLenis = scrollMode === "lenis-gsap";
  const needVanta = runtime === "full" && vantaEntries.length > 0;
  const needScrollTrigger =
    (needGsap && (motion.scrollReveal || scrollMode === "lenis-gsap")) || needVanta;

  const head: string[] = [];
  const body: string[] = [];

  // ----- Head: CDN <script> tags -----
  if (needLenis) {
    head.push(`<link rel="stylesheet" href="${CDN_URLS.lenisCSS}">`);
    head.push(`<script src="${CDN_URLS.lenisJS}"></script>`);
  }
  if (needGsap) {
    const deps = new Set<string>(["gsap"]);
    if (needScrollTrigger) deps.add("ScrollTrigger");
    // Pull in any extra deps declared by components' gsap animations.
    const componentAnims: Array<{ engine: "css" | "gsap"; preset: string }> = [];
    const walk = (list: ComponentNode[]): void => {
      for (const c of list) {
        if (c.animation?.engine === "gsap" && c.animation.entry) {
          componentAnims.push({ engine: "gsap", preset: c.animation.entry });
        }
        if (c.children?.length) walk(c.children);
      }
    };
    walk(state.pages.find((p) => p.id === state.currentPageId)?.components || state.components);
    collectDeps(componentAnims).forEach((d) => deps.add(d));
    head.push(...cdnScriptsForDeps(Array.from(deps)));
  }
  if (needVanta) {
    head.push(`<script src="${CDN_URLS.three}"></script>`);
    head.push(`<script src="${CDN_URLS.vantaBase}"></script>`);
    const seenEffect = new Set<string>();
    for (const [, cfg] of vantaEntries) {
      const fx = getVantaEffect(cfg.effect);
      if (fx && !seenEffect.has(fx.scriptFile)) {
        head.push(`<script src="https://cdn.jsdelivr.net/npm/vanta/dist/${fx.scriptFile}"></script>`);
        seenEffect.add(fx.scriptFile);
      }
    }
  }

  // ----- Body: init scripts -----
  if (needLenis) {
    body.push(generateLenisGsapInit(state.scroll?.options || {}));
  }
  if (needVanta) {
    const vantaInits = vantaEntries
      .map(([id, cfg]) => {
        const fx = getVantaEffect(cfg.effect);
        if (!fx) return "";
        const effectCtor = `VANTA.${fx.key}`;
        const params = JSON.stringify({
          el: `#${id}`,
          mouseControls: cfg.mouseControls ?? true,
          touchControls: cfg.touchControls ?? false,
          gyroControls: cfg.gyroControls ?? false,
          ...cfg.params,
        });
        return `  if (window.${effectCtor}) { ${effectCtor}(${params}); }`;
      })
      .filter(Boolean)
      .join("\n");
    if (vantaInits) {
      body.push(`<script>\n(function(){\n${vantaInits}\n})();\n</script>`);
    }
  }

  const headScripts = head.length ? head.join("\n") : "";
  const bodyScripts = body.length ? `\n${body.join("\n")}` : "";
  return { headScripts, bodyScripts };
}

function exportToHTML(state: DesignState, components: ComponentNode[] = state.components): string {
  const cssVars = tokensToCSSVariables(state.tokens);
  const runtime = buildRuntimeAssets(state);
  const componentsHTML = components
    .map((c) => `  ${componentToHTML(c)}`)
    .join("\n");

  // 背景编辑 P1: 页面背景覆盖默认 body 背景（颜色/渐变/图片/图案/动画）。
  const bodyBg = state.pageBackground
    ? `background: ${escapeCSS(state.pageBackground.value)};`
    : "background: var(--color-bg, #ffffff);";
  const pageBgKeyframes = state.pageBackground && state.pageBackground.type === "animation"
    ? pageBackgroundAnimationCSS(state.pageBackground.animation)
    : "";
  const pageBgBodyExtra = state.pageBackground && state.pageBackground.type === "animation"
    ? ` animation: ${cssIdent(state.pageBackground.animation || "prismBgFlow")} 18s ease-in-out infinite alternate;`
    : "";

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(state.projectName)}</title>
  <style>
${cssVars}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: var(--font-body, sans-serif); ${bodyBg} color: var(--color-text, #1a1a1a); line-height: var(--line-height-normal, 1.5);${pageBgBodyExtra} }
${pageBgKeyframes}
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
    /* 移动端响应式 (Phase 3.2): grids collapse to a single column on phones. */
    @media (max-width: 480px) {
      .card-grid--2col, .card-grid--3col, .card-grid--4col,
      .feature-grid, .bento, .pricing__grid, .stats__grid {
        grid-template-columns: 1fr !important;
        flex-direction: column !important;
      }
      .navbar { flex-wrap: wrap; gap: 0.5rem; }
      .hero { padding: 2rem 1rem; }
      .hero h1 { font-size: 1.75rem; }
      .footer { flex-direction: column; gap: 1rem; text-align: center; }
      .footer__links a { margin: 0 0.75rem; }
      .card { padding: 1rem; }
      .table-wrap { overflow-x: auto; }
    }
  </style>
${runtime.headScripts}
</head>
<body>
${componentsHTML}
${runtime.bodyScripts}
</body>
</html>`;
}

/** Full standalone HTML for a single page (used by the presentation export). */
function exportPageHTML(state: DesignState, page: { id: string; name: string; components: ComponentNode[] }): string {
  return exportToHTML({ ...state, projectName: `${state.projectName} — ${page.name}` }, page.components);
}

/**
 * Export all pages as a navigable HTML slide deck (functional plan F9).
 * Each page becomes a slide; arrow keys navigate, Print renders all slides.
 */
function exportPresentationHTML(state: DesignState): string {
  const cssVars = tokensToCSSVariables(state.tokens);
  const slides = state.pages
    .map(
      (page) =>
        `<section class="slide" data-page="${escapeHTML(page.name)}">
  <header class="slide__header"><span class="slide__title">${escapeHTML(page.name)}</span></header>
  <main class="slide__body">${page.components.map((c) => componentToHTML(c)).join("\n")}</main>
</section>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(state.projectName)} — 演示</title>
  <style>
${cssVars}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; }
    body { font-family: var(--font-body, sans-serif); background: var(--color-bg, #0b0a0f); color: var(--color-text, #f2f0f8); overflow: hidden; }
    .deck { height: 100vh; position: relative; }
    .slide {
      position: absolute; inset: 0;
      display: none;
      flex-direction: column;
      padding: 2.5rem 3rem;
      overflow-y: auto;
      background: var(--color-bg, #0b0a0f);
    }
    .slide.active { display: flex; }
    .slide__header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border, rgba(255,255,255,0.1)); }
    .slide__title { font-family: var(--font-display, sans-serif); font-size: var(--text-xl, 1.25rem); font-weight: 700; }
    .slide__body { flex: 1; padding-top: 2rem; }
    .deck__nav { position: fixed; bottom: 1.25rem; right: 1.25rem; display: flex; gap: 0.5rem; z-index: 10; }
    .deck__nav button { padding: 0.55rem 1.1rem; border: 1px solid var(--color-border, rgba(255,255,255,0.15)); border-radius: var(--radius-md, 8px); background: var(--color-surface, rgba(255,255,255,0.08)); color: var(--color-text, #fff); cursor: pointer; font-size: 0.9rem; }
    .deck__counter { position: fixed; bottom: 1.5rem; left: 1.5rem; font-size: 0.8rem; color: var(--color-text-muted, #9ca3af); z-index: 10; }
    @media print {
      body { overflow: visible; }
      .slide { position: relative; display: flex !important; page-break-after: always; height: auto; min-height: 100vh; }
      .deck__nav, .deck__counter { display: none; }
    }
  </style>
</head>
<body>
  <div class="deck" id="deck">
${slides}
  </div>
  <div class="deck__counter" id="deck-counter">1 / ${state.pages.length}</div>
  <div class="deck__nav">
    <button onclick="PrismDeck.go(-1)">←</button>
    <button onclick="PrismDeck.go(1)">→</button>
    <button onclick="window.print()">打印</button>
  </div>
  <script>
    (function () {
      const slides = document.querySelectorAll('.slide');
      let index = 0;
      const counter = document.getElementById('deck-counter');
      function render() {
        slides.forEach((s, i) => s.classList.toggle('active', i === index));
        counter.textContent = (index + 1) + ' / ' + slides.length;
      }
      window.PrismDeck = {
        go: function (delta) {
          index = Math.max(0, Math.min(slides.length - 1, index + delta));
          render();
        }
      };
      document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); window.PrismDeck.go(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); window.PrismDeck.go(-1); }
        if (e.key === 'Home') { index = 0; render(); }
        if (e.key === 'End') { index = slides.length - 1; render(); }
      });
      render();
    })();
  </script>
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

/** React TypeScript export: typed props + embedded design tokens. */
function exportToReactTs(state: DesignState): string {
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
export interface DesignPageProps {
  /** Page title shown in the document head */
  title?: string;
}

const TOKENS = \`${cssVars}\`;

export default function DesignPage({ title }: DesignPageProps): React.JSX.Element {
  return (
    <div className="design-page" data-testid="design-page">
      <style>{TOKENS}</style>
      <style>{String.raw\`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: var(--font-body, sans-serif); background: var(--color-bg, #ffffff); color: var(--color-text, #1a1a1a); }
      \`}</style>
      <title>{title ?? ${JSON.stringify(state.projectName)}}</title>
${componentsJSX}
    </div>
  );
}`;
}

/** Standalone CSS export: design tokens as custom properties + base component styles. */
function exportToCss(state: DesignState): string {
  const cssVars = tokensToCSSVariables(state.tokens);
  return `${cssVars}

/* Prism generated component styles */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--font-body, sans-serif); background: var(--color-bg, #ffffff); color: var(--color-text, #1a1a1a); line-height: var(--line-height-normal, 1.5); }
.navbar { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
.hero { text-align: center; padding: 4rem 2rem; }
.hero h1 { font-family: var(--font-display, sans-serif); font-size: var(--text-4xl); }
.btn { display: inline-block; padding: 0.75rem 2rem; border: none; border-radius: var(--radius-md); background: var(--color-primary); color: #fff; cursor: pointer; }
.btn--secondary { background: transparent; border: 1px solid var(--color-border); color: var(--color-primary); }
.btn--ghost { background: transparent; color: var(--color-primary); }
.btn--danger { background: var(--color-error, #ef4444); }
.card { padding: 1.5rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.card--elevated { box-shadow: 0 12px 28px rgba(0,0,0,0.14); }
.card--outlined { background: transparent; border-width: 2px; box-shadow: none; }
/* Tokens are consumed by components; component classes above are a minimal base set. */`;
}

/** Extract a hex color from a color token value (falls back to a default). */
function tokenHex(value: string | undefined, fallback: string): string {
  if (value && /^#[0-9A-Fa-f]{6}$/.test(value)) return value.slice(1).toUpperCase();
  return fallback.replace("#", "").toUpperCase();
}

/** Flutter export: MaterialApp with token-derived theme + widget list. */
function exportToFlutter(state: DesignState): string {
  const colors = state.tokens.colors;
  const primary = tokenHex(colors["color-primary"]?.value, "#7C3AED");
  const bg = tokenHex(colors["color-bg"]?.value, "#FFFFFF");
  const surface = tokenHex(colors["color-surface"]?.value, "#F5F5F5");
  const text = tokenHex(colors["color-text"]?.value, "#1A1A1A");

  const widgets = state.components.map((c) => `      ${componentToFlutter(c, text)}`).join("\n");

  return `// ${escapeHTML(state.projectName)} — generated by UI Design MCP Server
import 'package:flutter/material.dart';

const Color kPrimary = Color(0xFF${primary});
const Color kBackground = Color(0xFF${bg});
const Color kSurface = Color(0xFF${surface});
const Color kText = Color(0xFF${text});

void main() => runApp(const PrismApp());

class PrismApp extends StatelessWidget {
  const PrismApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: ${JSON.stringify(state.projectName)},
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: kPrimary,
        scaffoldBackgroundColor: kBackground,
      ),
      home: Scaffold(
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: const [
${widgets}
            ],
          ),
        ),
      ),
    );
  }
}
`;
}

function componentToFlutter(node: ComponentNode, textColor: string): string {
  const p = node.props;
  switch (node.type) {
    case "navbar": {
      const brand = escapeHTML(String(p.brand ?? "Logo"));
      return `Text(${JSON.stringify(brand)}, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: kPrimary)),`;
    }
    case "hero": {
      const title = escapeHTML(String(p.title ?? ""));
      const subtitle = escapeHTML(String(p.subtitle ?? ""));
      const btn = p.button_text ? `FilledButton(onPressed: () {}, child: Text(${JSON.stringify(escapeHTML(String(p.button_text)))})),` : "";
      return `Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(${JSON.stringify(title)}, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 8),
        Text(${JSON.stringify(subtitle)}, style: TextStyle(color: kText.withValues(alpha: 0.7))),
        const SizedBox(height: 16),
        ${btn || "const SizedBox.shrink()"},
      ]),`;
    }
    case "button": {
      return `FilledButton(onPressed: () {}, child: Text(${JSON.stringify(escapeHTML(String(p.text ?? p.label ?? "Button")))})),`;
    }
    case "card": {
      return `Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(${JSON.stringify(escapeHTML(String(p.title ?? "")))}, style: const TextStyle(fontWeight: FontWeight.w600)),
        if (${JSON.stringify(p.description ? escapeHTML(String(p.description)) : "")} != "")
          Text(${JSON.stringify(escapeHTML(String(p.description ?? "")))}, style: const TextStyle(fontSize: 13)),
      ]))),`;
    }
    case "stats": {
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      return `Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
        ${items.map((it) => `Expanded(child: Column(children: [Text(${JSON.stringify(escapeHTML(String(it.value ?? "")))}, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: kPrimary)), Text(${JSON.stringify(escapeHTML(String(it.label ?? "")))}),]))`).join(", ")}
      ]),`;
    }
    case "footer": {
      return `Text(${JSON.stringify(escapeHTML(String(p.copyright ?? "© 2026")))}, textAlign: TextAlign.center, style: const TextStyle(color: Colors.grey)),`;
    }
    case "text_section": {
      return `Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(${JSON.stringify(escapeHTML(String(p.title ?? "")))}, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text(${JSON.stringify(escapeHTML(String(p.text ?? p.body ?? "")))}),
      ]),`;
    }
    default: {
      return `Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(${JSON.stringify(escapeHTML(String(p.title ?? p.text ?? node.type)))}, style: const TextStyle(color: Colors.grey)))),`;
    }
  }
}

/** SwiftUI export: token-derived colors + component view list. */
function exportToSwiftUI(state: DesignState): string {
  const colors = state.tokens.colors;
  const primary = tokenHex(colors["color-primary"]?.value, "#7C3AED");
  const bg = tokenHex(colors["color-bg"]?.value, "#FFFFFF");
  const text = tokenHex(colors["color-text"]?.value, "#1A1A1A");
  const views = state.components.map((c) => `      ${componentToSwiftUI(c)}`).join("\n");

  return `// ${escapeHTML(state.projectName)} — generated by UI Design MCP Server
import SwiftUI

extension Color {
  init(hex: UInt32) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: 1
    )
  }
}

struct DesignPage: View {
  private let primary = Color(hex: 0x${primary})
  private let background = Color(hex: 0x${bg})
  private let textColor = Color(hex: 0x${text})

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
${views}
      }
      .padding(16)
      .frame(maxWidth: .infinity)
    }
    .background(background)
    .foregroundStyle(textColor)
  }
}
`;
}

function componentToSwiftUI(node: ComponentNode): string {
  const p = node.props;
  switch (node.type) {
    case "navbar": {
      return `Text(${JSON.stringify(escapeHTML(String(p.brand ?? "Logo")))}).font(.title2.bold()).foregroundStyle(primary)`;
    }
    case "hero": {
      const title = escapeHTML(String(p.title ?? ""));
      const subtitle = escapeHTML(String(p.subtitle ?? ""));
      const btn = p.button_text
        ? `Button(${JSON.stringify(escapeHTML(String(p.button_text)))}) { }.buttonStyle(.borderedProminent)`
        : "";
      return `VStack(alignment: .leading, spacing: 8) {
        Text(${JSON.stringify(title)}).font(.largeTitle.bold())
        Text(${JSON.stringify(subtitle)}).foregroundStyle(.secondary)
        ${btn}
      }`;
    }
    case "button": {
      return `Button(${JSON.stringify(escapeHTML(String(p.text ?? p.label ?? "Button")))}) { }.buttonStyle(.borderedProminent)`;
    }
    case "card": {
      return `VStack(alignment: .leading, spacing: 4) {
        Text(${JSON.stringify(escapeHTML(String(p.title ?? "")))}).font(.headline)
        Text(${JSON.stringify(escapeHTML(String(p.description ?? "")))}).font(.subheadline).foregroundStyle(.secondary)
      }
      .padding()
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))`;
    }
    case "stats": {
      const items = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
      return `HStack {
        ${items.map((it) => `VStack { Text(${JSON.stringify(escapeHTML(String(it.value ?? "")))}).font(.title.bold()).foregroundStyle(primary); Text(${JSON.stringify(escapeHTML(String(it.label ?? "")))}).font(.caption) }.frame(maxWidth: .infinity)`).join("\n        ")}
      }`;
    }
    case "footer": {
      return `Text(${JSON.stringify(escapeHTML(String(p.copyright ?? "© 2026")))}).font(.footnote).frame(maxWidth: .infinity).foregroundStyle(.secondary)`;
    }
    default: {
      return `Text(${JSON.stringify(escapeHTML(String(p.title ?? p.text ?? node.type)))}).foregroundStyle(.secondary)`;
    }
  }
}

/** Svelte export: SFC with component markup + token CSS. */
function exportToSvelte(state: DesignState): string {
  const cssVars = tokensToCSSVariables(state.tokens);
  const componentsHTML = state.components
    .map((c) => `  ${componentToHTML(c)}`)
    .join("\n");

  return `<script>
  /** ${escapeHTML(state.projectName)} — generated by UI Design MCP Server */
  export let title = ${JSON.stringify(state.projectName)};
</script>

<svelte:head><title>{title}</title></svelte:head>

<div class="design-page">
${componentsHTML}
</div>

<style>
${cssVars}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: var(--font-body, sans-serif); background: var(--color-bg, #ffffff); color: var(--color-text, #1a1a1a); }
</style>`;
}

export function exportDesign(
  format:
    | "html"
    | "react"
    | "vue"
    | "figma_tokens"
    | "react-ts"
    | "css"
    | "presentation"
    | "flutter"
    | "swiftui"
    | "svelte"
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
    case "react-ts":
      return exportToReactTs(state);
    case "css":
      return exportToCss(state);
    case "presentation":
      return exportPresentationHTML(state);
    case "flutter":
      return exportToFlutter(state);
    case "swiftui":
      return exportToSwiftUI(state);
    case "svelte":
      return exportToSvelte(state);
    default:
      return "";
  }
}

// ===== Tool: design_init =====
// Initialize a design project with neutral default tokens and optional base color.
// Prism 无风格预设：换肤统一走 design_apply_style_guide（设计系统）。

export function registerDesignInitTool(server: McpServer): void {
  server.registerTool(
    "design_init",
    {
      title: "Initialize Design Project",
      description: `Initialize a new design project: neutral default token set + optional base color, and clears any previous state.

The client dashboard will update in real-time when this is called.

Args:
  - project_name (string): Name for this design project
  - base_color (string, optional): Override the base color (hex like "#6366F1")

To restyle the project afterwards, use design_apply_style_guide (17 brand design systems).

Examples:
  - design_init(project_name="电商促销页", base_color="#F97316")
  - design_init(project_name="极简博客")`,
      inputSchema: {
        project_name: z.string().describe("Project name"),
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
        stateStore.setStyle("minimal", "ai");

        const tokens = applyStyleTokenSet(
          stateStore,
          params.base_color,
          "ai"
        );

        const summary = [
          `# Design Project Initialized: ${params.project_name}`,
          ``,
          `**Base Color:** ${tokens.baseHex}`,
          `**Font:** ${tokens.font.display.name} + ${tokens.font.body.name}`,
          ``,
          `Tokens generated:`,
          `- Colors: ${Object.keys(tokens.colors).length}`,
          `- Typography: ${Object.keys(tokens.typography).length}`,
          `- Spacing: ${Object.keys(tokens.spacing).length}`,
          `- Radii: ${Object.keys(tokens.radii).length}`,
          `- Transitions: ${Object.keys(tokens.transitions).length}`,
          ``,
          `Restyle anytime with design_apply_style_guide (17 brand design systems).`,
          `The client dashboard is now live. Use design_add_component to start building the UI.`,
        ].join("\n");

        return {
          content: [{ type: "text", text: summary }],
          structuredContent: {
            success: true,
            project_name: params.project_name,
            style: "minimal",
            base_color: tokens.baseHex,
            token_count:
              Object.keys(tokens.colors).length +
              Object.keys(tokens.typography).length +
              Object.keys(tokens.spacing).length +
              Object.keys(tokens.radii).length +
              Object.keys(tokens.transitions).length,
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

// ===== Tool: design_add_component =====

import { describeComponentProps } from "../component-schemas.js";

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

Accepted props per type (all optional; unknown keys are preserved):
  - hero: title, subtitle, button_text, image_url
  - navbar: brand, links, cta_text
  - card_grid: items
  - card: title, description, price, button_text, image_url
  - cta: title, subtitle, button_text
  - button: text, label
  - footer: text, copyright, links
  - feature_list: items
  - stats: items
  - pricing: plans
  - timeline: items
  - faq: items
  - form: fields, button_text
  - image: src, url, alt
  - tabs: items
  - accordion: items
  - carousel: slides, items
  - modal: title, text, cancel_text, confirm_text
  - sidebar: title, links
  - breadcrumb: items
  - pagination: total, current
  - progress: label, value
  - badge: text, label
  - avatar: name, image
  - banner: text, button_text
  - text_section: title, text
  - testimonial: quote, author, role, avatar
  - grid/table/alert/tooltip/bento_grid/glass_card/marquee/feature_grid/cookie_banner/toggle: see dashboard renderer

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
  - layout (object, optional): Freeform layout { x, y, w, h } (merges with existing)
  - visible (boolean, optional): Toggle visibility
  - locked (boolean, optional): Lock/unlock the component

Example:
  - design_update_component(id="comp_12345", props={"title": "新标题", "button_text": "点击这里"})
  - design_update_component(id="comp_12345", layout={"x": 120, "y": 240, "w": 480, "h": 320})`,
      inputSchema: {
        id: z.string().describe("Component ID"),
        props: z.record(z.unknown()).describe("Properties to update"),
        layout: z
          .object({
            x: z.number().optional(),
            y: z.number().optional(),
            w: z.number().optional(),
            h: z.number().optional(),
          })
          .optional()
          .describe("Freeform layout (x/y/w/h)"),
        visible: z.boolean().optional().describe("Show/hide the component"),
        locked: z.boolean().optional().describe("Lock/unlock the component"),
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
        const success = stateStore.updateComponent(params.id, params.props, "ai", params.layout, {
          visible: params.visible,
          locked: params.locked,
        });
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

// ===== Tool: design_rename_component =====

export function registerDesignRenameTool(server: McpServer): void {
  server.registerTool(
    "design_rename_component",
    {
      title: "Rename Component Layer",
      description: `Rename a component's layer (精确编辑 P0 图层重命名). The name shows in the
layers panel and the inspector. Pass an empty string to revert to the
type-based default.

Example:
  - design_rename_component(component_id="comp_5", name="Hero 主标题")
  - design_rename_component(component_id="comp_5", name="")`,
      inputSchema: {
        component_id: z.string().describe("Component ID"),
        name: z.string().describe("New layer name (empty reverts to the default)"),
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
        const success = stateStore.renameComponent(params.component_id, params.name, "ai");
        if (!success) {
          return {
            content: [{ type: "text", text: `Error: Component "${params.component_id}" not found.` }],
            structuredContent: { success: false, component_id: params.component_id },
          };
        }
        const label = params.name.trim() || "default";
        return {
          content: [
            {
              type: "text",
              text: `Component ${params.component_id} renamed to "${label}". Client dashboard refreshed.`,
            },
          ],
          structuredContent: { success: true, component_id: params.component_id, name: label },
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

Animation entries (13): fadeUp, fadeIn, scaleIn, slideLeft, slideRight, slideUp, spring,
bounceIn, flipIn, cinematic, shimmer, glitch, morphBlob
Hover animations (7): scaleUp, lift, glow, ripple, spotlight, magnetic, tilt
Curves: ease, easeOut, easeInOut, spring, linear, bounce

Args:
  - component_id (string): Component to animate
  - entry (string, optional): Entry animation type
  - hover (string, optional): Hover animation type
  - duration (number, optional): Duration in seconds (0.1 - 3.0). Default: 0.3
  - delay (number, optional): Delay in seconds (0 - 3.0). Default: 0
  - curve (string, optional): Easing curve. Default: 'easeOut'
  - stagger (number, optional): Child stagger delay in seconds (0 - 1.0). Default: 0

Example:
  - design_set_animation(component_id="comp_123", entry="bounceIn", duration=0.5, stagger=0.08, curve="spring")`,
      inputSchema: {
        component_id: z.string().describe("Component ID"),
        entry: z.string().optional().describe("Entry animation (13 types: fadeUp, fadeIn, scaleIn, slideLeft, slideRight, slideUp, spring, bounceIn, flipIn, cinematic, shimmer, glitch, morphBlob)"),
        hover: z.string().optional().describe("Hover animation (7 types: scaleUp, lift, glow, ripple, spotlight, magnetic, tilt)"),
        duration: z.number().min(0.1).max(3.0).optional().describe("Duration in seconds"),
        delay: z.number().min(0).max(3.0).optional().describe("Delay in seconds"),
        curve: z.string().optional().describe("Easing curve (ease, easeOut, spring, etc.)"),
        stagger: z.number().min(0).max(1.0).optional().describe("Child stagger delay in seconds"),
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
          stagger: params.stagger,
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

// ===== Tool: design_set_behavior =====

export function registerDesignBehaviorTool(server: McpServer): void {
  server.registerTool(
    "design_set_behavior",
    {
      title: "Set Component Behavior",
      description: `Bind an interaction behavior to a component (行为模型 P1). Triggered in play mode when the user clicks the element.

Behavior types:
  - navigate: jump to another page (page_id)
  - link: open a URL (url, new_tab)
  - toggle: show/hide another component (target_component_id)
  - toast: show a transient message (message)
  - submit: simulate a form submit (form_id)
  - prompt: trigger a natural-language instruction for the built-in AI (prompt)

Pass behavior=null to remove the current behavior.

Example:
  - design_set_behavior(component_id="comp_123", behavior={"type":"navigate","page_id":"page_2"})
  - design_set_behavior(component_id="comp_123", behavior={"type":"toast","message":"已加入购物车"})
  - design_set_behavior(component_id="comp_123", behavior=null)`,
      inputSchema: {
        component_id: z.string().describe("Component ID"),
        behavior: z
          .object({
            type: z.enum(["navigate", "link", "toggle", "toast", "submit", "prompt"]).describe("Behavior type"),
            page_id: z.string().optional().describe("navigate: target page id"),
            url: z.string().optional().describe("link: URL to open"),
            new_tab: z.boolean().optional().describe("link: open in a new tab (default true)"),
            target_component_id: z.string().optional().describe("toggle: component to show/hide"),
            message: z.string().optional().describe("toast: message text"),
            form_id: z.string().optional().describe("submit: form component id"),
            prompt: z.string().optional().describe("prompt: instruction for the built-in AI"),
          })
          .nullable()
          .describe("Behavior spec, or null to remove"),
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
        const success = stateStore.setBehavior(params.component_id, params.behavior, "ai");
        if (!success) {
          return {
            content: [{ type: "text", text: `Error: Component "${params.component_id}" not found.` }],
            structuredContent: { success: false, component_id: params.component_id },
          };
        }
        const label = params.behavior ? params.behavior.type : "none";
        return {
          content: [
            {
              type: "text",
              text: `Behavior "${label}" set on component ${params.component_id}. It triggers in play mode.`,
            },
          ],
          structuredContent: { success: true, component_id: params.component_id, behavior: params.behavior },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_align_components =====

export function registerDesignAlignTool(server: McpServer): void {
  server.registerTool(
    "design_align_components",
    {
      title: "Align Components",
      description: `Align or distribute multiple components in freeform space (精确编辑 P0). Single undo step.

Modes: left, center_x, right, top, center_y, bottom, distribute_x, distribute_y

Example:
  - design_align_components(ids=["comp_1","comp_2","comp_3"], mode="center_x")
  - design_align_components(ids=["comp_1","comp_2"], mode="distribute_y")`,
      inputSchema: {
        ids: z.array(z.string()).min(2).describe("Component ids to align (2+)"),
        mode: z
          .enum(["left", "center_x", "right", "top", "center_y", "bottom", "distribute_x", "distribute_y"])
          .describe("Alignment mode"),
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
        const success = stateStore.alignComponents(params.ids, params.mode, "ai");
        if (!success) {
          return {
            content: [{ type: "text", text: "Error: need at least 2 valid components with layouts." }],
            structuredContent: { success: false, mode: params.mode },
          };
        }
        return {
          content: [{ type: "text", text: `Aligned ${params.ids.length} components (${params.mode}).` }],
          structuredContent: { success: true, ids: params.ids, mode: params.mode },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_z_order_component =====

export function registerDesignZOrderTool(server: McpServer): void {
  server.registerTool(
    "design_z_order_component",
    {
      title: "Reorder Component Stacking",
      description: `Change a component's stacking order (精确编辑 P0).

Modes: front (置顶), back (置底), forward (上移一层), backward (下移一层)

Example:
  - design_z_order_component(component_id="comp_5", mode="front")`,
      inputSchema: {
        component_id: z.string().describe("Component ID"),
        mode: z.enum(["front", "back", "forward", "backward"]).describe("Stacking operation"),
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
        const success = stateStore.zOrderComponent(params.component_id, params.mode, "ai");
        if (!success) {
          return {
            content: [{ type: "text", text: `Error: Component "${params.component_id}" not found.` }],
            structuredContent: { success: false, component_id: params.component_id },
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Component ${params.component_id} moved ${params.mode}.`,
            },
          ],
          structuredContent: { success: true, component_id: params.component_id, mode: params.mode },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    }
  );
}

// ===== Tool: design_apply_component_template =====

export function registerDesignComponentTemplateTool(server: McpServer): void {
  server.registerTool(
    "design_apply_component_template",
    {
      title: "Apply Component Template",
      description: `Apply a ready-made component block to the canvas (模板快速变更 v3.2 支柱⑦ P0: 组件模板).
When target_id is given the selected component is REPLACED in place (keeping its
layout position); otherwise the block is added as a new component. Undoable.

Component templates:
  - hero_split_cta: Hero 分屏 + CTA
  - navbar_cta: 导航栏 + 行动按钮
  - pricing_3col: 定价三档
  - signup_form: 注册表单（提交弹出成功提示）
  - testimonial_grid: 用户评价墙
  - stats_bar: 数据统计条
  - faq_accordion: FAQ 手风琴
  - cta_banner: CTA 转化横幅（点击打开链接）
  - cookie_consent: Cookie 同意横幅
  - bento_features: 便当盒功能网格

Example:
  - design_apply_component_template(template_id="hero_split_cta")
  - design_apply_component_template(template_id="pricing_3col", target_id="comp_5")`,
      inputSchema: {
        template_id: z.string().describe("Component template id (see list above)"),
        target_id: z.string().optional().describe("Replace this component in place (keeps its layout)"),
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
        const result = applyComponentTemplate(params.template_id, params.target_id || null, "ai");
        if (!result.ok) {
          return {
            content: [{ type: "text", text: `Error: ${result.detail || "unknown template"}` }],
            structuredContent: { success: false, template_id: params.template_id },
          };
        }
        return {
          content: [{ type: "text", text: `${result.detail}. Client dashboard updated.` }],
          structuredContent: {
            success: true,
            template_id: params.template_id,
            component_id: result.component_id,
            mode: result.mode,
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

// ===== Tool: design_apply_behavior_template =====

export function registerDesignBehaviorTemplateTool(server: McpServer): void {
  server.registerTool(
    "design_apply_behavior_template",
    {
      title: "Apply Behavior Template",
      description: `Bind a preset interaction to a component in one click (模板快速变更 v3.2 支柱⑦ P0: 交互模板).
Triggered in play mode when the user clicks the element. Undoable.

Behavior templates:
  - open_link_new_tab: 打开链接（新标签页）
  - toast_feedback: 点击提示
  - navigate_home: 跳转首页
  - toggle_self: 显隐切换（自身）
  - submit_feedback: 表单提交反馈
  - ai_enhance: AI 联动指令

Example:
  - design_apply_behavior_template(component_id="comp_5", template_id="toast_feedback")`,
      inputSchema: {
        component_id: z.string().describe("Component ID to bind the interaction to"),
        template_id: z.string().describe("Behavior template id (see list above)"),
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
        const result = applyBehaviorTemplate(params.component_id, params.template_id, params.component_id, "ai");
        if (!result.ok) {
          return {
            content: [{ type: "text", text: `Error: ${result.detail || "unknown template"}` }],
            structuredContent: { success: false, template_id: params.template_id },
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `${result.detail}. It triggers in play mode. Client dashboard updated.`,
            },
          ],
          structuredContent: {
            success: true,
            component_id: params.component_id,
            template_id: params.template_id,
            behavior: result.behavior,
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
          `**Pending prompt:** ${store.getPendingPrompt() ? `"${store.getPendingPrompt()}"` : "none"}`,
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

/**
 * Apply one of the built-in page templates and return the created component
 * IDs. Shared by `design_apply_template` and `design_generate_page` so the
 * template definitions never drift apart.
 */
export function applyPageTemplate(template: string): string[] {
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
      addedIds.push(stateStore.addComponent("text_section", undefined, { title: "深入理解 TypeScript 类型系统", body: "TypeScript 的类型系统是其最强大的特性之一。通过静态类型检查，我们可以在编译时捕获大量潜在错误，提升代码质量和可维护性。" }, null, "ai").id);
      addedIds.push(stateStore.addComponent("image", undefined, { src: "https://picsum.photos/seed/blog/800/400", alt: "TypeScript 类型系统图解" }, null, "ai").id);
      addedIds.push(stateStore.addComponent("text_section", undefined, { title: "高级类型技巧", body: "条件类型和映射类型是 TypeScript 中最强大但也最复杂的特性。掌握它们可以让你写出更加灵活和可复用的类型定义。" }, null, "ai").id);
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
      addedIds.push(stateStore.addComponent("text_section", undefined, { title: "关于我们", body: "我们是一支充满激情的设计团队，专注于为品牌打造独特的视觉体验。" }, null, "ai").id);
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
  const fn = templates[template];
  if (!fn) {
    throw new Error(`Unknown template "${template}". Available: ${Object.keys(templates).join(", ")}`);
  }
  fn();
  return addedIds;
}

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
        const addedIds = applyPageTemplate(params.template);

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
  - react-ts: React + TypeScript component with typed props interface
  - css: Design tokens as CSS custom properties + base component styles
  - presentation: All pages as a navigable HTML slide deck (arrow keys / print)
  - flutter: Flutter MaterialApp + widget list with token-derived theme
  - swiftui: SwiftUI view with token-derived colors
  - svelte: Svelte SFC with token CSS

Args:
  - format (string): Export format — 'html', 'react', 'vue', 'figma_tokens', 'react-ts', 'css', 'presentation', 'flutter', 'swiftui', 'svelte'

Example:
  - design_export(format="html")`,
      inputSchema: {
        format: z
          .enum(["html", "react", "vue", "figma_tokens", "react-ts", "css", "presentation", "flutter", "swiftui", "svelte"])
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
        const prompt = store.consumePendingPrompt();
        if (prompt) {
          store.recordPromptAccepted(prompt);
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
  registerDesignRenameTool(server);
  registerDesignAnimationTool(server);
  registerDesignBehaviorTool(server);
  registerDesignAlignTool(server);
  registerDesignZOrderTool(server);
  registerDesignComponentTemplateTool(server);
  registerDesignBehaviorTemplateTool(server);
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
