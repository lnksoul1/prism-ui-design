import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  STYLE_PRESETS,
  STYLE_MOTION_PROFILES,
  STYLE_MOTION_PROFILES as MOTION,
  MOTION_TOKENS,
  getMotionProfile,
  type StylePreset,
} from "../src/constants.js";
import {
  STYLE_PRESETS_V2,
  getActiveStylePreset,
  listAllStyleSlugs,
  isV2Style,
  V2_STYLE_COUNT,
} from "../src/style-presets-v2.js";
import { STYLE_TO_VANTA_DEFAULT, getVantaEffect, VANTA_EFFECTS } from "../src/vanta-effects.js";

const NEW_STYLES = [
  "bento", "material", "shadcn", "neobrutalism", "mono", "neon", "gradient",
  "vibrant", "doodle", "paper", "cosmic", "immersive", "retro", "vintage",
  "spacious", "storytelling",
];
const LEGACY_STYLES = [
  "minimal", "bold", "playful", "dark", "editorial", "tech", "glassmorphism",
  "neumorphism", "claymorphism", "aurora", "brutalism", "cyberpunk", "organic", "luxury",
];
const ALL_STYLES = [...LEGACY_STYLES, ...NEW_STYLES];

// ===== V2 风格库完整性 =====

describe("style-presets-v2: V2 风格库完整性", () => {
  test("V2 包含全部 30 个风格（14 legacy + 16 new）", () => {
    assert.equal(V2_STYLE_COUNT, 30);
    for (const slug of ALL_STYLES) {
      assert.ok(slug in STYLE_PRESETS_V2, `V2 缺少风格 ${slug}`);
    }
  });

  test("每个 V2 风格都有完整的元信息字段", () => {
    for (const slug of ALL_STYLES) {
      const p = STYLE_PRESETS_V2[slug];
      assert.ok(p.slug, `${slug} 缺少 slug`);
      assert.ok(p.category, `${slug} 缺少 category`);
      assert.ok(p.inspiration, `${slug} 缺少 inspiration`);
      assert.ok(p.description, `${slug} 缺少 description`);
    }
  });

  test("每个 V2 风格都有完整颜色系统（8 个子结构）", () => {
    for (const slug of ALL_STYLES) {
      const c = STYLE_PRESETS_V2[slug].colors;
      assert.ok(c, `${slug} 缺少 colors`);
      // light/dark 语义色各 11 字段
      for (const key of ["primary", "onPrimary", "primaryHover", "primaryFocus", "primaryPressed", "secondary", "accent", "success", "warning", "danger", "info"]) {
        assert.ok(c.light[key as keyof typeof c.light], `${slug}.colors.light 缺少 ${key}`);
        assert.ok(c.dark[key as keyof typeof c.dark], `${slug}.colors.dark 缺少 ${key}`);
      }
      // surface/text/border 各 4/4/3 字段
      for (const key of ["canvas", "surface1", "surface2", "surface3", "surface4"]) {
        assert.ok(c.surfaceLight[key as keyof typeof c.surfaceLight], `${slug}.surfaceLight 缺少 ${key}`);
        assert.ok(c.surfaceDark[key as keyof typeof c.surfaceDark], `${slug}.surfaceDark 缺少 ${key}`);
      }
      for (const key of ["ink", "inkMuted", "inkSubtle", "inkTertiary"]) {
        assert.ok(c.textLight[key as keyof typeof c.textLight], `${slug}.textLight 缺少 ${key}`);
      }
      for (const key of ["hairline", "hairlineStrong", "hairlineTertiary"]) {
        assert.ok(c.borderLight[key as keyof typeof c.borderLight], `${slug}.borderLight 缺少 ${key}`);
      }
    }
  });

  test("每个 V2 风格都有字体系统（三族 + typeScale）", () => {
    for (const slug of ALL_STYLES) {
      const f = STYLE_PRESETS_V2[slug].font;
      assert.ok(f, `${slug} 缺少 font`);
      assert.ok(f.display.name, `${slug} font.display 缺少 name`);
      assert.ok(f.display.family, `${slug} font.display 缺少 family`);
      assert.ok(f.display.weights.length > 0, `${slug} font.display 缺少 weights`);
      assert.ok(f.body.name);
      assert.ok(f.mono.name);
      assert.ok(f.typeScale.length >= 8, `${slug} typeScale 应 ≥ 8 个 token，实际 ${f.typeScale.length}`);
    }
  });

  test("每个 V2 风格都有完整 spacing/radius/elevation 阶梯", () => {
    for (const slug of ALL_STYLES) {
      const p = STYLE_PRESETS_V2[slug];
      assert.equal(Object.keys(p.spacingScale!).length, 8, `${slug} spacingScale 应 8 级`);
      assert.equal(Object.keys(p.radiusScale!).length, 8, `${slug} radiusScale 应 8 级`);
      assert.equal(Object.keys(p.elevation!).length, 5, `${slug} elevation 应 5 级`);
    }
  });

  test("每个 V2 风格都有 a11y 规范", () => {
    for (const slug of ALL_STYLES) {
      const a = STYLE_PRESETS_V2[slug].a11y;
      assert.ok(a, `${slug} 缺少 a11y`);
      assert.ok(a!.wcagLevel === "AA" || a!.wcagLevel === "AAA");
      assert.ok(a!.keyboardFirst === true);
      assert.ok(a!.minTouchTarget >= 44);
      assert.ok(a!.focusRingSpec);
    }
  });

  test("每个 V2 风格都有治理三件套（doRules/dontRules/qualityGates）", () => {
    for (const slug of ALL_STYLES) {
      const p = STYLE_PRESETS_V2[slug];
      assert.ok(p.doRules!.length >= 2, `${slug} doRules 应 ≥ 2 条`);
      assert.ok(p.dontRules!.length >= 2, `${slug} dontRules 应 ≥ 2 条`);
      assert.ok(p.qualityGates!.length >= 2, `${slug} qualityGates 应 ≥ 2 条`);
      assert.ok(p.writingTone!.length >= 2, `${slug} writingTone 应 ≥ 2 个`);
    }
  });

  test("每个 V2 风格都有 recommendedReactBits", () => {
    for (const slug of ALL_STYLES) {
      const r = STYLE_PRESETS_V2[slug].recommendedReactBits;
      assert.ok(r, `${slug} 缺少 recommendedReactBits`);
      assert.ok(r!.length >= 2, `${slug} recommendedReactBits 应 ≥ 2 个`);
    }
  });

  test("V2 风格保留旧字段（向后兼容）", () => {
    for (const slug of ALL_STYLES) {
      const p = STYLE_PRESETS_V2[slug];
      assert.ok(typeof p.base_hue === "number");
      assert.ok(p.bg_light && p.bg_dark);
      assert.ok(p.text_light && p.text_dark);
    }
  });
});

