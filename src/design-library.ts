/**
 * Design Library (DESIGN.md v1.1 §6).
 *
 * The design library is the single content panel for non-designers:
 *   - 24 styles (one-click token overrides + motion profile)
 *   - 117 component templates/variants (39 base types × 3 variants)
 *   - term templates for naming/description/tags/usage
 *
 * The catalog is externalized to `src/resources/design-library/catalog.json`
 * so the content can evolve independently from code. The standard source is:
 *   - https://vibe-hub.org/
 *   - https://vibe-hub.org/topics/design
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "node:vm";
import { stateStore, type DesignTokens, type ComponentNode } from "./state.js";
import { STYLE_MOTION_PROFILES, type MotionProfile } from "./constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_CANDIDATES = [
  path.resolve(__dirname, "resources/design-library/catalog.json"),
  path.resolve(__dirname, "..", "src", "resources/design-library/catalog.json"),
];
const CATALOG_PATH = CATALOG_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || CATALOG_CANDIDATES[0];

const VIBE_HUB_CANDIDATES = [
  path.resolve(__dirname, "..", "client", "vibe-hub-data.js"),
  path.resolve(__dirname, "..", "..", "client", "vibe-hub-data.js"),
];
const VIBE_HUB_PATH = VIBE_HUB_CANDIDATES.find((candidate) => fs.existsSync(candidate));

interface VibeHubVariant {
  name: string;
  en?: string;
  desc?: string;
}

interface VibeHubTerm {
  slug: string;
  zh: string;
  en?: string;
  youSay?: string;
  definition?: string;
  variants?: string;
  variantsList?: VibeHubVariant[];
}

interface VibeHubStyle {
  slug: string;
  zh: string;
  en?: string;
  youSay?: string;
  definition?: string;
  principles?: string;
  anatomy?: string;
}

interface VibeHubTerms {
  grouped: Record<string, VibeHubTerm[]>;
  styles: VibeHubStyle[];
}

/** Map VibeHub style slugs to the deterministic token-override fallback entries. */
const VIBE_HUB_STYLE_TOKEN_MAP: Record<string, string> = {
  minimal: "minimal",
  apple: "tech",
  notion: "paper",
  bento: "bento",
  glass: "glassmorphism",
  brutalism: "brutalism",
  swiss: "shadcn",
  editorial: "editorial",
  material: "material",
  neumorphism: "neumorphism",
  playful: "playful",
  organic: "organic",
};

export interface DesignLibraryStyle {
  id: string;
  name: string;
  description: string;
  tags: string[];
  tokenOverrides: {
    colors?: Record<string, string>;
    typography?: Record<string, string>;
    spacing?: Record<string, string>;
    shadows?: Record<string, string>;
    radii?: Record<string, string>;
    transitions?: Record<string, string>;
  };
  motion?: {
    entry: string;
    hover: string;
    duration: number;
    easing: string;
    stagger: number;
    engine: "css" | "gsap";
  };
  thumbnail?: string;
}

export interface DesignLibraryComponent {
  id: string;
  name: string;
  description: string;
  tags: string[];
  type: string;
  variant?: string;
  props: Record<string, unknown>;
  baseId?: string;
  variantName?: string;
  thumbnail?: string;
  category?: string;
  en?: string;
  variants?: VibeHubVariant[];
}

export interface TermTemplateField {
  name: string;
  pattern: string;
  example: string;
}

export interface TermTemplate {
  id: string;
  target: "style" | "component";
  fields: TermTemplateField[];
  description: string;
}

export interface ComponentSeed {
  type: string;
  name: string;
  variants: string[];
}

interface RawCatalog {
  version: number;
  source: string;
  updatedAt?: string;
  styles: Array<Partial<DesignLibraryStyle> & { id: string; name: string }>;
  componentSeeds: ComponentSeed[];
  termTemplates: TermTemplate[];
}

export interface DesignLibraryCatalog {
  version: number;
  source: string;
  updatedAt?: string;
  styles: DesignLibraryStyle[];
  components: DesignLibraryComponent[];
  termTemplates: TermTemplate[];
}

