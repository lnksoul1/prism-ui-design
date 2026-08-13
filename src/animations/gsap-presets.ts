/**
 * GSAP-powered animation presets (upgrade plan U1, 27 presets).
 *
 * These serialize to `gsap.context(() => {...})` code blocks for HTML export,
 * or `useGSAP(() => {...})` hooks for React export. Each preset declares the
 * GSAP plugins it depends on so the export layer knows which CDN scripts to
 * inject (gsap-core, ScrollTrigger, SplitText, MorphSVG, Flip, Draggable,
 * MotionPathPlugin, Observer, CustomEase).
 *
 * Naming convention: `gsap.<name>` to avoid collision with CSS presets.
 */

import { registerAnimationPreset, type AnimationPreset } from "./index.js";

function num(name: string, description: string, def: number, min = 0, max = 10) {
  return { name, type: "number" as const, default: def, min, max, description };
}
function str(name: string, description: string, def: string) {
  return { name, type: "string" as const, default: def, description };
}

// ===== Entry (12) =====

const ENTRY_PRESETS: AnimationPreset[] = [
  {
    name: "gsap.splitBlur",
    engine: "gsap",
    category: "entry",
    description: "SplitText splits text into chars, each char blurs in with stagger",
    deps: ["gsap", "SplitText"],
    supportsScrollTrigger: true,
    params: [
      num("duration", "Per-char duration (s)", 0.8, 0.1, 3),
      num("stagger", "Stagger between chars (s)", 0.03, 0, 0.5),
      num("blurAmount", "Initial blur in px", 8, 0, 30),
      str("ease", "GSAP ease", "power3.out"),
    ],
  },
  {
    name: "gsap.splitLines",
    engine: "gsap",
    category: "entry",
    description: "SplitText by lines, each line staggers up with fade",
    deps: ["gsap", "SplitText"],
    supportsScrollTrigger: true,
    params: [
      num("duration", "Per-line duration (s)", 0.6, 0.1, 3),
      num("stagger", "Stagger between lines (s)", 0.15, 0, 1),
      num("yOffset", "Initial Y offset (px)", 40, 0, 200),
      str("ease", "GSAP ease", "power3.out"),
    ],
  },
  {
    name: "gsap.scrambleText",
    engine: "gsap",
    category: "entry",
    description: "ScrambleTextPlugin decodes random chars into target text",
    deps: ["gsap", "ScrambleTextPlugin"],
    params: [
      num("duration", "Decode duration (s)", 1.5, 0.3, 5),
      num("speed", "Chars per second", 3, 1, 10),
      str("chars", "Scramble char set", "upperAndLowerCase"),
    ],
  },
  {
    name: "gsap.fadeUpStagger",
    engine: "gsap",
    category: "entry",
    description: "Children stagger fade + slide up (ideal for grids/card lists)",
    deps: ["gsap"],
    supportsScrollTrigger: true,
    params: [
      num("duration", "Per-item duration (s)", 0.5, 0.1, 3),
      num("stagger", "Stagger between items (s)", 0.08, 0, 1),
      num("yOffset", "Initial Y offset (px)", 30, 0, 200),
      str("ease", "GSAP ease", "power2.out"),
    ],
  },
  {
    name: "gsap.flipGrid",
    engine: "gsap",
    category: "entry",
    description: "FLIP-based layout transition (bento grid reorder)",
    deps: ["gsap", "Flip"],
    params: [
      num("duration", "Flip duration (s)", 0.6, 0.1, 3),
      str("ease", "GSAP ease", "power2.inOut"),
    ],
  },
  {
    name: "gsap.morphIcon",
    engine: "gsap",
    category: "entry",
    description: "MorphSVG path morph (icon shape A → B)",
    deps: ["gsap", "MorphSVGPlugin"],
    params: [
      num("duration", "Morph duration (s)", 0.8, 0.1, 3),
      str("ease", "GSAP ease", "power2.inOut"),
    ],
  },
  {
    name: "gsap.scrollReveal",
    engine: "gsap",
    category: "entry",
    description: "ScrollTrigger reveals element when it enters viewport (80%)",
    deps: ["gsap", "ScrollTrigger"],
    supportsScrollTrigger: true,
    params: [
      num("duration", "Reveal duration (s)", 0.8, 0.1, 3),
      num("yOffset", "Initial Y offset (px)", 60, 0, 300),
      str("ease", "GSAP ease", "power3.out"),
      str("start", "ScrollTrigger start position", "top 80%"),
    ],
  },
  {
    name: "gsap.scrollPin",
    engine: "gsap",
    category: "entry",
    description: "ScrollTrigger pins section while scrubbing a timeline",
    deps: ["gsap", "ScrollTrigger"],
    supportsScrollTrigger: true,
    params: [
      num("duration", "Timeline duration (s)", 3, 0.5, 20),
      str("end", "ScrollTrigger end", "+=300%"),
      str("ease", "Scrub ease (none for 1:1)", "none"),
    ],
  },
  {
    name: "gsap.horizontalScroll",
    engine: "gsap",
    category: "entry",
    description: "ScrollTrigger converts vertical scroll to horizontal panel movement",
    deps: ["gsap", "ScrollTrigger"],
    supportsScrollTrigger: true,
    params: [
      str("ease", "Scrub ease", "none"),
      str("end", "ScrollTrigger end", "+=400%"),
    ],
  },
  {
    name: "gsap.parallaxBg",
    engine: "gsap",
    category: "entry",
    description: "ScrollTrigger parallax — background moves slower than foreground",
    deps: ["gsap", "ScrollTrigger"],
    supportsScrollTrigger: true,
    params: [
      num("yPercent", "Background Y movement (%)", 30, 0, 100),
      str("ease", "Scrub ease", "none"),
    ],
  },
  {
    name: "gsap.counter",
    engine: "gsap",
    category: "entry",
    description: "Animates a number from 0 to target value (stats counters)",
    deps: ["gsap", "ScrollTrigger"],
    supportsScrollTrigger: true,
    params: [
      num("duration", "Count duration (s)", 2, 0.5, 10),
      num("target", "Target number", 100, 0, 1000000),
      str("ease", "GSAP ease", "power2.out"),
    ],
  },
  {
    name: "gsap.drawSvg",
    engine: "gsap",
    category: "entry",
    description: "DrawSVGPlugin strokes SVG path as if drawn by hand",
    deps: ["gsap", "DrawSVGPlugin"],
    supportsScrollTrigger: true,
    params: [
      num("duration", "Draw duration (s)", 2, 0.3, 10),
      str("ease", "GSAP ease", "power1.inOut"),
    ],
  },
];

