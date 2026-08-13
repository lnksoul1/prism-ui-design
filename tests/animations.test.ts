import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Importing css-presets + gsap-presets triggers registration (same as src/index.ts).
import "../src/animations/css-presets.js";
import "../src/animations/gsap-presets.js";
import {
  listAnimationEngines,
  listAnimationPresets,
  getAnimationPreset,
  getDefaultParams,
  registerAnimationPreset,
  type AnimationPreset,
} from "../src/animations/index.js";
import {
  serializeCssPreset,
  serializeGsapPreset,
  cdnScriptsForDeps,
  collectDeps,
  generateLenisGsapInit,
  CDN_URLS,
} from "../src/animations/serializer.js";
import { STYLE_MOTION_PROFILES, getMotionProfile } from "../src/constants.js";

describe("animation registry: css presets", () => {
  test("registers 13 css entry presets + 7 css hover presets (20 total)", () => {
    const css = listAnimationPresets("css");
    const entry = css.filter((p) => p.category === "entry");
    const hover = css.filter((p) => p.category === "hover");
    assert.equal(css.length, 20);
    assert.equal(entry.length, 13);
    assert.equal(hover.length, 7);
  });

  test("legacy preset names remain available for backward compatibility", () => {
    for (const name of ["fadeUp", "fadeIn", "scaleIn", "spring", "cinematic", "glitch"]) {
      const p = getAnimationPreset(name);
      assert.ok(p, `expected preset ${name}`);
      assert.equal(p!.engine, "css");
    }
  });

  test("css presets declare no runtime deps", () => {
    for (const p of listAnimationPresets("css")) {
      assert.deepEqual(p.deps, []);
    }
  });
});

describe("animation registry: gsap presets", () => {
  test("registers 27 gsap presets across entry/hover/timeline/loop", () => {
    const gsap = listAnimationPresets("gsap");
    const byCat = (c: string) => gsap.filter((p) => p.category === c).length;
    assert.equal(gsap.length, 27);
    assert.equal(byCat("entry"), 12);
    assert.equal(byCat("hover"), 8);
    assert.equal(byCat("timeline"), 4);
    assert.equal(byCat("loop"), 3);
  });

  test("gsap presets declare their CDN deps", () => {
    const splitBlur = getAnimationPreset("gsap.splitBlur");
    assert.ok(splitBlur);
    assert.ok(splitBlur!.deps.includes("gsap"));
    assert.ok(splitBlur!.deps.includes("SplitText"));
    // scroll-capable presets flag supportScrollTrigger separately from deps
    assert.equal(splitBlur!.supportsScrollTrigger, true);
  });

  test("scroll-capable presets set supportsScrollTrigger", () => {
    const scrollReveal = getAnimationPreset("gsap.scrollReveal");
    assert.ok(scrollReveal);
    assert.equal(scrollReveal!.supportsScrollTrigger, true);
  });
});

describe("animation registry: engines manifest", () => {
  test("listAnimationEngines reports both engines with their deps", () => {
    const engines = listAnimationEngines();
    assert.equal(engines.length, 2);
    const css = engines.find((e) => e.name === "css");
    const gsap = engines.find((e) => e.name === "gsap");
    assert.ok(css);
    assert.ok(gsap);
    assert.deepEqual(css!.deps, []);
    assert.ok(gsap!.deps.length > 0);
    assert.ok(gsap!.deps.includes("gsap"));
  });
});

describe("animation registry: register + getDefaultParams", () => {
  test("registerAnimationPreset adds a new preset", () => {
    const preset: AnimationPreset = {
      name: "test.customFade",
      engine: "css",
      category: "entry",
      description: "test",
      deps: [],
      params: [
        { name: "duration", type: "number", default: 0.5, description: "dur" },
        { name: "curve", type: "string", default: "easeOut", description: "curve" },
      ],
    };
    registerAnimationPreset(preset);
    assert.equal(getAnimationPreset("test.customFade"), preset);
    const defaults = getDefaultParams(preset);
    assert.equal(defaults.duration, 0.5);
    assert.equal(defaults.curve, "easeOut");
  });
});