let cachedCatalog: DesignLibraryCatalog | null = null;

function assertStyle(style: Partial<DesignLibraryStyle> & { id: string; name: string }): DesignLibraryStyle {
  if (!style.id || !style.name) {
    throw new Error(`Invalid design-library style: ${JSON.stringify(style)}`);
  }
  return {
    id: style.id,
    name: style.name,
    description: style.description || style.name,
    tags: Array.isArray(style.tags) ? style.tags : [],
    tokenOverrides: {
      colors: style.tokenOverrides?.colors || {},
      typography: style.tokenOverrides?.typography || {},
      spacing: style.tokenOverrides?.spacing || {},
      shadows: style.tokenOverrides?.shadows || {},
      radii: style.tokenOverrides?.radii || {},
      transitions: style.tokenOverrides?.transitions || {},
    },
    motion: style.motion,
    thumbnail: style.thumbnail,
  };
}

function assertTermTemplate(t: TermTemplate): TermTemplate {
  if (!t || !t.id || !t.target || !Array.isArray(t.fields)) {
    throw new Error(`Invalid term template: ${JSON.stringify(t)}`);
  }
  return t;
}

function expandComponents(seeds: ComponentSeed[]): DesignLibraryComponent[] {
  const components: DesignLibraryComponent[] = [];
  for (const seed of seeds) {
    if (!seed || !seed.type || !Array.isArray(seed.variants) || seed.variants.length === 0) {
      throw new Error(`Invalid component seed: ${JSON.stringify(seed)}`);
    }
    for (const variantName of seed.variants) {
      const id = `${seed.type}_${variantName}`;
      components.push({
        id,
        name: `${seed.name} · ${variantName}`,
        description: `${seed.name}「${variantName}」变体，适合拖拽添加或就地替换。`,
        tags: [seed.type, variantName, "vibe-hub"],
        type: seed.type,
        variant: variantName,
        props: {},
        baseId: seed.type,
        variantName,
      });
    }
  }
  return components;
}

function loadRawCatalog(): RawCatalog {
  const text = fs.readFileSync(CATALOG_PATH, "utf-8");
  const raw = JSON.parse(text) as RawCatalog;
  if (!raw || !Array.isArray(raw.styles) || !Array.isArray(raw.componentSeeds) || !Array.isArray(raw.termTemplates)) {
    throw new Error(`Design-library catalog is missing required arrays: ${CATALOG_PATH}`);
  }
  return raw;
}

function loadVibeHubTerms(): VibeHubTerms | null {
  if (!VIBE_HUB_PATH) return null;
  const code = fs.readFileSync(VIBE_HUB_PATH, "utf-8");
  const sandbox: { window: Record<string, unknown> } = { window: {} };
  vm.runInNewContext(code, sandbox, { filename: VIBE_HUB_PATH, timeout: 5000 });
  const terms = sandbox.window.VIBE_HUB_TERMS as unknown;
  if (!terms || typeof terms !== "object") return null;
  const obj = terms as { grouped?: unknown; styles?: unknown };
  if (!obj.grouped || typeof obj.grouped !== "object" || !Array.isArray(obj.styles)) {
    return null;
  }
  return obj as unknown as VibeHubTerms;
}

function slugifyVariant(name: string, en?: string): string {
  const source = (en && en.trim()) || name.trim();
  const slug = source.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "default";
}