// ===== 新增 16 风格 =====

describe("style-presets-v2: 新增 16 风格", () => {
  test("16 个新风格 slug 与 awesome-design-skills 对齐", () => {
    assert.equal(NEW_STYLES.length, 16);
    for (const slug of NEW_STYLES) {
      assert.ok(isV2Style(slug), `${slug} 应为 V2 风格`);
    }
  });

  test("新风格覆盖 8 个 category", () => {
    const cats = new Set(NEW_STYLES.map((s) => STYLE_PRESETS_V2[s].category));
    const expected = ["foundational", "expressive", "textured", "editorial", "technical", "retro", "playful", "immersive"];
    for (const c of expected) {
      assert.ok(cats.has(c as never), `缺少 category ${c}`);
    }
  });

  test("slug 与 name 一致性", () => {
    const checks: Record<string, string> = {
      bento: "Bento", material: "Material", shadcn: "Shadcn", neobrutalism: "Neobrutalism",
      mono: "Mono", neon: "Neon", gradient: "Gradient", vibrant: "Vibrant",
      doodle: "Doodle", paper: "Paper", cosmic: "Cosmic", immersive: "Immersive",
      retro: "Retro", vintage: "Vintage", spacious: "Spacious", storytelling: "Storytelling",
    };
    for (const [slug, name] of Object.entries(checks)) {
      assert.equal(STYLE_PRESETS_V2[slug].name, name);
    }
  });
});

// ===== Motion Profile 完整性 =====

