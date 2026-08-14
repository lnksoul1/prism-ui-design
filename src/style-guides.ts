/**
 * Style-guide library (functional plan F7).
 *
 * Named visual styles ("glassmorphism", "brutalist", ...) that can be applied
 * on top of the base style presets. Each guide carries token overrides plus
 * component variant hints, so agents can switch the whole visual language
 * with one tool call.
 */

import { stateStore } from "./state.js";
import { applyStyleTokenSet, SHADOW_SYSTEM_PRESETS, RADIUS_PRESETS } from "./tokens.js";

export interface StyleGuide {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  tokens: {
    colors?: Record<string, string>;
    radii?: Record<string, string>;
    shadows?: Record<string, string>;
    typography?: Record<string, string>;
  };
  variantHints: Record<string, string>;
}

const RADIUS_NAMES = ["none", "sm", "md", "lg", "xl"];
const SHADOW_NAMES = ["sm", "md", "lg", "xl", "2xl"];

export const STYLE_GUIDES: StyleGuide[] = [
  {
    id: "glassmorphism",
    name: "玻璃拟态",
    description: "半透明毛玻璃卡片、柔和阴影、高光边框。",
    keywords: ["glass", "glassmorphism", "毛玻璃", "玻璃", "frosted", "translucent"],
    tokens: {
      colors: {
        "color-surface": "rgba(255, 255, 255, 0.55)",
        "color-bg": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        "color-border": "rgba(255, 255, 255, 0.35)",
      },
      radii: {
        "radius-sm": "10px",
        "radius-md": "16px",
        "radius-lg": "24px",
        "radius-xl": "32px",
      },
      shadows: {
        "shadow-sm": "0 4px 16px rgba(31, 38, 135, 0.18)",
        "shadow-md": "0 8px 32px rgba(31, 38, 135, 0.22)",
        "shadow-lg": "0 16px 48px rgba(31, 38, 135, 0.28)",
        "shadow-xl": "0 24px 64px rgba(31, 38, 135, 0.32)",
        "shadow-2xl": "0 32px 80px rgba(31, 38, 135, 0.36)",
      },
    },
    variantHints: { card: "elevated", cta: "banner" },
  },
  {
    id: "brutalist",
    name: "粗野主义",
    description: "硬阴影、粗边框、直角、高对比色块。",
    keywords: ["brutalist", "brutalism", "粗野", "硬边", "raw", "neo-brutalist"],
    tokens: {
      colors: {
        "color-border": "#000000",
        "color-surface": "#FFFFFF",
        "color-accent": "#FFDE00",
      },
      radii: {
        "radius-sm": "0px",
        "radius-md": "0px",
        "radius-lg": "0px",
        "radius-xl": "0px",
      },
      shadows: {
        "shadow-sm": "4px 4px 0 #000000",
        "shadow-md": "6px 6px 0 #000000",
        "shadow-lg": "8px 8px 0 #000000",
        "shadow-xl": "10px 10px 0 #000000",
        "shadow-2xl": "12px 12px 0 #000000",
      },
    },
    variantHints: { button: "primary", card: "flat" },
  },
  {
    id: "retro",
    name: "复古",
    description: "暖色系、衬线标题、圆角、柔和纸张质感。",
    keywords: ["retro", "vintage", "复古", "怀旧", "70s", "warm"],
    tokens: {
      colors: {
        "color-bg": "#F7F1E3",
        "color-surface": "#FDF8EC",
        "color-text": "#4A3728",
        "color-primary": "#C1440E",
        "color-accent": "#D4A017",
      },
      typography: {
        "font-display": "'Fraunces', Georgia, serif",
        "font-body": "'Karla', 'Helvetica Neue', sans-serif",
      },
    },
    variantHints: { hero: "centered", card: "article" },
  },
  {
    id: "neumorphism",
    name: "新拟态",
    description: "同色系双阴影、低对比、圆润柔和。",
    keywords: ["neumorphism", "soft ui", "新拟态", "neumorphic", "soft"],
    tokens: {
      colors: {
        "color-bg": "#E0E5EC",
        "color-surface": "#E0E5EC",
        "color-text": "#4B5563",
        "color-border": "rgba(255,255,255,0.5)",
      },
      radii: {
        "radius-sm": "12px",
        "radius-md": "18px",
        "radius-lg": "26px",
        "radius-xl": "34px",
      },
      shadows: {
        "shadow-sm": "4px 4px 8px #B8C0CC, -4px -4px 8px #FFFFFF",
        "shadow-md": "8px 8px 16px #B8C0CC, -8px -8px 16px #FFFFFF",
        "shadow-lg": "12px 12px 24px #B8C0CC, -12px -12px 24px #FFFFFF",
        "shadow-xl": "16px 16px 32px #B8C0CC, -16px -16px 32px #FFFFFF",
        "shadow-2xl": "20px 20px 40px #B8C0CC, -20px -20px 40px #FFFFFF",
      },
    },
    variantHints: { button: "ghost", card: "elevated" },
  },
  {
    id: "cyberpunk",
    name: "赛博朋克",
    description: "霓虹点缀、深色底、发光阴影、锐利几何。",
    keywords: ["cyberpunk", "neon", "赛博", "霓虹", "synthwave", "futuristic"],
    tokens: {
      colors: {
        "color-bg": "#0D0221",
        "color-surface": "#150A33",
        "color-text": "#E0E7FF",
        "color-primary": "#00F0FF",
        "color-accent": "#FF00C8",
      },
      shadows: {
        "shadow-sm": "0 0 8px rgba(0, 240, 255, 0.45)",
        "shadow-md": "0 0 16px rgba(0, 240, 255, 0.55)",
        "shadow-lg": "0 0 24px rgba(255, 0, 200, 0.55)",
        "shadow-xl": "0 0 36px rgba(255, 0, 200, 0.6)",
        "shadow-2xl": "0 0 48px rgba(0, 240, 255, 0.7)",
      },
    },
    variantHints: { button: "primary", card: "flat" },
  },
  {
    id: "editorial",
    name: "杂志编辑",
    description: "衬线大标题、克制用色、锐利圆角、大量留白。",
    keywords: ["editorial", "magazine", "杂志", "优雅", "serif", "minimal"],
    tokens: {
      colors: {
        "color-bg": "#FDFCFA",
        "color-surface": "#FFFFFF",
        "color-text": "#1C1917",
        "color-text-muted": "#78716C",
        "color-primary": "#B45309",
      },
      typography: {
        "font-display": "'Playfair Display', Georgia, serif",
        "font-body": "'Source Sans 3', system-ui, sans-serif",
      },
      radii: {
        "radius-sm": "2px",
        "radius-md": "4px",
        "radius-lg": "6px",
        "radius-xl": "8px",
      },
    },
    variantHints: { hero: "split", text_section: "standard" },
  },
];

