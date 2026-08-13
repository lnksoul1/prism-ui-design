/**
 * Vanta.js effect catalog (upgrade plan U2).
 *
 * Defines the 14 built-in Vanta effects and their parameter schemas,
 * mirroring the src/vanta.*.js files in github.com/tengbao/vanta.
 * Each effect is rendered by three.js (WebGL) and accepts a color +
 * effect-specific params. The MCP layer uses this catalog to validate
 * design_set_vanta_background inputs and to populate the design library.
 */

export interface VantaParamSchema {
  name: string;
  type: "number" | "color";
  default: number | string;
  min?: number;
  max?: number;
  description: string;
}

export interface VantaEffect {
  /** Effect key as used by VANTA.<KEY> (uppercase, e.g. "WAVES"). */
  key: string;
  /** Lowercase name used in tool params (e.g. "waves"). */
  name: string;
  description: string;
  /** CDN file: https://cdn.jsdelivr.net/npm/vanta/dist/vanta.<name>.min.js */
  scriptFile: string;
  params: VantaParamSchema[];
}

const COLOR_PARAM: VantaParamSchema = {
  name: "color",
  type: "color",
  default: 0x005588,
  description: "Primary color (hex number, e.g. 0x005588)",
};

export const VANTA_EFFECTS: VantaEffect[] = [
  {
    key: "WAVES",
    name: "waves",
    description: "Animated 3D ocean waves (most popular for hero backgrounds)",
    scriptFile: "vanta.waves.min.js",
    params: [
      COLOR_PARAM,
      { name: "shininess", type: "number", default: 30, min: 0, max: 100, description: "Material shininess" },
      { name: "waveHeight", type: "number", default: 15, min: 0, max: 50, description: "Wave height" },
      { name: "waveSpeed", type: "number", default: 1, min: 0, max: 3, description: "Wave speed" },
      { name: "zoom", type: "number", default: 1, min: 0.5, max: 2, description: "Camera zoom" },
    ],
  },
  {
    key: "NET",
    name: "net",
    description: "3D network/web of nodes and connecting lines (tech/cyberpunk feel)",
    scriptFile: "vanta.net.min.js",
    params: [
      COLOR_PARAM,
      { name: "backgroundColor", type: "color", default: 0x000000, description: "Background color" },
      { name: "points", type: "number", default: 10, min: 2, max: 30, description: "Number of nodes" },
      { name: "maxDistance", type: "number", default: 20, min: 5, max: 50, description: "Max connection distance" },
      { name: "spacing", type: "number", default: 16, min: 5, max: 30, description: "Node spacing" },
    ],
  },
  {
    key: "GLOBE",
    name: "globe",
    description: "Rotating 3D globe of dots (global/enterprise feel)",
    scriptFile: "vanta.globe.min.js",
    params: [
      COLOR_PARAM,
      { name: "backgroundColor", type: "color", default: 0x000000, description: "Background color" },
      { name: "size", type: "number", default: 1, min: 0.5, max: 3, description: "Globe size" },
    ],
  },
  {
    key: "BIRDS",
    name: "birds",
    description: "Flock of birds flying (nature/lifestyle feel)",
    scriptFile: "vanta.birds.min.js",
    params: [
      { name: "backgroundColor", type: "color", default: 0x000000, description: "Background color" },
      { name: "color1", type: "color", default: 0xff8820, description: "Bird color 1" },
      { name: "color2", type: "color", default: 0x8820ff, description: "Bird color 2" },
      { name: "birdSize", type: "number", default: 1, min: 0.5, max: 3, description: "Bird size" },
      { name: "wingSpan", type: "number", default: 30, min: 10, max: 60, description: "Wing span" },
      { name: "speedLimit", type: "number", default: 5, min: 1, max: 10, description: "Speed limit" },
      { name: "separation", type: "number", default: 50, min: 10, max: 100, description: "Separation" },
      { name: "alignment", type: "number", default: 20, min: 5, max: 50, description: "Alignment" },
      { name: "cohesion", type: "number", default: 20, min: 5, max: 50, description: "Cohesion" },
    ],
  },
  {
    key: "FOG",
    name: "fog",
    description: "Animated fog/clouds (atmospheric/mystery feel)",
    scriptFile: "vanta.fog.min.js",
    params: [
      { name: "highlightColor", type: "color", default: 0x1e90ff, description: "Highlight color" },
      { name: "midtoneColor", type: "color", default: 0xff1e90, description: "Midtone color" },
      { name: "lowlightColor", type: "color", default: 0x901eff, description: "Lowlight color" },
      { name: "baseColor", type: "color", default: 0x000000, description: "Base color" },
      { name: "blurFactor", type: "number", default: 0.6, min: 0.1, max: 1, description: "Blur factor" },
      { name: "speed", type: "number", default: 1, min: 0, max: 3, description: "Speed" },
      { name: "zoom", type: "number", default: 1, min: 0.5, max: 2, description: "Zoom" },
    ],
  },
  {
    key: "CLOUDS",
    name: "clouds",
    description: "Volumetric clouds (sky/weather feel)",
    scriptFile: "vanta.clouds.min.js",
    params: [
      { name: "skyColor", type: "color", default: 0x68b8d7, description: "Sky color" },
      { name: "cloudColor", type: "color", default: 0xadc1de, description: "Cloud color" },
      { name: "cloudShadowColor", type: "color", default: 0x183550, description: "Cloud shadow color" },
      { name: "sunColor", type: "color", default: 0xe0a07a, description: "Sun color" },
      { name: "sunGlareColor", type: "color", default: 0xff6611, description: "Sun glare color" },
      { name: "speed", type: "number", default: 1, min: 0, max: 3, description: "Speed" },
    ],
  },
  {
    key: "CLOUDS2",
    name: "clouds2",
    description: "Alternative clouds effect (shader-based)",
    scriptFile: "vanta.clouds2.min.js",
    params: [
      { name: "skyColor", type: "color", default: 0x68b8d7, description: "Sky color" },
      { name: "cloudColor", type: "color", default: 0xadc1de, description: "Cloud color" },
      { name: "speed", type: "number", default: 1, min: 0, max: 3, description: "Speed" },
    ],
  },
  {
    key: "DOTS",
    name: "dots",
    description: "3D dot field (minimal/abstract)",
    scriptFile: "vanta.dots.min.js",
    params: [
      COLOR_PARAM,
      { name: "backgroundColor", type: "color", default: 0x000000, description: "Background color" },
      { name: "size", type: "number", default: 3, min: 1, max: 10, description: "Dot size" },
      { name: "spacing", type: "number", default: 35, min: 10, max: 80, description: "Dot spacing" },
    ],
  },
  {
    key: "RINGS",
    name: "rings",
    description: "Concentric 3D rings (futuristic/tech feel)",
    scriptFile: "vanta.rings.min.js",
    params: [
      COLOR_PARAM,
      { name: "backgroundColor", type: "color", default: 0x000000, description: "Background color" },
      { name: "backgroundAlpha", type: "number", default: 1, min: 0, max: 1, description: "Background alpha" },
    ],
  },
  {
    key: "HALO",
    name: "halo",
    description: "Glowing halo/ring (premium/luxury feel)",
    scriptFile: "vanta.halo.min.js",
    params: [
      { name: "baseColor", type: "color", default: 0xff0033, description: "Base color" },
      { name: "backgroundColor", type: "color", default: 0x000000, description: "Background color" },
      { name: "amplitude", type: "number", default: 1, min: 0.5, max: 3, description: "Amplitude" },
      { name: "size", type: "number", default: 1.5, min: 0.5, max: 3, description: "Size" },
      { name: "speed", type: "number", default: 1, min: 0, max: 3, description: "Speed" },
    ],
  },
  {
    key: "TOPOLOGY",
    name: "topology",
    description: "Topological mesh (data/science feel)",
    scriptFile: "vanta.topology.min.js",
    params: [
      COLOR_PARAM,
      { name: "backgroundColor", type: "color", default: 0x000000, description: "Background color" },
    ],
  },
  {
    key: "TRUNK",
    name: "trunk",
    description: "Growing tree branches (organic/growth feel)",
    scriptFile: "vanta.trunk.min.js",
    params: [
      { name: "color", type: "color", default: 0x403020, description: "Trunk color" },
      { name: "backgroundColor", type: "color", default: 0xffffff, description: "Background color" },
      { name: "spacing", type: "number", default: 10, min: 2, max: 30, description: "Spacing" },
      { name: "chaos", type: "number", default: 1, min: 0, max: 5, description: "Chaos factor" },
    ],
  },
  {
    key: "RIPPLE",
    name: "ripple",
    description: "Ripple wave effect (calm/meditative feel)",
    scriptFile: "vanta.ripple.min.js",
    params: [
      { name: "color", type: "color", default: 0x000000, description: "Color" },
      { name: "backgroundColor", type: "color", default: 0xffffff, description: "Background color" },
      { name: "amplitude", type: "number", default: 1, min: 0.1, max: 3, description: "Amplitude" },
      { name: "speed", type: "number", default: 1, min: 0, max: 3, description: "Speed" },
    ],
  },
  {
    key: "CELLS",
    name: "cells",
    description: "Cellular pattern (biological/scientific feel)",
    scriptFile: "vanta.cells.min.js",
    params: [
      { name: "color", type: "color", default: 0x000000, description: "Color" },
      { name: "backgroundColor", type: "color", default: 0xffffff, description: "Background color" },
      { name: "size", type: "number", default: 1, min: 0.5, max: 3, description: "Cell size" },
      { name: "speed", type: "number", default: 1, min: 0, max: 3, description: "Speed" },
    ],
  },
];