describe("style-presets-v2: motion profile 完整性", () => {
  test("全部 30 个风格都有 motion profile", () => {
    for (const slug of ALL_STYLES) {
      const m = STYLE_MOTION_PROFILES[slug];
      assert.ok(m, `${slug} 缺少 motion profile`);
      assert.ok(m.entry, `${slug} motion.entry 缺失`);
      assert.ok(m.hover, `${slug} motion.hover 缺失`);
      assert.ok(m.duration > 0);
      assert.ok(m.engine === "css" || m.engine === "gsap");
    }
  });

  test("新增风格的 entry/hover 指向已注册的动画预设名", () => {
    // 这些名称应在 css-presets.ts 或 gsap-presets.ts 中注册
    // 此处仅校验非空且为字符串（实际预设存在性由 animations.test.ts 覆盖）
    for (const slug of NEW_STYLES) {
      const m = STYLE_MOTION_PROFILES[slug];
      assert.equal(typeof m.entry, "string");
      assert.equal(typeof m.hover, "string");
    }
  });

  test("gsap 引擎的新风格：neon/gradient/cosmic/immersive/storytelling", () => {
    for (const slug of ["neon", "gradient", "cosmic", "immersive", "storytelling"]) {
      assert.equal(STYLE_MOTION_PROFILES[slug].engine, "gsap");
    }
  });

  test("css 引擎的新风格：bento/material/shadcn/mono/vibrant", () => {
    for (const slug of ["bento", "material", "shadcn", "mono", "vibrant"]) {
      assert.equal(STYLE_MOTION_PROFILES[slug].engine, "css");
    }
  });

  test("getMotionProfile 对未知风格回退到 minimal", () => {
    const fallback = getMotionProfile("nonexistent");
    assert.equal(fallback.entry, STYLE_MOTION_PROFILES.minimal.entry);
  });
});

// ===== MotionTokenSet（S4）=====