// ===== Hover (8) =====

const HOVER_PRESETS: AnimationPreset[] = [
  {
    name: "gsap.magnetic",
    engine: "gsap",
    category: "hover",
    description: "Element is magnetically pulled toward the cursor on hover",
    deps: ["gsap"],
    params: [
      num("strength", "Magnetic strength (0-1)", 0.3, 0, 1),
      num("duration", "Return duration (s)", 0.6, 0.1, 2),
      str("ease", "GSAP ease", "power3.out"),
    ],
  },
  {
    name: "gsap.tilt3d",
    engine: "gsap",
    category: "hover",
    description: "3D perspective tilt following cursor (rotateX/rotateY)",
    deps: ["gsap"],
    params: [
      num("maxRotation", "Max rotation degrees", 15, 0, 45),
      num("perspective", "Perspective in px", 800, 200, 3000),
      str("ease", "GSAP ease", "power2.out"),
    ],
  },
  {
    name: "gsap.scrubImage",
    engine: "gsap",
    category: "hover",
    description: "Hover scales + pans the image inside its container",
    deps: ["gsap"],
    params: [
      num("scale", "Scale factor", 1.1, 1, 2),
      num("duration", "Transition duration (s)", 0.5, 0.1, 2),
      str("ease", "GSAP ease", "power2.out"),
    ],
  },
  {
    name: "gsap.textScrambleHover",
    engine: "gsap",
    category: "hover",
    description: "Hover triggers ScrambleTextPlugin decode",
    deps: ["gsap", "ScrambleTextPlugin"],
    params: [
      num("duration", "Decode duration (s)", 0.6, 0.1, 2),
      str("chars", "Scramble char set", "upperAndLowerCase"),
    ],
  },
  {
    name: "gsap.iconMorphHover",
    engine: "gsap",
    category: "hover",
    description: "Hover morphs SVG icon to another path",
    deps: ["gsap", "MorphSVGPlugin"],
    params: [
      num("duration", "Morph duration (s)", 0.4, 0.1, 2),
      str("ease", "GSAP ease", "power2.inOut"),
    ],
  },
  {
    name: "gsap.glowPulse",
    engine: "gsap",
    category: "hover",
    description: "Glow filter pulses in a breathing loop",
    deps: ["gsap"],
    params: [
      num("duration", "Pulse period (s)", 1.5, 0.3, 5),
      num("maxBlur", "Max glow blur (px)", 20, 0, 50),
    ],
  },
  {
    name: "gsap.flipCard",
    engine: "gsap",
    category: "hover",
    description: "FLIP-based card front/back flip on hover",
    deps: ["gsap", "Flip"],
    params: [
      num("duration", "Flip duration (s)", 0.6, 0.1, 2),
      str("ease", "GSAP ease", "power2.inOut"),
    ],
  },
  {
    name: "gsap.draggable",
    engine: "gsap",
    category: "hover",
    description: "Draggable + InertiaPlugin free drag with momentum",
    deps: ["gsap", "Draggable", "InertiaPlugin"],
    params: [
      num("edgeResistance", "Edge resistance (0-1)", 0.65, 0, 1),
      str("type", "Drag type (x,y,rotation)", "x,y"),
    ],
  },
];

