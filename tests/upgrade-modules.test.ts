import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { exportDesign } from "../src/tools/design-tools.js";
import { applyStyleTokenSet } from "../src/tokens.js";
import {
  VANTA_EFFECTS,
  listVantaEffects,
  getVantaEffect,
  STYLE_TO_VANTA_DEFAULT,
} from "../src/vanta-effects.js";
import {
  REACT_BITS_COMPONENTS,
  listReactBitsComponents,
  getReactBitsComponent,
  getReactBitsStats,
  generateReactBitsCode,
} from "../src/component-library/react-bits-registry.js";

beforeEach(() => {
  stateStore.resetForTests();
});

// ===== Vanta effects catalog (U2) =====

describe("vanta effects catalog", () => {
  test("exposes 14 effects with unique keys and script files", () => {
    assert.equal(VANTA_EFFECTS.length, 14);
    const keys = new Set<string>();
    const files = new Set<string>();
    for (const e of VANTA_EFFECTS) {
      assert.ok(!keys.has(e.key), `duplicate key ${e.key}`);
      assert.ok(!files.has(e.scriptFile), `duplicate scriptFile ${e.scriptFile}`);
      keys.add(e.key);
      files.add(e.scriptFile);
      assert.match(e.scriptFile, /^vanta\..+\.min\.js$/);
    }
  });

  test("listVantaEffects returns summary with paramCount", () => {
    const list = listVantaEffects();
    assert.equal(list.length, 14);
    const waves = list.find((e) => e.name === "waves");
    assert.ok(waves);
    assert.ok(waves!.paramCount >= 1);
  });

  test("getVantaEffect resolves by lowercase name or uppercase key", () => {
    assert.equal(getVantaEffect("waves")?.key, "WAVES");
    assert.equal(getVantaEffect("WAVES")?.key, "WAVES");
    assert.equal(getVantaEffect("nonexistent"), undefined);
  });

  test("every style preset has a default vanta mapping", () => {
    const styleKeys = [
      "minimal", "bold", "playful", "dark", "editorial", "tech",
      "glassmorphism", "neumorphism", "claymorphism", "aurora",
      "brutalism", "cyberpunk", "organic", "luxury",
    ];
    for (const k of styleKeys) {
      const m = STYLE_TO_VANTA_DEFAULT[k];
      assert.ok(m, `missing vanta default for ${k}`);
      assert.ok(getVantaEffect(m.effect), `${k} maps to unknown effect ${m.effect}`);
    }
  });
});

// ===== React Bits registry (U3) =====

describe("react bits registry", () => {
  test("catalog is non-empty and spans all 4 categories", () => {
    assert.ok(REACT_BITS_COMPONENTS.length >= 30);
    const cats = new Set(REACT_BITS_COMPONENTS.map((c) => c.category));
    for (const c of ["text", "animations", "components", "backgrounds"]) {
      assert.ok(cats.has(c as never), `missing category ${c}`);
    }
  });

  test("listReactBitsComponents filters by category", () => {
    const text = listReactBitsComponents("text");
    assert.ok(text.length > 0);
    assert.ok(text.every((c) => c.category === "text"));
    assert.equal(listReactBitsComponents().length, REACT_BITS_COMPONENTS.length);
  });

  test("getReactBitsComponent finds by name and returns undefined otherwise", () => {
    assert.ok(getReactBitsComponent("BlurText"));
    assert.equal(getReactBitsComponent("DoesNotExist"), undefined);
  });

  test("getReactBitsStats tallies categories and lists variants", () => {
    const stats = getReactBitsStats();
    assert.equal(stats.total, REACT_BITS_COMPONENTS.length);
    const catTotal = Object.values(stats.categories).reduce((a, b) => a + b, 0);
    assert.equal(catTotal, stats.total);
    assert.deepEqual(stats.variants, ["JS-CSS", "JS-TW", "TS-CSS", "TS-TW"]);
  });

  test("generateReactBitsCode returns a stub for known components and a note for unknown", () => {
    const code = generateReactBitsCode("BlurText", "TS-TW");
    assert.match(code, /BlurText/);
    const unknown = generateReactBitsCode("Nope");
    assert.match(unknown, /not found/);
  });
});

// ===== State: scroll (U1) =====

describe("state: scroll config", () => {
  test("setScroll persists mode + options and getScroll returns a copy", () => {
    stateStore.setScroll("lenis-gsap", { lerp: 0.08, duration: 1.2 }, "ai");
    const scroll = stateStore.getScroll();
    assert.equal(scroll?.mode, "lenis-gsap");
    assert.equal(scroll?.options.lerp, 0.08);
    // mutating the returned copy does not affect state
    scroll!.options.lerp = 999;
    assert.equal(stateStore.getScroll()?.options.lerp, 0.08);
  });

  test("addScrollToTarget auto-initializes scroll and assigns an id", () => {
    const t = stateStore.addScrollToTarget({ target: "#pricing", offset: 80, duration: 1.5, label: "Pricing" }, "ai");
    assert.ok(t.id);
    assert.equal(t.target, "#pricing");
    const scroll = stateStore.getScroll();
    assert.equal(scroll?.scrollToTargets?.length, 1);
    assert.equal(scroll?.scrollToTargets?.[0].id, t.id);
  });

  test("getScroll returns null when nothing configured", () => {
    assert.equal(stateStore.getScroll(), null);
  });
});