describe("style-presets-v2: MotionTokenSet", () => {
  test("MOTION_TOKENS 含 5 级 duration", () => {
    const d = MOTION_TOKENS.duration;
    assert.equal(Object.keys(d).length, 5);
    assert.ok(d.instant < d.fast && d.fast < d.normal && d.normal < d.slow && d.slow < d.cinematic);
    assert.equal(d.instant, 0.1);
    assert.equal(d.cinematic, 1.2);
  });

  test("MOTION_TOKENS 含 5 种 easing", () => {
    const e = MOTION_TOKENS.easing;
    assert.equal(Object.keys(e).length, 5);
    assert.match(e.standard, /cubic-bezier/);
    assert.match(e.spring, /back\.out/);
    assert.match(e.steps, /steps\(/);
  });

  test("MOTION_TOKENS 含 3 级 stagger", () => {
    const s = MOTION_TOKENS.stagger;
    assert.equal(Object.keys(s).length, 3);
    assert.ok(s.tight < s.normal && s.normal < s.relaxed);
  });

  test("MOTION_TOKENS 含 scrollTrigger 默认配置", () => {
    assert.ok(MOTION_TOKENS.scrollTrigger);
    assert.match(MOTION_TOKENS.scrollTrigger!.start, /top/);
    assert.match(MOTION_TOKENS.scrollTrigger!.end, /bottom/);
  });
});

// ===== Vanta 映射完整性 =====

describe("style-presets-v2: Vanta 背景映射", () => {
  test("全部 30 个风格都有 Vanta 默认映射", () => {
    for (const slug of ALL_STYLES) {
      const v = STYLE_TO_VANTA_DEFAULT[slug];
      assert.ok(v, `${slug} 缺少 Vanta 映射`);
      assert.ok(v.effect, `${slug} Vanta effect 缺失`);
      // effect 必须是已注册的 14 个之一
      assert.ok(getVantaEffect(v.effect), `${slug} 的 Vanta effect "${v.effect}" 未注册`);
    }
  });

  test("新风格映射使用合法 effect key", () => {
    const validEffects = new Set(VANTA_EFFECTS.map((e) => e.key.toLowerCase()));
    for (const slug of NEW_STYLES) {
      const fx = STYLE_TO_VANTA_DEFAULT[slug].effect.toLowerCase();
      assert.ok(validEffects.has(fx), `${slug} 映射到未知 effect ${fx}`);
    }
  });
});

// ===== 迁移函数 =====

describe("style-presets-v2: 迁移函数", () => {
  test("getActiveStylePreset 优先返回 V2 完整数据", () => {
    const p = getActiveStylePreset("minimal");
    assert.ok(p.colors, "应返回 V2 带 colors 的数据");
    assert.ok(p.font, "应返回 V2 带 font 的数据");
  });

  test("getActiveStylePreset 对 V2 风格返回完整数据", () => {
    const p = getActiveStylePreset("bento");
    assert.equal(p.slug, "bento");
    assert.ok(p.colors);
    assert.ok(p.doRules);
  });

  test("getActiveStylePreset 对未知风格回退到 minimal", () => {
    const p = getActiveStylePreset("nonexistent");
    assert.equal(p.slug, "minimal");
  });

  test("listAllStyleSlugs 合并 V2 + LEGACY", () => {
    const slugs = listAllStyleSlugs();
    assert.ok(slugs.length >= 30);
    for (const s of ALL_STYLES) {
      assert.ok(slugs.includes(s), `listAllStyleSlugs 缺少 ${s}`);
    }
  });

  test("isV2Style 正确识别", () => {
    assert.equal(isV2Style("bento"), true);
    assert.equal(isV2Style("minimal"), true);
    assert.equal(isV2Style("nonexistent"), false);
  });
});

// ===== 向后兼容 =====

describe("style-presets-v2: 向后兼容", () => {
  test("旧 STYLE_PRESETS 仍存在且包含 14 个 legacy 风格", () => {
    for (const slug of LEGACY_STYLES) {
      assert.ok(slug in STYLE_PRESETS, `legacy STYLE_PRESETS 缺少 ${slug}`);
    }
  });

  test("V2 风格的旧字段与 legacy 一致（bg/text/shadow/radius）", () => {
    for (const slug of LEGACY_STYLES) {
      const legacy = STYLE_PRESETS[slug];
      const v2 = STYLE_PRESETS_V2[slug];
      assert.equal(v2.bg_light, legacy.bg_light, `${slug} bg_light 不一致`);
      assert.equal(v2.bg_dark, legacy.bg_dark, `${slug} bg_dark 不一致`);
      assert.equal(v2.text_light, legacy.text_light, `${slug} text_light 不一致`);
      assert.equal(v2.text_dark, legacy.text_dark, `${slug} text_dark 不一致`);
      assert.equal(v2.shadow_style, legacy.shadow_style, `${slug} shadow_style 不一致`);
      assert.equal(v2.radius_style, legacy.radius_style, `${slug} radius_style 不一致`);
      assert.equal(v2.spacing_base, legacy.spacing_base, `${slug} spacing_base 不一致`);
    }
  });

  test("旧 FONT_PAIRINGS 引用的 style 仍可用", () => {
    // minimal/bold/editorial/playful/tech 等 legacy 风格在 V2 中存在
    for (const slug of ["minimal", "bold", "editorial", "playful", "tech"]) {
      assert.ok(slug in STYLE_PRESETS_V2);
    }
  });
});

// ===== 数据质量抽查 =====

describe("style-presets-v2: 数据质量抽查", () => {
  test("所有颜色值为合法 hex（# 开头，6 位）", () => {
    const hexRe = /^#[0-9a-fA-F]{6}$/;
    for (const slug of ALL_STYLES) {
      const p = STYLE_PRESETS_V2[slug];
      assert.match(p.bg_light, hexRe, `${slug} bg_light 非法 hex`);
      assert.match(p.bg_dark, hexRe, `${slug} bg_dark 非法 hex`);
      assert.match(p.colors!.light.primary, hexRe, `${slug} primary 非法 hex`);
      assert.match(p.colors!.light.success, hexRe, `${slug} success 非法 hex`);
    }
  });

  test("onPrimary 与 primary 对比度合理（明暗分离）", () => {
    for (const slug of ALL_STYLES) {
      const c = STYLE_PRESETS_V2[slug].colors!.light;
      // onPrimary 与 primary 不应完全相同
      assert.notEqual(c.onPrimary, c.primary, `${slug} onPrimary 与 primary 相同`);
    }
  });

  test("radiusScale 的 full 为 9999（圆形）", () => {
    for (const slug of ALL_STYLES) {
      assert.equal(STYLE_PRESETS_V2[slug].radiusScale!.full, 9999, `${slug} radius.full 应为 9999`);
    }
  });

  test("breakpoints 符合 5 级标准（480/768/1024/1280/1440）", () => {
    for (const slug of ALL_STYLES) {
      const b = STYLE_PRESETS_V2[slug].breakpoints!;
      assert.equal(b.mobile, 480);
      assert.equal(b.mobileLg, 768);
      assert.equal(b.tablet, 1024);
      assert.equal(b.desktop, 1280);
      assert.equal(b.desktopXL, 1440);
    }
  });
});