export function getVantaEffect(name: string): VantaEffect | undefined {
  return VANTA_EFFECTS.find((e) => e.name === name || e.key === name.toUpperCase());
}

export function listVantaEffects(): Array<{
  name: string;
  key: string;
  description: string;
  paramCount: number;
  params: VantaParamSchema[];
}> {
  return VANTA_EFFECTS.map((e) => ({
    name: e.name,
    key: e.key,
    description: e.description,
    paramCount: e.params.length,
    params: e.params,
  }));
}

/** Style preset → default Vanta effect + params mapping (upgrade plan U2.3). */
export const STYLE_TO_VANTA_DEFAULT: Record<
  string,
  { effect: string; params: Record<string, number | string> }
> = {
  minimal: { effect: "dots", params: { color: 0x111111, backgroundColor: 0xffffff, size: 2 } },
  bold: { effect: "waves", params: { color: 0x002255, shininess: 50, waveHeight: 20 } },
  playful: { effect: "birds", params: { color1: 0xff66aa, color2: 0x66aaff, birdSize: 1.2 } },
  dark: { effect: "net", params: { color: 0x8866ff, backgroundColor: 0x0a0e14 } },
  editorial: { effect: "ripple", params: { color: 0x402a18, backgroundColor: 0xfdfcfa } },
  tech: { effect: "net", params: { color: 0x00ccff, backgroundColor: 0x000000, points: 12 } },
  glassmorphism: { effect: "fog", params: { highlightColor: 0x88ccff, midtoneColor: 0xcc88ff } },
  neumorphism: { effect: "cells", params: { color: 0xdddddd, backgroundColor: 0xf0f0f0 } },
  claymorphism: { effect: "ripple", params: { color: 0xffaacc, backgroundColor: 0xffeeff } },
  aurora: { effect: "fog", params: { highlightColor: 0x00ff88, midtoneColor: 0x8800ff } },
  brutalism: { effect: "topology", params: { color: 0x000000, backgroundColor: 0xff0000 } },
  cyberpunk: { effect: "globe", params: { color: 0xff00ff, backgroundColor: 0x000000 } },
  organic: { effect: "trunk", params: { color: 0x403020, backgroundColor: 0xf0e8d0 } },
  luxury: { effect: "halo", params: { baseColor: 0xd4af37, backgroundColor: 0x000000 } },
  // —— 新增 16 风格的 Vanta 默认映射（S3）——
  bento: { effect: "dots", params: { color: 0x1d1d1f, backgroundColor: 0xf5f5f7, size: 2 } },
  material: { effect: "ripple", params: { color: 0x6750a4, backgroundColor: 0xfef7ff } },
  shadcn: { effect: "dots", params: { color: 0x18181b, backgroundColor: 0xffffff, size: 1.5 } },
  neobrutalism: { effect: "topology", params: { color: 0x1a1a2e, backgroundColor: 0xfef9c3 } },
  mono: { effect: "dots", params: { color: 0xffffff, backgroundColor: 0x000000, size: 1.5 } },
  neon: { effect: "dots", params: { color: 0x00ffff, backgroundColor: 0x0a0a14, size: 2 } },
  gradient: { effect: "waves", params: { color: 0x635bff, shininess: 40, waveHeight: 18 } },
  vibrant: { effect: "birds", params: { color1: 0xa855f7, color2: 0xfbbf24, birdSize: 1.3 } },
  doodle: { effect: "cells", params: { color: 0x7c2d12, backgroundColor: 0xfffbeb } },
  paper: { effect: "fog", params: { highlightColor: 0xf5e6c8, midtoneColor: 0xd4c4a0, lowtoneColor: 0xa89060 } },
  cosmic: { effect: "net", params: { color: 0xffffff, backgroundColor: 0x050714, points: 10 } },
  immersive: { effect: "birds", params: { backgroundColor: 0x0a0e14, quantity: 3 } },
  retro: { effect: "topology", params: { color: 0x7c2d12, backgroundColor: 0xfef3c7 } },
  vintage: { effect: "cells", params: { color: 0xc0c0c0, backgroundColor: 0x808080 } },
  spacious: { effect: "ripple", params: { color: 0x6366f1, backgroundColor: 0xffffff } },
  storytelling: { effect: "fog", params: { highlightColor: 0xffffff, midtoneColor: 0x886688, lowtoneColor: 0x333355 } },
};