// ===== Timeline (4) =====

const TIMELINE_PRESETS: AnimationPreset[] = [
  {
    name: "gsap.timelineIntro",
    engine: "gsap",
    category: "timeline",
    description: "Hero intro timeline: eyebrow → title → subtitle → CTA",
    deps: ["gsap"],
    params: [
      num("duration", "Total timeline duration (s)", 1.6, 0.5, 6),
      num("overlap", "Overlap between steps (s)", 0.3, 0, 1),
      str("ease", "GSAP ease", "power3.out"),
    ],
  },
  {
    name: "gsap.scrollStory",
    engine: "gsap",
    category: "timeline",
    description: "ScrollTrigger pinned storytelling timeline (full page narrative)",
    deps: ["gsap", "ScrollTrigger"],
    supportsScrollTrigger: true,
    params: [
      num("duration", "Pinned timeline duration (s)", 8, 2, 30),
      str("end", "ScrollTrigger end", "+=600%"),
      str("ease", "Scrub ease", "none"),
    ],
  },
  {
    name: "gsap.batchReveal",
    engine: "gsap",
    category: "timeline",
    description: "ScrollTrigger.batch reveals items in groups (perf-optimized)",
    deps: ["gsap", "ScrollTrigger"],
    supportsScrollTrigger: true,
    params: [
      num("duration", "Per-batch duration (s)", 0.6, 0.1, 3),
      num("batchSize", "Items per batch", 5, 1, 20),
      num("stagger", "Intra-batch stagger (s)", 0.1, 0, 1),
      str("start", "Trigger start", "top 85%"),
    ],
  },
  {
    name: "gsap.matchMediaResponsive",
    engine: "gsap",
    category: "timeline",
    description: "matchMedia runs different animations per breakpoint",
    deps: ["gsap"],
    params: [
      str("mobile", "Mobile animation preset", "fadeUp"),
      str("desktop", "Desktop animation preset", "gsap.splitBlur"),
    ],
  },
];

// ===== Loop (3) =====

const LOOP_PRESETS: AnimationPreset[] = [
  {
    name: "gsap.floatingY",
    engine: "gsap",
    category: "loop",
    description: "Infinite floating loop (Y axis ±10px)",
    deps: ["gsap"],
    params: [
      num("duration", "Loop period (s)", 3, 0.5, 10),
      num("amplitude", "Y amplitude (px)", 10, 1, 50),
      str("ease", "GSAP ease", "sine.inOut"),
    ],
  },
  {
    name: "gsap.shimmerBar",
    engine: "gsap",
    category: "loop",
    description: "Highlight sweep across loading skeleton",
    deps: ["gsap"],
    params: [
      num("duration", "Sweep period (s)", 1.5, 0.3, 5),
      str("ease", "GSAP ease", "none"),
    ],
  },
  {
    name: "gsap.marqueeInfinite",
    engine: "gsap",
    category: "loop",
    description: "Seamless infinite marquee (modulus loop)",
    deps: ["gsap"],
    params: [
      num("duration", "One-loop duration (s)", 20, 1, 120),
      str("direction", "Direction (left/right)", "left"),
    ],
  },
];

[...ENTRY_PRESETS, ...HOVER_PRESETS, ...TIMELINE_PRESETS, ...LOOP_PRESETS].forEach(
  registerAnimationPreset
);

export const GSAP_PRESET_COUNT =
  ENTRY_PRESETS.length + HOVER_PRESETS.length + TIMELINE_PRESETS.length + LOOP_PRESETS.length;