// ===== State: vanta backgrounds (U2) =====

describe("state: vanta backgrounds", () => {
  test("setVantaBackground stores and getVantaBackgrounds returns a copy", () => {
    stateStore.setVantaBackground("comp_a", { effect: "waves", params: { color: 0x005588 } }, "ai");
    const all = stateStore.getVantaBackgrounds();
    assert.equal(all.comp_a.effect, "waves");
    all.comp_a.effect = "mutated";
    assert.equal(stateStore.getVantaBackgrounds().comp_a.effect, "waves");
  });

  test("removeVantaBackground removes and returns true; false when absent", () => {
    stateStore.setVantaBackground("comp_a", { effect: "net", params: {} }, "ai");
    assert.equal(stateStore.removeVantaBackground("comp_a", "ai"), true);
    assert.equal(stateStore.getVantaBackgrounds().comp_a, undefined);
    assert.equal(stateStore.removeVantaBackground("comp_a", "ai"), false);
  });
});

// ===== State: react bits (U3) =====

describe("state: react bits registration", () => {
  test("registerReactBitsComponent stores and getReactBitsComponent returns a copy", () => {
    stateStore.registerReactBitsComponent("comp_b", "BlurText", "TS-TW", { text: "Hi" }, "ai");
    const got = stateStore.getReactBitsComponent("comp_b");
    assert.equal(got?.name, "BlurText");
    assert.equal(got?.variant, "TS-TW");
    assert.equal(got?.props?.text, "Hi");
    // copy isolation
    got!.props!.text = "mutated";
    assert.equal(stateStore.getReactBitsComponent("comp_b")?.props?.text, "Hi");
  });

  test("getReactBitsComponent returns null when not registered", () => {
    assert.equal(stateStore.getReactBitsComponent("nope"), null);
  });
});

// ===== State: export runtime (U4) =====

describe("state: export runtime level", () => {
  test("defaults to standard", () => {
    assert.equal(stateStore.getExportRuntime(), "standard");
  });

  test("setExportRuntime persists and is undoable", () => {
    stateStore.setExportRuntime("full", "ai");
    assert.equal(stateStore.getExportRuntime(), "full");
    assert.equal(stateStore.canUndo(), true);
    stateStore.undo();
    assert.equal(stateStore.getExportRuntime(), "standard");
  });
});

// ===== Export runtime injection into HTML (U4) =====

describe("export: runtime CDN injection", () => {
  test("minimal runtime emits no external scripts", () => {
    stateStore.setProjectName("Min", "ai");
    applyStyleTokenSet(stateStore, "bold", "#3366FF", "ai");
    stateStore.setExportRuntime("minimal", "ai");
    const html = exportDesign("html");
    assert.doesNotMatch(html, /cdn\.jsdelivr\.net/);
    assert.doesNotMatch(html, /unpkg\.com\/lenis/);
  });

  test("standard runtime + gsap style injects the GSAP CDN", () => {
    stateStore.setProjectName("Std", "ai");
    stateStore.setStyle("bold", "ai"); // bold → gsap engine
    applyStyleTokenSet(stateStore, "bold", "#3366FF", "ai");
    stateStore.setExportRuntime("standard", "ai");
    const html = exportDesign("html");
    assert.match(html, /cdn\.jsdelivr\.net\/npm\/gsap/);
  });

  test("standard runtime + lenis-gsap scroll injects Lenis CDN + init", () => {
    stateStore.setProjectName("Lenis", "ai");
    stateStore.setStyle("minimal", "ai");
    applyStyleTokenSet(stateStore, "minimal", "#111111", "ai");
    stateStore.setScroll("lenis-gsap", { lerp: 0.1 }, "ai");
    stateStore.setExportRuntime("standard", "ai");
    const html = exportDesign("html");
    assert.match(html, /unpkg\.com\/lenis@[^"]+\/dist\/lenis\.min\.js/);
    assert.match(html, /new Lenis\(/);
  });

  test("full runtime + vanta background injects three.js + vanta + init", () => {
    stateStore.setProjectName("Vanta", "ai");
    stateStore.setStyle("dark", "ai"); // dark → gsap engine
    applyStyleTokenSet(stateStore, "dark", "#0a0e14", "ai");
    const hero = stateStore.addComponent("hero", "centered", { title: "Hi" }, null, "ai");
    stateStore.setVantaBackground(hero.id, { effect: "waves", params: { color: 0x005588 } }, "ai");
    stateStore.setExportRuntime("full", "ai");
    const html = exportDesign("html");
    assert.match(html, /three\.min\.js/);
    assert.match(html, /vanta\.min\.js/);
    assert.match(html, /vanta\.waves\.min\.js/);
    assert.match(html, /VANTA\.WAVES\(/);
    assert.match(html, new RegExp(`"el":"#${hero.id}"`));
  });
});