/**
 * Brand design systems (Inspired by OpenStitch's DESIGN.md presets):
 * one-click token overrides that restyle the whole project without touching
 * component structure. Listed in the dashboard design-library "设计系统" tab.
 */
export const BRAND_DESIGN_SYSTEMS: StyleGuide[] = [
  {
    id: "linear",
    name: "Linear",
    description: "深色高效、靛蓝主色、紧凑圆角，适合开发者工具。",
    keywords: ["linear", "linear.app", "开发者工具", "深色高效"],
    tokens: {
      colors: {
        "color-bg": "#08090A",
        "color-surface": "#101113",
        "color-text": "#F7F8F8",
        "color-text-muted": "#8A8F98",
        "color-primary": "#5E6AD2",
        "color-accent": "#26A9E0",
        "color-border": "#26272B",
      },
      radii: {
        "radius-sm": "4px",
        "radius-md": "6px",
        "radius-lg": "8px",
        "radius-xl": "10px",
      },
      typography: {
        "font-display": "'Inter', system-ui, sans-serif",
        "font-body": "'Inter', system-ui, sans-serif",
      },
    },
    variantHints: { button: "primary", card: "elevated" },
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "明亮清爽、靛紫主色、蓝紫渐变，适合支付与 SaaS。",
    keywords: ["stripe", "支付", "saas 明亮", "clean"],
    tokens: {
      colors: {
        "color-bg": "#F6F8FA",
        "color-surface": "#FFFFFF",
        "color-text": "#0A2540",
        "color-text-muted": "#425466",
        "color-primary": "#635BFF",
        "color-accent": "#00D4FF",
        "color-border": "#E6EBF1",
      },
      radii: {
        "radius-sm": "4px",
        "radius-md": "6px",
        "radius-lg": "10px",
        "radius-xl": "14px",
      },
      shadows: {
        "shadow-sm": "0 1px 2px rgba(10, 37, 64, 0.08)",
        "shadow-md": "0 4px 12px rgba(10, 37, 64, 0.12)",
        "shadow-lg": "0 12px 32px rgba(10, 37, 64, 0.14)",
        "shadow-xl": "0 20px 48px rgba(10, 37, 64, 0.18)",
        "shadow-2xl": "0 32px 72px rgba(10, 37, 64, 0.22)",
      },
    },
    variantHints: { button: "primary", card: "elevated" },
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "黑白极简、无彩色干扰，适合技术品牌与作品集。",
    keywords: ["vercel", "极简", "monochrome", "黑", "白"],
    tokens: {
      colors: {
        "color-bg": "#000000",
        "color-surface": "#111111",
        "color-text": "#FAFAFA",
        "color-text-muted": "#888888",
        "color-primary": "#FFFFFF",
        "color-accent": "#0070F3",
        "color-border": "#333333",
      },
      radii: {
        "radius-sm": "4px",
        "radius-md": "6px",
        "radius-lg": "8px",
        "radius-xl": "12px",
      },
      typography: {
        "font-display": "'Geist', 'Inter', system-ui, sans-serif",
        "font-body": "'Geist', 'Inter', system-ui, sans-serif",
      },
    },
    variantHints: { button: "ghost", card: "flat" },
  },
  {
    id: "notion",
    name: "Notion",
    description: "暖白纸感、中性文字、克制蓝，适合文档与知识库。",
    keywords: ["notion", "文档", "笔记", "knowledge", "warm"],
    tokens: {
      colors: {
        "color-bg": "#FFFFFF",
        "color-surface": "#FFFFFF",
        "color-text": "#37352F",
        "color-text-muted": "#6B6B6B",
        "color-primary": "#37352F",
        "color-accent": "#2383E2",
        "color-border": "#E9E9E7",
      },
      radii: {
        "radius-sm": "3px",
        "radius-md": "5px",
        "radius-lg": "8px",
        "radius-xl": "10px",
      },
      shadows: {
        "shadow-sm": "0 1px 3px rgba(15, 15, 15, 0.06)",
        "shadow-md": "0 2px 8px rgba(15, 15, 15, 0.1)",
        "shadow-lg": "0 8px 24px rgba(15, 15, 15, 0.12)",
        "shadow-xl": "0 16px 40px rgba(15, 15, 15, 0.16)",
        "shadow-2xl": "0 24px 64px rgba(15, 15, 15, 0.2)",
      },
    },
    variantHints: { button: "ghost", card: "flat" },
  },
  {
    id: "arc",
    name: "Arc",
    description: "奶油底色、黄绿主色、圆润活泼，适合消费级产品。",
    keywords: ["arc", "browser", "奶油", "黄绿", "playful"],
    tokens: {
      colors: {
        "color-bg": "#F7F5F0",
        "color-surface": "#FFFFFF",
        "color-text": "#1D1D1F",
        "color-text-muted": "#6E6E73",
        "color-primary": "#CBE54E",
        "color-accent": "#FC7B6B",
        "color-border": "#E8E5DE",
      },
      radii: {
        "radius-sm": "6px",
        "radius-md": "10px",
        "radius-lg": "16px",
        "radius-xl": "22px",
      },
      shadows: {
        "shadow-sm": "0 1px 2px rgba(29, 29, 31, 0.06)",
        "shadow-md": "0 4px 14px rgba(29, 29, 31, 0.1)",
        "shadow-lg": "0 12px 32px rgba(29, 29, 31, 0.12)",
        "shadow-xl": "0 20px 48px rgba(29, 29, 31, 0.16)",
        "shadow-2xl": "0 32px 72px rgba(29, 29, 31, 0.2)",
      },
    },
    variantHints: { button: "primary", card: "rounded" },
  },
  {
    id: "spotify",
    name: "Spotify",
    description: "碳黑底、荧光绿、粗壮排版，适合音乐与娱乐产品。",
    keywords: ["spotify", "音乐", "娱乐", "dark", "green"],
    tokens: {
      colors: {
        "color-bg": "#121212",
        "color-surface": "#181818",
        "color-text": "#FFFFFF",
        "color-text-muted": "#B3B3B3",
        "color-primary": "#1DB954",
        "color-accent": "#1ED760",
        "color-border": "#2A2A2A",
      },
      radii: {
        "radius-sm": "4px",
        "radius-md": "6px",
        "radius-lg": "10px",
        "radius-xl": "14px",
      },
      shadows: {
        "shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.3)",
        "shadow-md": "0 4px 12px rgba(0, 0, 0, 0.35)",
        "shadow-lg": "0 12px 32px rgba(0, 0, 0, 0.4)",
        "shadow-xl": "0 20px 48px rgba(0, 0, 0, 0.45)",
        "shadow-2xl": "0 32px 72px rgba(0, 0, 0, 0.5)",
      },
    },
    variantHints: { button: "primary", card: "elevated" },
  },
  {
    id: "apple",
    name: "Apple",
    description: "冷灰金属感、克制的蓝、通透留白，适合消费电子与高端品牌。",
    keywords: ["apple", "ios", "human interface", "苹果", "高端", "金属"],
    tokens: {
      colors: {
        "color-bg": "#F5F5F7",
        "color-surface": "#FFFFFF",
        "color-text": "#1D1D1F",
        "color-text-muted": "#6E6E73",
        "color-primary": "#0071E3",
        "color-accent": "#007AFF",
        "color-border": "#D2D2D7",
      },
      radii: {
        "radius-sm": "6px",
        "radius-md": "10px",
        "radius-lg": "14px",
        "radius-xl": "18px",
      },
      typography: {
        "font-display": "'SF Pro Display', -apple-system, 'Helvetica Neue', sans-serif",
        "font-body": "'SF Pro Text', -apple-system, 'Helvetica Neue', sans-serif",
      },
    },
    variantHints: { button: "primary", card: "elevated" },
  },
  {
    id: "github",
    name: "GitHub",
    description: "中性灰阶、墨绿点缀、紧凑密度，适合开发者平台与工具。",
    keywords: ["github", "primer", "developer", "开源", "中性灰"],
    tokens: {
      colors: {
        "color-bg": "#FFFFFF",
        "color-surface": "#F6F8FA",
        "color-text": "#1F2328",
        "color-text-muted": "#656D76",
        "color-primary": "#0969DA",
        "color-accent": "#1F883D",
        "color-border": "#D0D7DE",
      },
      radii: {
        "radius-sm": "4px",
        "radius-md": "6px",
        "radius-lg": "8px",
        "radius-xl": "12px",
      },
      typography: {
        "font-display": "'Segoe UI', system-ui, sans-serif",
        "font-body": "'Segoe UI', system-ui, sans-serif",
      },
    },
    variantHints: { button: "primary", card: "flat" },
  },
  {
    id: "ibm-carbon",
    name: "IBM Carbon",
    description: "企业级蓝、冷灰阶梯、栅格精密，适合 B2B 与数据产品。",
    keywords: ["ibm", "carbon", "enterprise", "企业", "b2b", "数据"],
    tokens: {
      colors: {
        "color-bg": "#FFFFFF",
        "color-surface": "#F4F4F4",
        "color-text": "#161616",
        "color-text-muted": "#525252",
        "color-primary": "#0F62FE",
        "color-accent": "#0062FE",
        "color-border": "#E0E0E0",
      },
      radii: {
        "radius-sm": "0px",
        "radius-md": "0px",
        "radius-lg": "0px",
        "radius-xl": "0px",
      },
      typography: {
        "font-display": "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
        "font-body": "'IBM Plex Sans', 'Helvetica Neue', sans-serif",
      },
    },
    variantHints: { button: "primary", card: "flat" },
  },
  {
    id: "shopify-polaris",
    name: "Shopify Polaris",
    description: "清新绿、圆润留白、电商导向，适合商业与零售产品。",
    keywords: ["shopify", "polaris", "电商", "零售", "commerce", "绿"],
    tokens: {
      colors: {
        "color-bg": "#F6F6F7",
        "color-surface": "#FFFFFF",
        "color-text": "#202223",
        "color-text-muted": "#6D7175",
        "color-primary": "#008060",
        "color-accent": "#0E65D9",
        "color-border": "#8C9196",
      },
      radii: {
        "radius-sm": "4px",
        "radius-md": "8px",
        "radius-lg": "12px",
        "radius-xl": "16px",
      },
      typography: {
        "font-display": "'Inter', system-ui, sans-serif",
        "font-body": "'Inter', system-ui, sans-serif",
      },
    },
    variantHints: { button: "primary", card: "elevated" },
  },
  {
    id: "duolingo",
    name: "Duolingo",
    description: "高饱和绿、圆润卡通、活泼明快，适合教育娱乐产品。",
    keywords: ["duolingo", "教育", "语言", "活泼", "卡通", "green"],
    tokens: {
      colors: {
        "color-bg": "#FFFFFF",
        "color-surface": "#F7F7F7",
        "color-text": "#3C3C3C",
        "color-text-muted": "#777777",
        "color-primary": "#58CC02",
        "color-accent": "#FFC800",
        "color-border": "#E5E5E5",
      },
      radii: {
        "radius-sm": "8px",
        "radius-md": "12px",
        "radius-lg": "16px",
        "radius-xl": "24px",
      },
      shadows: {
        "shadow-sm": "0 2px 0 rgba(0, 0, 0, 0.1)",
        "shadow-md": "0 4px 0 rgba(0, 0, 0, 0.1)",
        "shadow-lg": "0 6px 0 rgba(0, 0, 0, 0.12)",
        "shadow-xl": "0 8px 0 rgba(0, 0, 0, 0.12)",
        "shadow-2xl": "0 12px 0 rgba(0, 0, 0, 0.14)",
      },
      typography: {
        "font-display": "'Nunito', 'Feather Bold', system-ui, sans-serif",
        "font-body": "'Nunito', system-ui, sans-serif",
      },
    },
    variantHints: { button: "primary", card: "rounded" },
  },
  {
    id: "discord",
    name: "Discord",
    description: "深蓝灰底、品牌蓝紫、圆润亲和，适合社区与游戏产品。",
    keywords: ["discord", "社区", "游戏", "chat", "蓝紫"],
    tokens: {
      colors: {
        "color-bg": "#313338",
        "color-surface": "#2B2D31",
        "color-text": "#F2F3F5",
        "color-text-muted": "#B5BAC1",
        "color-primary": "#5865F2",
        "color-accent": "#23A55A",
        "color-border": "#1E1F22",
      },
      radii: {
        "radius-sm": "6px",
        "radius-md": "8px",
        "radius-lg": "12px",
        "radius-xl": "16px",
      },
      typography: {
        "font-display": "'gg sans', 'Whitney', system-ui, sans-serif",
        "font-body": "'gg sans', 'Whitney', system-ui, sans-serif",
      },
    },
    variantHints: { button: "primary", card: "elevated" },
  },
  {
    id: "raycast",
    name: "Raycast",
    description: "深色精致、红橙渐变、现代极简，适合效率工具与命令面板。",
    keywords: ["raycast", "效率", "工具", "command", "红橙"],
    tokens: {
      colors: {
        "color-bg": "#1A1A1A",
        "color-surface": "#232323",
        "color-text": "#FFFFFF",
        "color-text-muted": "#9E9E9E",
        "color-primary": "#FF6363",
        "color-accent": "#FFB36B",
        "color-border": "#3A3A3A",
      },
      radii: {
        "radius-sm": "8px",
        "radius-md": "10px",
        "radius-lg": "14px",
        "radius-xl": "18px",
      },
      shadows: {
        "shadow-sm": "0 4px 12px rgba(0, 0, 0, 0.25)",
        "shadow-md": "0 8px 24px rgba(0, 0, 0, 0.3)",
        "shadow-lg": "0 16px 40px rgba(0, 0, 0, 0.35)",
        "shadow-xl": "0 24px 56px rgba(0, 0, 0, 0.4)",
        "shadow-2xl": "0 32px 80px rgba(0, 0, 0, 0.45)",
      },
      typography: {
        "font-display": "'Inter', system-ui, sans-serif",
        "font-body": "'Inter', system-ui, sans-serif",
      },
    },
    variantHints: { button: "primary", card: "flat" },
  },
  {
    id: "airbnb",
    name: "Airbnb",
    description: "珊瑚主色、温暖柔和、圆角友好，适合旅行与生活方式。",
    keywords: ["airbnb", "旅行", "生活方式", "珊瑚", "warm"],
    tokens: {
      colors: {
        "color-bg": "#FFFFFF",
        "color-surface": "#F7F7F7",
        "color-text": "#222222",
        "color-text-muted": "#717171",
        "color-primary": "#FF385C",
        "color-accent": "#FF5A5F",
        "color-border": "#EBEBEB",
      },
      radii: {
        "radius-sm": "8px",
        "radius-md": "12px",
        "radius-lg": "16px",
        "radius-xl": "24px",
      },
      typography: {
        "font-display": "'Airbnb Cereal', 'Circular', system-ui, sans-serif",
        "font-body": "'Airbnb Cereal', 'Circular', system-ui, sans-serif",
      },
    },
    variantHints: { button: "primary", card: "rounded" },
  },
  {
    id: "figma",
    name: "Figma",
    description: "多彩活力、黑灰底、极简工具栏，适合设计工具与协作产品。",
    keywords: ["figma", "设计工具", "协作", "multicolor", "design"],
    tokens: {
      colors: {
        "color-bg": "#1E1E1E",
        "color-surface": "#2C2C2C",
        "color-text": "#FFFFFF",
        "color-text-muted": "#B3B3B3",
        "color-primary": "#0D99FF",
        "color-accent": "#A259FF",
        "color-border": "#444444",
      },
      radii: {
        "radius-sm": "4px",
        "radius-md": "6px",
        "radius-lg": "8px",
        "radius-xl": "12px",
      },
      typography: {
        "font-display": "'Inter', system-ui, sans-serif",
        "font-body": "'Inter', system-ui, sans-serif",
      },
    },
    variantHints: { button: "primary", card: "flat" },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "暖米底色、陶土橙、衬线人文感，适合 AI 与知识产品。",
    keywords: ["anthropic", "claude", "ai", "米色", "陶土", "人文"],
    tokens: {
      colors: {
        "color-bg": "#FAF9F5",
        "color-surface": "#FFFFFF",
        "color-text": "#1F1E1D",
        "color-text-muted": "#6B675F",
        "color-primary": "#CC785C",
        "color-accent": "#D97757",
        "color-border": "#E7E3DA",
      },
      radii: {
        "radius-sm": "6px",
        "radius-md": "10px",
        "radius-lg": "14px",
        "radius-xl": "18px",
      },
      typography: {
        "font-display": "'Tiempos Text', Georgia, serif",
        "font-body": "'Styrene', system-ui, sans-serif",
      },
    },
    variantHints: { button: "primary", card: "elevated" },
  },
  {
    id: "linear-light",
    name: "Linear（浅色）",
    description: "浅色高效、淡紫灰底、紫罗兰主色，适合项目与任务管理。",
    keywords: ["linear light", "任务管理", "紫罗兰", "高效"],
    tokens: {
      colors: {
        "color-bg": "#FCFCFD",
        "color-surface": "#FFFFFF",
        "color-text": "#1D1E20",
        "color-text-muted": "#6E7278",
        "color-primary": "#5E6AD2",
        "color-accent": "#8A8F98",
        "color-border": "#E8E8EB",
      },
      radii: {
        "radius-sm": "4px",
        "radius-md": "6px",
        "radius-lg": "8px",
        "radius-xl": "10px",
      },
      typography: {
        "font-display": "'Inter', system-ui, sans-serif",
        "font-body": "'Inter', system-ui, sans-serif",
      },
    },
    variantHints: { button: "primary", card: "elevated" },
  },
];

