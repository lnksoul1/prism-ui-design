import { RGB, HSL, ColorInfo } from "../types.js";

// ===== Color Conversion =====

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

export function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      case b:
        h = (r - g) / delta + 4;
        break;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToRgb(hsl: HSL): RGB {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  if (s === 0) {
    const val = Math.round(l * 255);
    return { r: val, g: val, b: val };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

export function hslToHex(hsl: HSL): string {
  return rgbToHex(hslToRgb(hsl));
}

export function hexToHsl(hex: string): HSL {
  return rgbToHsl(hexToRgb(hex));
}

// ===== Color Info =====

export function getColorInfo(hex: string): ColorInfo {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  return {
    hex: hex.toUpperCase(),
    rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    name: nameColor(hsl),
  };
}

function nameColor(hsl: HSL): string {
  const { h, s, l } = hsl;

  if (l < 8) return "Black";
  if (l > 92 && s < 10) return "White";
  if (s < 10) {
    if (l < 25) return "Charcoal";
    if (l < 45) return "Gray";
    if (l < 65) return "Silver";
    return "Light Gray";
  }

  const hueNames: [number, string][] = [
    [15, "Red"],
    [45, "Orange"],
    [65, "Yellow"],
    [90, "Lime"],
    [150, "Green"],
    [180, "Teal"],
    [210, "Cyan"],
    [240, "Blue"],
    [270, "Indigo"],
    [300, "Violet"],
    [330, "Magenta"],
    [360, "Red"],
  ];

  let hueName = "Red";
  for (const [threshold, name] of hueNames) {
    if (h <= threshold) {
      hueName = name;
      break;
    }
  }

  let prefix = "";
  if (l < 30) prefix = "Dark ";
  else if (l > 70) prefix = "Light ";
  if (s < 35 && s >= 10) prefix = "Muted ";

  return `${prefix}${hueName}`;
}

// ===== Color Harmony Generation =====

export type HarmonyScheme =
  | "monochromatic"
  | "analogous"
  | "complementary"
  | "split_complementary"
  | "triadic"
  | "tetradic";

export function generateHarmony(baseHsl: HSL, scheme: HarmonyScheme): HSL[] {
  const { h, s, l } = baseHsl;

  switch (scheme) {
    case "monochromatic":
      return [
        { h, s, l: Math.max(10, l - 35) },
        { h, s, l: Math.max(20, l - 15) },
        { h, s, l },
        { h, s: Math.min(100, s + 10), l: Math.min(85, l + 15) },
        { h, s: Math.max(20, s - 20), l: Math.min(92, l + 30) },
      ];

    case "analogous":
      return [
        { h: (h - 60 + 360) % 360, s, l: Math.max(20, l - 10) },
        { h: (h - 30 + 360) % 360, s, l },
        { h, s, l },
        { h: (h + 30) % 360, s, l },
        { h: (h + 60) % 360, s, l: Math.min(80, l + 10) },
      ];

    case "complementary":
      return [
        { h, s, l: Math.max(15, l - 25) },
        { h, s, l },
        { h, s: Math.max(20, s - 20), l: Math.min(90, l + 25) },
        { h: (h + 180) % 360, s, l },
        { h: (h + 180) % 360, s: Math.min(100, s + 10), l: Math.max(30, l - 10) },
      ];

    case "split_complementary":
      return [
        { h, s, l },
        { h, s: Math.max(20, s - 15), l: Math.min(88, l + 20) },
        { h: (h + 150) % 360, s, l },
        { h: (h + 210) % 360, s, l },
        { h: (h + 180) % 360, s: Math.max(20, s - 10), l: Math.min(85, l + 15) },
      ];

    case "triadic":
      return [
        { h, s, l },
        { h: (h + 120) % 360, s, l },
        { h: (h + 240) % 360, s, l },
        { h, s: Math.max(20, s - 20), l: Math.min(90, l + 25) },
        { h: (h + 120) % 360, s: Math.max(20, s - 15), l: Math.min(88, l + 18) },
      ];

    case "tetradic":
      return [
        { h, s, l },
        { h: (h + 90) % 360, s, l },
        { h: (h + 180) % 360, s, l },
        { h: (h + 270) % 360, s, l },
        { h, s: Math.max(20, s - 25), l: Math.min(92, l + 30) },
      ];

    default:
      return [baseHsl];
  }
}

// ===== Tints, Shades & Tones =====

export function generateTints(baseHsl: HSL, count: number = 5): HSL[] {
  const tints: HSL[] = [];
  const step = (95 - baseHsl.l) / count;
  for (let i = 0; i < count; i++) {
    tints.push({
      h: baseHsl.h,
      s: Math.max(10, baseHsl.s - i * 3),
      l: Math.min(96, Math.round(baseHsl.l + step * (i + 1))),
    });
  }
  return tints;
}

export function generateShades(baseHsl: HSL, count: number = 5): HSL[] {
  const shades: HSL[] = [];
  const step = baseHsl.l / (count + 1);
  for (let i = 0; i < count; i++) {
    shades.push({
      h: baseHsl.h,
      s: Math.min(100, baseHsl.s + i * 2),
      l: Math.max(5, Math.round(baseHsl.l - step * (i + 1))),
    });
  }
  return shades;
}

// ===== Neutral Gray Generation =====

export function generateNeutralGrays(
  baseHsl: HSL,
  count: number = 11
): HSL[] {
  const grays: HSL[] = [];
  for (let i = 0; i < count; i++) {
    const lightness = Math.round((i / (count - 1)) * 100);
    grays.push({
      h: baseHsl.h,
      s: Math.max(2, Math.round(baseHsl.s * 0.15)),
      l: lightness,
    });
  }
  return grays;
}

// ===== WCAG Contrast =====

export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  const linearize = (c: number): number => {
    const sRGB = c / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastRatio(fg: string, bg: string): number {
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ===== Color Adjustment =====

export function adjustHue(hsl: HSL, degrees: number): HSL {
  return { ...hsl, h: (hsl.h + degrees + 360) % 360 };
}

export function adjustLightness(hsl: HSL, amount: number): HSL {
  return { ...hsl, l: Math.max(0, Math.min(100, hsl.l + amount)) };
}

export function adjustSaturation(hsl: HSL, amount: number): HSL {
  return { ...hsl, s: Math.max(0, Math.min(100, hsl.s + amount)) };
}

// ===== Validation =====

export function isValidHex(hex: string): boolean {
  return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
}

export function normalizeHex(hex: string): string {
  let clean = hex.startsWith("#") ? hex : `#${hex}`;
  if (clean.length === 4) {
    clean = `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
  }
  return clean.toUpperCase();
}