function buildCatalogFromVibeHub(terms: VibeHubTerms): DesignLibraryCatalog {
  const components: DesignLibraryComponent[] = [];
  const categories = Object.entries(terms.grouped);
  for (const [category, items] of categories) {
    for (const term of items) {
      components.push({
        id: term.slug,
        name: term.zh || term.slug,
        description: term.youSay || term.definition || term.zh || term.slug,
        tags: [category, term.slug, ...(term.en ? [term.en.toLowerCase()] : [])],
        type: term.slug,
        variant: term.variantsList && term.variantsList.length > 0 ? slugifyVariant(term.variantsList[0].name, term.variantsList[0].en) : undefined,
        props: {},
        baseId: term.slug,
        category,
        en: term.en,
        variants: term.variantsList || [],
      });
    }
  }

  const styles = terms.styles.map((style) => {
    const base = listDesignStylesFromJson().find(
      (s) => s.id === (VIBE_HUB_STYLE_TOKEN_MAP[style.slug] || style.slug)
    );
    return {
      id: style.slug,
      name: style.zh || style.slug,
      description: style.youSay || style.definition || style.zh || style.slug,
      tags: [style.slug, ...(style.en ? [style.en.toLowerCase()] : [])],
      tokenOverrides: base?.tokenOverrides || { colors: {}, typography: {}, spacing: {}, shadows: {}, radii: {}, transitions: {} },
      motion: base?.motion,
      thumbnail: undefined,
    };
  });

  return {
    version: 2,
    source: "https://vibe-hub.org/topics/design",
    updatedAt: "2026-08-16",
    styles,
    components,
    termTemplates: [
      {
        id: "style-term",
        target: "style",
        description: "设计风格条目的命名、描述、标签与使用建议模板。",
        fields: [
          { name: "name", pattern: "{形容词}+{名词}（如 玻璃拟态、新粗野）", example: "玻璃拟态" },
          { name: "description", pattern: "一句用户可感知的话：特征 + 适合场景。", example: "半透明毛玻璃卡片、柔和阴影，适合 SaaS 与科技产品。" },
          { name: "tags", pattern: "3-5 个中英文检索词，英文小写。", example: "glass, frosted, 毛玻璃" },
          { name: "usage", pattern: "适合的页面/组件类型 + 建议动效。", example: "适合落地页与仪表盘；建议 fadeUp + lift。" },
        ],
      },
      {
        id: "component-term",
        target: "component",
        description: "组件模板与变体的命名、描述、标签与使用建议模板。",
        fields: [
          { name: "name", pattern: "{组件类型}+{变体特征}（如 主要按钮）", example: "主要按钮" },
          { name: "description", pattern: "一句话描述用途与适用场景。", example: "保存 在同一操作区域留给最重要的动作。" },
          { name: "tags", pattern: "分类、slug、英文名。", example: "按钮与链接, button, Primary" },
          { name: "usage", pattern: "适合替换哪些旧区块、建议搭配的风格。", example: "替换首屏标题区；搭配 minimal / glass 风格。" },
        ],
      },
    ],
  };
}

function listDesignStylesFromJson(): DesignLibraryStyle[] {
  try {
    const raw = loadRawCatalog();
    return raw.styles.map(assertStyle);
  } catch {
    return [];
  }
}


/** Load (and cache) the design library catalog.
 * Primary source is the local VibeHub snapshot (`client/vibe-hub-data.js`,
 * crawled from https://vibe-hub.org/topics/design); the JSON catalog is kept
 * as a deterministic fallback for environments without that snapshot.
 */
export function loadDesignLibraryCatalog(force = false): DesignLibraryCatalog {
  if (!force && cachedCatalog) return cachedCatalog;
  const vibeHub = loadVibeHubTerms();
  if (vibeHub) {
    cachedCatalog = buildCatalogFromVibeHub(vibeHub);
    return cachedCatalog;
  }
  const raw = loadRawCatalog();
  cachedCatalog = {
    version: raw.version,
    source: raw.source,
    updatedAt: raw.updatedAt,
    styles: raw.styles.map(assertStyle),
    components: expandComponents(raw.componentSeeds),
    termTemplates: raw.termTemplates.map(assertTermTemplate),
  };
  return cachedCatalog;
}

export function listDesignStyles(): DesignLibraryStyle[] {
  return loadDesignLibraryCatalog().styles.map((s) => ({ ...s, tokenOverrides: { ...s.tokenOverrides } }));
}

export function listDesignComponents(): DesignLibraryComponent[] {
  return loadDesignLibraryCatalog().components.map((c) => ({ ...c, props: { ...c.props } }));
}

export function listTermTemplates(): TermTemplate[] {
  return loadDesignLibraryCatalog().termTemplates.map((t) => ({ ...t, fields: t.fields.map((f) => ({ ...f })) }));
}