describe("serializer: css preset", () => {
  test("serializeCssPreset emits @keyframes + animation rule", () => {
    const out = serializeCssPreset("fadeUp", ".hero", { duration: 0.6, delay: 0.1, curve: "easeOut", stagger: 0 });
    assert.match(out, /@keyframes fadeUp/);
    assert.match(out, /\.hero\{animation:fadeUp 0\.6s easeOut 0\.1s both/);
  });

  test("serializeCssPreset returns empty for unknown preset", () => {
    assert.equal(serializeCssPreset("does.not.exist", ".x", {}), "");
  });
});

describe("serializer: gsap preset", () => {
  test("serializeGsapPreset emits a gsap call referencing the selector", () => {
    const out = serializeGsapPreset("gsap.fadeUpStagger", ".card", { duration: 0.8, yOffset: 30, stagger: 0.05, ease: "power2.out" });
    assert.match(out, /gsap\.from\(/);
    assert.match(out, /\.card/);
    assert.match(out, /stagger:0\.05/);
  });

  test("serializeGsapPreset returns empty string for unknown presets", () => {
    assert.equal(serializeGsapPreset("gsap.doesNotExist", ".x", {}), "");
  });

  test("serializeGsapPreset injects scrollTrigger config when provided", () => {
    const out = serializeGsapPreset(
      "gsap.scrollReveal",
      ".section",
      { duration: 1, yOffset: 40, ease: "power3.out" },
      { start: "top 80%", end: "bottom 20%", scrub: true, pin: false, markers: false, toggleActions: "play none none reverse" }
    );
    assert.match(out, /scrollTrigger:/);
    assert.match(out, /"top 80%"/);
  });
});

describe("serializer: cdn helpers", () => {
  test("cdnScriptsForDeps dedupes and maps deps to script tags", () => {
    const tags = cdnScriptsForDeps(["gsap", "ScrollTrigger", "gsap", "SplitText"]);
    assert.equal(tags.length, 3);
    assert.ok(tags.every((t) => t.startsWith("<script src=")));
    assert.ok(tags.some((t) => t.includes(CDN_URLS.gsap)));
    assert.ok(tags.some((t) => t.includes(CDN_URLS.gsapScrollTrigger)));
    assert.ok(tags.some((t) => t.includes(CDN_URLS.gsapSplitText)));
  });

  test("collectDeps skips css-engine animations and aggregates gsap deps", () => {
    const deps = collectDeps([
      { engine: "css", preset: "fadeUp" },
      { engine: "gsap", preset: "gsap.splitBlur" }, // deps: gsap, SplitText
      { engine: "gsap", preset: "gsap.magnetic" },  // deps: gsap
    ]);
    assert.ok(deps.includes("gsap"));
    assert.ok(deps.includes("SplitText"));
    // gsap.magnetic only depends on gsap core, not Draggable
    assert.ok(!deps.includes("Draggable"));
  });

  test("generateLenisGsapInit emits a guarded init script with reduced-motion check", () => {
    const html = generateLenisGsapInit({ lerp: 0.08 });
    assert.match(html, /<script>/);
    assert.match(html, /prefers-reduced-motion/);
    assert.match(html, /new Lenis\(/);
    assert.match(html, /"lerp":0\.08/);
  });
});

describe("motion profiles (upgrade plan U4)", () => {
  test("every style preset has a motion profile", () => {
    const styleKeys = [
      "minimal", "bold", "playful", "dark", "editorial", "tech",
      "glassmorphism", "neumorphism", "claymorphism", "aurora",
      "brutalism", "cyberpunk", "organic", "luxury",
    ];
    for (const k of styleKeys) {
      const m = STYLE_MOTION_PROFILES[k];
      assert.ok(m, `missing motion profile for ${k}`);
      assert.ok(m.entry, `${k} missing entry`);
      assert.ok(m.hover, `${k} missing hover`);
      assert.ok(m.duration > 0);
      assert.ok(m.engine === "css" || m.engine === "gsap");
    }
  });

  test("getMotionProfile falls back to minimal for unknown styles", () => {
    assert.equal(getMotionProfile("nonexistent"), STYLE_MOTION_PROFILES.minimal);
  });

  test("bold/aurora/cyberpunk prefer the gsap engine", () => {
    for (const k of ["bold", "aurora", "cyberpunk"]) {
      assert.equal(getMotionProfile(k).engine, "gsap");
    }
  });

  test("minimal/editorial/organic prefer the css engine", () => {
    for (const k of ["minimal", "editorial", "organic"]) {
      assert.equal(getMotionProfile(k).engine, "css");
    }
  });
});
