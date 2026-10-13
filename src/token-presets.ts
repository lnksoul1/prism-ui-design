/**
 * Radius / shadow scale helpers.
 *
 * Extracted from the removed `style-guides.ts`: the named style-guide and brand
 * design-system libraries were deleted in the route B refactor (their data was
 * commented out and unreachable), but semantic styling still needs to translate
 * an adjective-driven radius/shadow mood into token values.
 *
 * The underlying presets live in `tokens.ts`; these helpers only shape them into
 * the `radius-*` / `shadow-*` token naming.
 */

import { RADIUS_PRESETS, SHADOW_SYSTEM_PRESETS } from "./tokens.js";

const RADIUS_NAMES = ["none", "sm", "md", "lg", "xl"];
const SHADOW_NAMES = ["sm", "md", "lg", "xl", "2xl"];

/** Radius token set for a named style (used by semantic styling). */
export function radiusSetFor(style: "sharp" | "subtle" | "rounded" | "pill"): Record<string, string> {
  const values = RADIUS_PRESETS[style];
  const radii: Record<string, string> = {};
  RADIUS_NAMES.forEach((name, i) => {
    radii[`radius-${name}`] = `${values[i]}px`;
  });
  radii["radius-full"] = "9999px";
  return radii;
}

/** Shadow token set for a named style (used by semantic styling). */
export function shadowSetFor(style: "subtle" | "medium" | "sharp"): Record<string, string> {
  const preset = SHADOW_SYSTEM_PRESETS[style];
  const shadows: Record<string, string> = {};
  SHADOW_NAMES.forEach((name, i) => {
    shadows[`shadow-${name}`] = preset[i].shadow;
  });
  return shadows;
}
