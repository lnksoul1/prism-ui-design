import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  generateStyleTokens,
  applyStyleTokenSet,
  SHADOW_SYSTEM_PRESETS,
} from "../src/tokens.js";
import { STYLE_PRESETS } from "../src/constants.js";

const STYLES = Object.keys(STYLE_PRESETS);
const SHADOW_NAMES = ["sm", "md", "lg", "xl", "2xl"];

describe("style preset token generation", () => {
  for (const style of STYLES) {
    describe(`style: ${style}`, () => {
      const tokens = generateStyleTokens(style);

      test("generates complete color and typography tokens", () => {
        for (const key of [
          "color-primary",
          "color-primary-dark",
          "color-primary-light",
          "color-accent",
          "color-bg",
          "color-surface",
          "color-text",
          "color-text-muted",
          "color-border",
          "color-success",
          "color-warning",
          "color-error",
        ]) {
          assert.ok(tokens.colors[key], `missing color token ${key}`);
          assert.ok(tokens.colors[key].length > 0);
        }
        for (const key of [
          "font-display",
          "font-body",
          "font-mono",
          "font-weight-normal",
          "font-weight-bold",
          "line-height-tight",
          "text-xs",
          "text-base",
          "text-2xl",
          "text-4xl",
        ]) {
          assert.ok(tokens.typography[key], `missing typography token ${key}`);
          assert.ok(tokens.typography[key].length > 0);
        }
      });

      test("generates complete spacing, radii, and transition tokens", () => {
        for (const key of ["space-0", "space-xs", "space-md", "space-lg", "space-3xl"]) {
          assert.ok(tokens.spacing[key], `missing spacing token ${key}`);
        }
        for (const key of ["radius-none", "radius-sm", "radius-lg", "radius-full"]) {
          assert.ok(tokens.radii[key], `missing radius token ${key}`);
        }
        for (const key of ["transition-fast", "transition-normal", "transition-slow", "transition-spring"]) {
          assert.ok(tokens.transitions[key], `missing transition token ${key}`);
        }
      });

      test("generates 5 elevation shadow tokens matching the shadow presets", () => {
        const expected = SHADOW_SYSTEM_PRESETS[STYLE_PRESETS[style].shadow_style];
        for (let i = 0; i < SHADOW_NAMES.length; i++) {
          const key = `shadow-${SHADOW_NAMES[i]}`;
          assert.ok(tokens.shadows[key], `missing shadow token ${key}`);
          assert.equal(tokens.shadows[key], expected[i].shadow);
        }
      });
    });
  }
});

describe("shared shadow presets", () => {
  test("cover subtle, medium, and sharp with 5 levels each", () => {
    assert.deepEqual(Object.keys(SHADOW_SYSTEM_PRESETS).sort(), ["medium", "sharp", "subtle"]);
    for (const preset of Object.values(SHADOW_SYSTEM_PRESETS)) {
      assert.equal(preset.length, 5);
      for (const level of preset) {
        assert.ok(level.shadow.length > 0);
        assert.ok(level.usage.length > 0);
      }
    }
  });
});

describe("generateStyleTokens edge cases", () => {
  test("invalid base color falls back to the preset base color", () => {
    const withInvalid = generateStyleTokens("bold", "#zzz");
    const fallback = generateStyleTokens("bold");
    assert.equal(withInvalid.baseHex, fallback.baseHex);
  });

  test("valid base color is normalized to uppercase hex", () => {
    const tokens = generateStyleTokens("minimal", "#ff5733");
    assert.equal(tokens.baseHex, "#FF5733");
  });

  test("unknown style throws", () => {
    assert.throws(() => generateStyleTokens("not_a_style"), /Unknown style preset/);
  });

  test("every generated token value is a non-empty string", () => {
    for (const style of STYLES) {
      const tokens = generateStyleTokens(style);
      for (const category of ["colors", "typography", "spacing", "shadows", "radii", "transitions"] as const) {
        for (const [key, value] of Object.entries(tokens[category])) {
          assert.equal(typeof value, "string", `${style}.${category}.${key}`);
          assert.ok(value.length > 0, `${style}.${category}.${key} is empty`);
        }
      }
    }
  });

  test("baseHex is always a normalized hex color", () => {
    for (const style of STYLES) {
      assert.match(generateStyleTokens(style).baseHex, /^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("applyStyleTokenSet", () => {
  test("writes all six token categories including shadows", () => {
    const calls: Array<{ category: string; tokens: Record<string, string>; source: string }> = [];
    const fakeStore = {
      setTokenBatch(category: string, tokens: Record<string, string>, source: string) {
        calls.push({ category, tokens, source });
      },
    };

    const result = applyStyleTokenSet(fakeStore as never, "tech", "#3366FF", "user");

    assert.equal(calls.length, 6);
    assert.deepEqual(
      calls.map((c) => c.category).sort(),
      ["colors", "radii", "shadows", "spacing", "transitions", "typography"]
    );
    assert.ok(calls.every((c) => c.source === "user"));
    const shadowCall = calls.find((c) => c.category === "shadows")!;
    assert.ok(shadowCall.tokens["shadow-md"]);
    assert.equal(result.shadows["shadow-md"], shadowCall.tokens["shadow-md"]);
  });
});