// Brand design systems are full token overrides like style guides, so route
// them through the same matching + application machinery.
STYLE_GUIDES.push(...BRAND_DESIGN_SYSTEMS);

/** Fuzzy-match a style guide by id or keywords. */
export function matchStyleGuide(tag: string): StyleGuide | undefined {
  const t = tag.trim().toLowerCase();
  return STYLE_GUIDES.find(
    (g) =>
      g.id === t ||
      g.name === tag.trim() ||
      g.keywords.some((k) => k.toLowerCase() === t || k.toLowerCase().includes(t) || t.includes(k.toLowerCase()))
  );
}

export interface AppliedGuide {
  guide_id: string;
  guide_name: string;
  base_style: string;
  overrides: Array<{ category: string; key: string; value: string; reason: string }>;
}

/**
 * Apply a style guide on top of a base style preset. The guide's token
 * overrides win over the preset tokens; sources are marked "user" so the
 * change is visible to the AI in the activity log.
 */
export function applyStyleGuide(tag: string, baseStyle?: string): AppliedGuide {
  const guide = matchStyleGuide(tag);
  if (!guide) {
    throw new Error(
      `Unknown style guide "${tag}". Available: ${STYLE_GUIDES.map((g) => g.id).join(", ")}`
    );
  }
  const style = baseStyle || stateStore.getState().style || "minimal";
  applyStyleTokenSet(stateStore, style, undefined, "preset");

  const overrides: AppliedGuide["overrides"] = [];
  const applyGroup = (
    category: "colors" | "radii" | "shadows" | "typography",
    entries: Record<string, string> | undefined,
    reason: string
  ) => {
    if (!entries) return;
    Object.entries(entries).forEach(([key, value]) => {
      stateStore.setToken(category, key, value, "user", reason);
      overrides.push({ category, key, value, reason });
    });
  };

  applyGroup("colors", guide.tokens.colors, `风格指南「${guide.name}」色彩覆盖`);
  applyGroup("radii", guide.tokens.radii, `风格指南「${guide.name}」圆角覆盖`);
  applyGroup("shadows", guide.tokens.shadows, `风格指南「${guide.name}」阴影覆盖`);
  applyGroup("typography", guide.tokens.typography, `风格指南「${guide.name}」字体覆盖`);

  return { guide_id: guide.id, guide_name: guide.name, base_style: style, overrides };
}

/** Radius set for a named style (used by semantic styling). */
export function radiusSetFor(style: "sharp" | "subtle" | "rounded" | "pill"): Record<string, string> {
  const values = RADIUS_PRESETS[style];
  const radii: Record<string, string> = {};
  RADIUS_NAMES.forEach((name, i) => {
    radii[`radius-${name}`] = `${values[i]}px`;
  });
  radii["radius-full"] = "9999px";
  return radii;
}

/** Shadow set for a named style (used by semantic styling). */
export function shadowSetFor(style: "subtle" | "medium" | "sharp"): Record<string, string> {
  const preset = SHADOW_SYSTEM_PRESETS[style];
  const shadows: Record<string, string> = {};
  SHADOW_NAMES.forEach((name, i) => {
    shadows[`shadow-${name}`] = preset[i].shadow;
  });
  return shadows;
}