export function getDesignStyle(styleId: string): DesignLibraryStyle | undefined {
  const style = loadDesignLibraryCatalog().styles.find((s) => s.id === styleId);
  return style ? { ...style, tokenOverrides: { ...style.tokenOverrides } } : undefined;
}

export function getDesignComponent(componentId: string): DesignLibraryComponent | undefined {
  const comp = loadDesignLibraryCatalog().components.find((c) => c.id === componentId);
  return comp ? { ...comp, props: { ...comp.props } } : undefined;
}

function mergeTokenOverrides(overrides: DesignLibraryStyle["tokenOverrides"]): void {
  const categories = ["colors", "typography", "spacing", "shadows", "radii", "transitions"] as const;
  for (const category of categories) {
    const tokens = overrides[category];
    if (tokens && Object.keys(tokens).length > 0) {
      stateStore.applyTokenOverrides(category, tokens, "user");
    }
  }
}

function registerMotionProfile(styleId: string, motion?: DesignLibraryStyle["motion"]): void {
  if (!motion) return;
  const profile: MotionProfile = {
    entry: motion.entry || "fadeUp",
    hover: motion.hover || "lift",
    duration: motion.duration || 0.4,
    easing: motion.easing || "easeOut",
    stagger: motion.stagger || 0.08,
    engine: motion.engine || "css",
    scrollReveal: true,
  };
  (STYLE_MOTION_PROFILES as Record<string, MotionProfile>)[styleId] = profile;
}

export interface ApplyDesignStyleResult {
  ok: boolean;
  style_id: string;
  style_name: string;
  overrides: number;
  detail?: string;
}

/** Apply a design-library style: token overrides + state.style + motion profile. */
export function applyDesignStyle(styleId: string, source: "ai" | "user" = "user"): ApplyDesignStyleResult {
  const style = getDesignStyle(styleId);
  if (!style) {
    return { ok: false, style_id: styleId, style_name: "", overrides: 0, detail: `Unknown design style "${styleId}"` };
  }
  stateStore.setStyle(style.id, source);
  mergeTokenOverrides(style.tokenOverrides);
  registerMotionProfile(style.id, style.motion);
  const count = ["colors", "typography", "spacing", "shadows", "radii", "transitions"].reduce(
    (sum, key) => sum + Object.keys(style.tokenOverrides[key as keyof typeof style.tokenOverrides] || {}).length,
    0
  );
  return { ok: true, style_id: style.id, style_name: style.name, overrides: count };
}

export interface ApplyDesignComponentResult {
  ok: boolean;
  mode: "added" | "replaced";
  component_id: string;
  library_component_id: string;
  detail: string;
}

/**
 * Add a design-library component to the canvas, or replace an existing
 * component in place while preserving its id and layout.
 */
export function applyDesignLibraryComponent(
  libraryComponentId: string,
  targetId: string | null,
  source: "ai" | "user" = "user"
): ApplyDesignComponentResult {
  const item = getDesignComponent(libraryComponentId);
  if (!item) {
    return {
      ok: false,
      mode: "added",
      component_id: "",
      library_component_id: libraryComponentId,
      detail: `Unknown design-library component "${libraryComponentId}"`,
    };
  }

  const props = JSON.parse(JSON.stringify(item.props || {})) as Record<string, unknown>;
  if (targetId) {
    const replaced = stateStore.replaceComponent(
      targetId,
      { type: item.type, variant: item.variant, props, behavior: null, animation: null },
      source
    );
    if (replaced) {
      return {
        ok: true,
        mode: "replaced",
        component_id: targetId,
        library_component_id: item.id,
        detail: `Replaced ${targetId} with ${item.name}`,
      };
    }
  }

  const node = stateStore.addComponent(item.type, item.variant, props, null, source);
  return {
    ok: true,
    mode: "added",
    component_id: node.id,
    library_component_id: item.id,
    detail: `Added ${item.name} (${node.id})`,
  };
}

/** Re-export token type for convenience. */
export type { DesignTokens, ComponentNode };
