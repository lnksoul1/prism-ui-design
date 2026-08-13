/**
 * CSS keyframe presets (legacy 13 entry + 7 hover, migrated to the registry).
 *
 * These require zero runtime dependencies — they serialize to inline CSS
 * `@keyframes` + class assignments. They remain the default engine so existing
 * `design_set_animation(entry="fadeUp")` calls keep working unchanged.
 */

import { registerAnimationPreset } from "./index.js";

const COMMON_DURATION = { min: 0.1, max: 3.0, default: 0.3 };
const COMMON_STAGGER = { min: 0, max: 1.0, default: 0 };

function numParam(name: string, description: string, opts: { min: number; max: number; default: number }) {
  return { name, type: "number" as const, min: opts.min, max: opts.max, default: opts.default, description };
}

// ===== 13 Entry animations (matches design-tools.ts L1342-1343) =====

const ENTRY_NAMES: Array<[string, string]> = [
  ["fadeUp", "Fade in + slide up"],
  ["fadeIn", "Fade in"],
  ["scaleIn", "Scale up from 0.9"],
  ["slideLeft", "Slide in from right"],
  ["slideRight", "Slide in from left"],
  ["slideUp", "Slide up from bottom"],
  ["spring", "Spring bounce in"],
  ["bounceIn", "Bounce in"],
  ["flipIn", "Flip in on X axis"],
  ["cinematic", "Cinematic zoom + fade"],
  ["shimmer", "Shimmer sweep"],
  ["glitch", "Glitch distortion"],
  ["morphBlob", "Morph from blob shape"],
];

ENTRY_NAMES.forEach(([name, description]) => {
  registerAnimationPreset({
    name,
    engine: "css",
    category: "entry",
    description,
    deps: [],
    params: [
      numParam("duration", "Duration in seconds", COMMON_DURATION),
      numParam("delay", "Delay in seconds", { min: 0, max: 3.0, default: 0 }),
      {
        name: "curve",
        type: "string",
        default: "easeOut",
        description: "Easing curve (ease, easeOut, easeInOut, spring, linear, bounce)",
      },
      numParam("stagger", "Child stagger delay in seconds", COMMON_STAGGER),
    ],
  });
});

// ===== 7 Hover animations (matches design-tools.ts L1344) =====

const HOVER_NAMES: Array<[string, string]> = [
  ["scaleUp", "Scale up on hover"],
  ["lift", "Lift up with shadow"],
  ["glow", "Glow effect"],
  ["ripple", "Ripple from click point"],
  ["spotlight", "Spotlight follows cursor"],
  ["magnetic", "Magnetic pull toward cursor"],
  ["tilt", "3D tilt on hover"],
];

HOVER_NAMES.forEach(([name, description]) => {
  registerAnimationPreset({
    name,
    engine: "css",
    category: "hover",
    description,
    deps: [],
    params: [
      numParam("duration", "Duration in seconds", COMMON_DURATION),
      {
        name: "curve",
        type: "string",
        default: "easeOut",
        description: "Easing curve",
      },
    ],
  });
});

export const CSS_PRESET_COUNT = ENTRY_NAMES.length + HOVER_NAMES.length;
