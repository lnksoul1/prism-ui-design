/**
 * Animation engine abstraction layer (upgrade plan U1).
 *
 * Provides a unified registry for animations across multiple engines:
 *   - `css`: lightweight keyframe presets (legacy 13 entry + 7 hover, no runtime deps)
 *   - `gsap`: GSAP-powered presets (ScrollTrigger / SplitText / MorphSVG / Flip / Draggable)
 *
 * Each preset declares its engine, category (entry/hover/timeline/loop), the
 * runtime dependencies it needs (CDN modules), the parameter schema, and a
 * serializer that emits runnable code for HTML / React exports.
 *
 * The MCP layer (design_set_animation, design_preview_animation, design_export)
 * queries this registry to validate presets, list available engines, and emit
 * the right runtime code per export target.
 */

export type AnimationEngine = "css" | "gsap";
export type AnimationCategory = "entry" | "hover" | "timeline" | "loop";

export interface AnimationParamSchema {
  name: string;
  type: "number" | "string" | "boolean" | "color";
  default: number | string | boolean;
  min?: number;
  max?: number;
  description: string;
}

export interface ScrollTriggerConfig {
  start?: string; // e.g. "top 80%"
  end?: string; // e.g. "bottom 20%"
  scrub?: boolean | number;
  pin?: boolean;
  markers?: boolean;
  toggleActions?: string; // e.g. "play none none reverse"
}

export interface AnimationPreset {
  /** Unique preset name, namespaced by engine (e.g. "fadeUp", "gsap.splitBlur"). */
  name: string;
  engine: AnimationEngine;
  category: AnimationCategory;
  description: string;
  /** Runtime deps this preset needs (for export CDN injection). */
  deps: string[];
  /** Customizable parameters. */
  params: AnimationParamSchema[];
  /** Whether this preset supports ScrollTrigger config. */
  supportsScrollTrigger?: boolean;
}

// ===== Registry =====

const REGISTRY = new Map<string, AnimationPreset>();

export function registerAnimationPreset(preset: AnimationPreset): void {
  REGISTRY.set(preset.name, preset);
}

export function getAnimationPreset(name: string): AnimationPreset | undefined {
  return REGISTRY.get(name);
}

export function listAnimationPresets(engine?: AnimationEngine): AnimationPreset[] {
  const all = Array.from(REGISTRY.values());
  return engine ? all.filter((p) => p.engine === engine) : all;
}

export function listAnimationEngines(): Array<{
  name: AnimationEngine;
  presetCount: number;
  deps: string[];
}> {
  const engines: AnimationEngine[] = ["css", "gsap"];
  return engines.map((name) => {
    const presets = listAnimationPresets(name);
    const deps = new Set<string>();
    presets.forEach((p) => p.deps.forEach((d) => deps.add(d)));
    return { name, presetCount: presets.length, deps: Array.from(deps).sort() };
  });
}

// ===== Default params helper =====

export function getDefaultParams(preset: AnimationPreset): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {};
  preset.params.forEach((p) => {
    out[p.name] = p.default;
  });
  return out;
}

// NOTE: preset self-registration is triggered by the app entry
// (src/index.ts imports ./animations/css-presets.js + ./animations/gsap-presets.js).
// Importing them here would create a circular dependency (ESM hoists imports
// above `const REGISTRY`, causing a TDZ "Cannot access 'REGISTRY' before
// initialization" error). Keeping this module a leaf avoids that.
