/**
 * React Bits component registry (upgrade plan U3).
 *
 * Mirrors github.com/DavidHDev/react-bits — 165+ animated React components
 * across 4 categories (Text/Animations/Components/Backgrounds) with 4 variants
 * each (JS-CSS, JS-TW, TS-CSS, TS-TW). Rather than copying all 165+ component
 * source files verbatim (which would bloat the repo), this registry defines
 * the component catalog metadata (name, category, prismType, propsSchema,
 * description, deps) that the MCP tools surface to the agent. The actual
 * component source code is fetched on demand via `design_get_react_bits_code`
 * which generates a copy-ready component stub referencing the React Bits CDN
 * or the shadcn CLI install command.
 *
 * Categories map to Prism component types:
 *   - text       → text, heading, hero.title, cta.title
 *   - animations → generic (attachable to any component)
 *   - components → button, card, input, tooltip, alert, bento_grid, etc.
 *   - backgrounds → section.background, hero.background
 */

export type ReactBitsCategory = "text" | "animations" | "components" | "backgrounds";
export type ReactBitsVariant = "JS-CSS" | "JS-TW" | "TS-CSS" | "TS-TW";

export interface ReactBitsComponent {
  name: string;
  category: ReactBitsCategory;
  description: string;
  /** Maps to a Prism COMPONENT_TYPE (e.g. "text", "button", "hero"). */
  prismType: string;
  /** Props the component accepts (for the property inspector). */
  propsSchema: Array<{
    name: string;
    type: "string" | "number" | "boolean" | "color";
    default?: string | number | boolean;
    description: string;
  }>;
  /** Runtime dependencies (for CDN injection). */
  deps: string[];
  /** shadcn CLI install path (e.g. "@react-bits/BlurText-TS-TW"). */
  shadcnPath: string;
  /** Tags for search/filter. */
  tags: string[];
}

// ===== Registry (representative subset — 40 components covering all 4 categories) =====
// The full React Bits library has 165+; this registry provides the framework
// + a curated subset of the most popular components per category. Additional
// components can be added by pushing to REACT_BITS_COMPONENTS.

export const REACT_BITS_COMPONENTS: ReactBitsComponent[] = [
  // ===== Text Animations (10) =====
  {
    name: "BlurText",
    category: "text",
    description: "Text that blurs in character-by-character with stagger",
    prismType: "heading",
    propsSchema: [
      { name: "text", type: "string", default: "Blur Text", description: "Text content" },
      { name: "delay", type: "number", default: 150, description: "Delay between chars (ms)" },
      { name: "blurAmount", type: "number", default: 8, description: "Blur amount (px)" },
      { name: "iterations", type: "number", default: 20, description: "Scramble iterations" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/BlurText-TS-TW",
    tags: ["hero", "title", "fade", "blur"],
  },
  {
    name: "DecryptText",
    category: "text",
    description: "Text that decrypts from random chars to target text",
    prismType: "heading",
    propsSchema: [
      { name: "text", type: "string", default: "Decrypted", description: "Target text" },
      { name: "speed", type: "number", default: 50, description: "Decrypt speed (ms)" },
      { name: "maxIterations", type: "number", default: 10, description: "Max iterations" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/DecryptText-TS-TW",
    tags: ["hero", "title", "decode", "hacker"],
  },
  {
    name: "ScrambledText",
    category: "text",
    description: "Continuously scrambles text on hover",
    prismType: "text",
    propsSchema: [
      { name: "text", type: "string", default: "Hover me", description: "Text content" },
      { name: "speed", type: "number", default: 40, description: "Scramble speed" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/ScrambledText-TS-TW",
    tags: ["hover", "interactive", "decode"],
  },
  {
    name: "Splitchar",
    category: "text",
    description: "Splits text into characters with individual animations",
    prismType: "heading",
    propsSchema: [
      { name: "text", type: "string", default: "Split", description: "Text content" },
      { name: "delay", type: "number", default: 100, description: "Per-char delay" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/Splitchar-TS-TW",
    tags: ["title", "split", "stagger"],
  },
  {
    name: "ShinyText",
    category: "text",
    description: "Text with a shimmering highlight sweep",
    prismType: "text",
    propsSchema: [
      { name: "text", type: "string", default: "Shiny", description: "Text content" },
      { name: "speed", type: "number", default: 3, description: "Sweep speed (s)" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/ShinyText-TS-TW",
    tags: ["shimmer", "shine", "cta"],
  },
  {
    name: "GradientText",
    category: "text",
    description: "Text with animated gradient fill",
    prismType: "heading",
    propsSchema: [
      { name: "text", type: "string", default: "Gradient", description: "Text content" },
      { name: "colors", type: "string", default: "#6366F1,#A855F7,#EC4899", description: "Gradient colors (comma-sep)" },
      { name: "speed", type: "number", default: 5, description: "Animation speed" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/GradientText-TS-TW",
    tags: ["gradient", "colorful", "hero"],
  },
  {
    name: "TextPressure",
    category: "text",
    description: "Text that responds to cursor proximity (scale/weight)",
    prismType: "heading",
    propsSchema: [
      { name: "text", type: "string", default: "Pressure", description: "Text content" },
      { name: "flex", type: "boolean", default: true, description: "Flexible font weight" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/TextPressure-TS-TW",
    tags: ["interactive", "cursor", "hero"],
  },
  {
    name: "TypewriterText",
    category: "text",
    description: "Typewriter effect that types and deletes text",
    prismType: "text",
    propsSchema: [
      { name: "texts", type: "string", default: "Hello,World", description: "Comma-separated texts to cycle" },
      { name: "typeSpeed", type: "number", default: 100, description: "Typing speed (ms)" },
      { name: "deleteSpeed", type: "number", default: 50, description: "Delete speed (ms)" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/TypewriterText-TS-TW",
    tags: ["typewriter", "terminal", "dynamic"],
  },
  {
    name: "ScrollFloat",
    category: "text",
    description: "Text floats in response to scroll position",
    prismType: "heading",
    propsSchema: [
      { name: "text", type: "string", default: "Float", description: "Text content" },
      { name: "scrollSpeed", type: "number", default: 0.5, description: "Float speed" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/ScrollFloat-TS-TW",
    tags: ["scroll", "parallax", "title"],
  },
  {
    name: "AnimatedHeading",
    category: "text",
    description: "Heading with configurable entrance animation",
    prismType: "heading",
    propsSchema: [
      { name: "text", type: "string", default: "Heading", description: "Heading text" },
      { name: "animation", type: "string", default: "fadeUp", description: "Animation type" },
      { name: "duration", type: "number", default: 0.6, description: "Duration (s)" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/AnimatedHeading-TS-TW",
    tags: ["title", "entrance", "hero"],
  },

  // ===== Animations (8) =====
  {
    name: "AnimatedContent",
    category: "animations",
    description: "Generic wrapper that animates any content on scroll/hover",
    prismType: "text",
    propsSchema: [
      { name: "animation", type: "string", default: "fadeUp", description: "Animation type" },
      { name: "delay", type: "number", default: 0, description: "Delay (s)" },
      { name: "duration", type: "number", default: 0.5, description: "Duration (s)" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/AnimatedContent-TS-TW",
    tags: ["wrapper", "generic", "scroll"],
  },
  {
    name: "MagneticButton",
    category: "animations",
    description: "Button that magnetically attracts to cursor",
    prismType: "button",
    propsSchema: [
      { name: "label", type: "string", default: "Click", description: "Button label" },
      { name: "strength", type: "number", default: 0.3, description: "Magnetic strength" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/MagneticButton-TS-TW",
    tags: ["button", "magnetic", "interactive"],
  },
  {
    name: "TiltCard",
    category: "animations",
    description: "Card with 3D tilt following cursor",
    prismType: "card",
    propsSchema: [
      { name: "maxRotation", type: "number", default: 15, description: "Max tilt degrees" },
      { name: "perspective", type: "number", default: 800, description: "Perspective (px)" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/TiltCard-TS-TW",
    tags: ["card", "3d", "hover", "tilt"],
  },
  {
    name: "SpotlightCard",
    category: "animations",
    description: "Card with spotlight following cursor",
    prismType: "card",
    propsSchema: [
      { name: "spotlightColor", type: "color", default: "#6366F1", description: "Spotlight color" },
      { name: "radius", type: "number", default: 200, description: "Spotlight radius" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/SpotlightCard-TS-TW",
    tags: ["card", "spotlight", "hover"],
  },
  {
    name: "ShimmerButton",
    category: "animations",
    description: "Button with shimmer sweep animation",
    prismType: "button",
    propsSchema: [
      { name: "label", type: "string", default: "Shimmer", description: "Button label" },
      { name: "speed", type: "number", default: 3, description: "Sweep speed (s)" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/ShimmerButton-TS-TW",
    tags: ["button", "shimmer", "cta"],
  },
  {
    name: "GlowCard",
    category: "animations",
    description: "Card with glow border effect",
    prismType: "card",
    propsSchema: [
      { name: "glowColor", type: "color", default: "#6366F1", description: "Glow color" },
      { name: "intensity", type: "number", default: 0.5, description: "Glow intensity" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/GlowCard-TS-TW",
    tags: ["card", "glow", "border"],
  },
  {
    name: "RippleButton",
    category: "animations",
    description: "Button with ripple effect on click",
    prismType: "button",
    propsSchema: [
      { name: "label", type: "string", default: "Ripple", description: "Button label" },
      { name: "rippleColor", type: "color", default: "#ffffff", description: "Ripple color" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/RippleButton-TS-TW",
    tags: ["button", "ripple", "click"],
  },
  {
    name: "FlipCard",
    category: "animations",
    description: "Card that flips to reveal back content on hover",
    prismType: "card",
    propsSchema: [
      { name: "frontTitle", type: "string", default: "Front", description: "Front title" },
      { name: "backTitle", type: "string", default: "Back", description: "Back title" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/FlipCard-TS-TW",
    tags: ["card", "flip", "hover"],
  },

  // ===== Components (12) =====
  {
    name: "AnimatedInput",
    category: "components",
    description: "Input with animated label and focus states",
    prismType: "input",
    propsSchema: [
      { name: "placeholder", type: "string", default: "Enter text", description: "Placeholder" },
      { name: "label", type: "string", default: "Label", description: "Label text" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/AnimatedInput-TS-TW",
    tags: ["input", "form", "animated"],
  },
  {
    name: "GlassCard",
    category: "components",
    description: "Glassmorphism card with backdrop blur",
    prismType: "glass_card",
    propsSchema: [
      { name: "title", type: "string", default: "Glass", description: "Card title" },
      { name: "blur", type: "number", default: 16, description: "Blur amount (px)" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/GlassCard-TS-TW",
    tags: ["card", "glass", "blur"],
  },
  {
    name: "AnimatedTooltip",
    category: "components",
    description: "Tooltip with smooth entrance animation",
    prismType: "tooltip",
    propsSchema: [
      { name: "content", type: "string", default: "Tooltip", description: "Tooltip content" },
      { name: "delay", type: "number", default: 200, description: "Show delay (ms)" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/AnimatedTooltip-TS-TW",
    tags: ["tooltip", "hover", "animated"],
  },
  {
    name: "Alert",
    category: "components",
    description: "Alert with slide-in animation and dismiss",
    prismType: "alert",
    propsSchema: [
      { name: "type", type: "string", default: "info", description: "info/warning/error/success" },
      { name: "message", type: "string", default: "Alert!", description: "Alert message" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/Alert-TS-TW",
    tags: ["alert", "notification"],
  },
  {
    name: "BentoGrid",
    category: "components",
    description: "Bento grid layout with stagger entrance",
    prismType: "bento_grid",
    propsSchema: [
      { name: "columns", type: "number", default: 3, description: "Number of columns" },
      { name: "gap", type: "number", default: 16, description: "Gap (px)" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/BentoGrid-TS-TW",
    tags: ["grid", "bento", "layout"],
  },
  {
    name: "CommandPalette",
    category: "components",
    description: "Command palette with fuzzy search (Cmd+K)",
    prismType: "command_palette",
    propsSchema: [
      { name: "placeholder", type: "string", default: "Type a command...", description: "Placeholder" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/CommandPalette-TS-TW",
    tags: ["command", "search", "palette"],
  },
  {
    name: "AnimatedNavbar",
    category: "components",
    description: "Navbar with scroll-aware hide/show",
    prismType: "navbar",
    propsSchema: [
      { name: "links", type: "string", default: "Home,About,Contact", description: "Comma-sep nav links" },
      { name: "hideOnScroll", type: "boolean", default: true, description: "Hide on scroll down" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/AnimatedNavbar-TS-TW",
    tags: ["navbar", "navigation", "scroll"],
  },
  {
    name: "FloatingNav",
    category: "components",
    description: "Floating dock-style navigation",
    prismType: "navbar",
    propsSchema: [
      { name: "items", type: "string", default: "Home,Search,Settings", description: "Comma-sep items" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/FloatingNav-TS-TW",
    tags: ["navbar", "floating", "dock"],
  },
  {
    name: "Marquee",
    category: "components",
    description: "Infinite scrolling marquee",
    prismType: "marquee",
    propsSchema: [
      { name: "direction", type: "string", default: "left", description: "left/right" },
      { name: "speed", type: "number", default: 20, description: "Speed (s per loop)" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/Marquee-TS-TW",
    tags: ["marquee", "scroll", "infinite"],
  },
  {
    name: "Skeleton",
    category: "components",
    description: "Loading skeleton with shimmer",
    prismType: "skeleton",
    propsSchema: [
      { name: "lines", type: "number", default: 3, description: "Number of lines" },
      { name: "width", type: "string", default: "100%", description: "Width" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/Skeleton-TS-TW",
    tags: ["loading", "skeleton", "shimmer"],
  },
  {
    name: "CookieBanner",
    category: "components",
    description: "Cookie consent banner with slide-in",
    prismType: "cookie_banner",
    propsSchema: [
      { name: "message", type: "string", default: "We use cookies", description: "Banner message" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/CookieBanner-TS-TW",
    tags: ["cookie", "banner", "consent"],
  },
  {
    name: "Fab",
    category: "components",
    description: "Floating action button with expand",
    prismType: "fab",
    propsSchema: [
      { name: "icon", type: "string", default: "+", description: "Icon/emoji" },
      { name: "label", type: "string", default: "Action", description: "Aria label" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/Fab-TS-TW",
    tags: ["fab", "floating", "action"],
  },

  // ===== Backgrounds (10) =====
  {
    name: "AuroraBackground",
    category: "backgrounds",
    description: "Animated aurora gradient background",
    prismType: "hero",
    propsSchema: [
      { name: "colors", type: "string", default: "#00D4FF,#9D4EDD", description: "Aurora colors" },
      { name: "speed", type: "number", default: 0.3, description: "Animation speed" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/AuroraBackground-TS-TW",
    tags: ["background", "aurora", "gradient"],
  },
  {
    name: "GridBackground",
    category: "backgrounds",
    description: "Animated grid pattern background",
    prismType: "section",
    propsSchema: [
      { name: "color", type: "color", default: "#6366F1", description: "Grid color" },
      { name: "size", type: "number", default: 40, description: "Cell size (px)" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/GridBackground-TS-TW",
    tags: ["background", "grid", "pattern"],
  },
  {
    name: "ParticlesBackground",
    category: "backgrounds",
    description: "Floating particles canvas background",
    prismType: "hero",
    propsSchema: [
      { name: "count", type: "number", default: 50, description: "Particle count" },
      { name: "color", type: "color", default: "#ffffff", description: "Particle color" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/ParticlesBackground-TS-TW",
    tags: ["background", "particles", "canvas"],
  },
  {
    name: "WavesBackground",
    category: "backgrounds",
    description: "SVG wave layers background",
    prismType: "footer",
    propsSchema: [
      { name: "colors", type: "string", default: "#6366F1,#A855F7", description: "Wave colors" },
      { name: "layers", type: "number", default: 3, description: "Number of wave layers" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/WavesBackground-TS-TW",
    tags: ["background", "waves", "svg"],
  },
  {
    name: "DotPattern",
    category: "backgrounds",
    description: "Dot matrix pattern background",
    prismType: "section",
    propsSchema: [
      { name: "color", type: "color", default: "#6366F1", description: "Dot color" },
      { name: "spacing", type: "number", default: 30, description: "Dot spacing (px)" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/DotPattern-TS-TW",
    tags: ["background", "dots", "pattern"],
  },
  {
    name: "GradientMesh",
    category: "backgrounds",
    description: "Animated gradient mesh background",
    prismType: "hero",
    propsSchema: [
      { name: "colors", type: "string", default: "#6366F1,#A855F7,#EC4899", description: "Mesh colors" },
      { name: "speed", type: "number", default: 5, description: "Animation speed" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/GradientMesh-TS-TW",
    tags: ["background", "gradient", "mesh"],
  },
  {
    name: "NoiseBackground",
    category: "backgrounds",
    description: "Film grain noise overlay background",
    prismType: "section",
    propsSchema: [
      { name: "opacity", type: "number", default: 0.05, description: "Noise opacity" },
      { name: "color", type: "color", default: "#000000", description: "Noise color" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/NoiseBackground-TS-TW",
    tags: ["background", "noise", "grain"],
  },
  {
    name: "StarfieldBackground",
    category: "backgrounds",
    description: "Starfield canvas background (space theme)",
    prismType: "hero",
    propsSchema: [
      { name: "starCount", type: "number", default: 200, description: "Number of stars" },
      { name: "speed", type: "number", default: 0.5, description: "Twinkle speed" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/StarfieldBackground-TS-TW",
    tags: ["background", "stars", "space"],
  },
  {
    name: "BlobBackground",
    category: "backgrounds",
    description: "Morphing blob shapes background",
    prismType: "hero",
    propsSchema: [
      { name: "colors", type: "string", default: "#6366F1,#A855F7", description: "Blob colors" },
      { name: "count", type: "number", default: 3, description: "Number of blobs" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/BlobBackground-TS-TW",
    tags: ["background", "blob", "organic"],
  },
  {
    name: "RippleBackground",
    category: "backgrounds",
    description: "Concentric ripple background",
    prismType: "cta",
    propsSchema: [
      { name: "color", type: "color", default: "#6366F1", description: "Ripple color" },
      { name: "speed", type: "number", default: 2, description: "Ripple speed" },
    ],
    deps: ["react"],
    shadcnPath: "@react-bits/RippleBackground-TS-TW",
    tags: ["background", "ripple", "wave"],
  },
];

export function listReactBitsComponents(category?: ReactBitsCategory): ReactBitsComponent[] {
  return category ? REACT_BITS_COMPONENTS.filter((c) => c.category === category) : REACT_BITS_COMPONENTS;
}

export function getReactBitsComponent(name: string): ReactBitsComponent | undefined {
  return REACT_BITS_COMPONENTS.find((c) => c.name === name);
}

export function getReactBitsStats() {
  const categories: Record<ReactBitsCategory, number> = { text: 0, animations: 0, components: 0, backgrounds: 0 };
  REACT_BITS_COMPONENTS.forEach((c) => {
    categories[c.category]++;
  });
  return {
    total: REACT_BITS_COMPONENTS.length,
    categories,
    variants: ["JS-CSS", "JS-TW", "TS-CSS", "TS-TW"] as ReactBitsVariant[],
  };
}

/**
 * Generate a copy-ready component source stub for a React Bits component.
 * (The real React Bits repo has full source; this generates a minimal
 * scaffold that references the official install path for the full source.)
 */
export function generateReactBitsCode(
  name: string,
  variant: ReactBitsVariant = "TS-TW"
): string {
  const comp = getReactBitsComponent(name);
  if (!comp) return `// Component "${name}" not found`;

  const isTS = variant.startsWith("TS");
  const isTW = variant.endsWith("TW");
  const ext = isTS ? "tsx" : "jsx";
  const lang = isTS ? "typescript" : "javascript";

  const propsInterface = isTS
    ? `interface ${name}Props {\n${comp.propsSchema
        .map((p) => `  ${p.name}?: ${p.type === "number" ? "number" : p.type === "boolean" ? "boolean" : p.type === "color" ? "string" : "string"};`)
        .join("\n")}\n}`
    : "";

  const defaults = comp.propsSchema
    .map((p) => `${p.name} = ${JSON.stringify(p.default)}`)
    .join(", ");

  return `// ${comp.description}
// Install: npx shadcn@latest add ${comp.shadcnPath}
// Category: ${comp.category} | Prism type: ${comp.prismType}
${lang === "typescript" ? propsInterface + "\n\n" : ""}export function ${name}({ ${comp.propsSchema
    .map((p) => p.name)
    .join(", ")} }${isTS ? `: ${name}Props` : ""} = {}) {
  return (
    <div className="${isTW ? `react-bits-${name.toLowerCase()}` : ""}"${isTW ? "" : ' style={{}}'}>
      {/* ${name} component — full source via shadcn CLI: npx shadcn@latest add ${comp.shadcnPath} */}
      ${comp.propsSchema.find((p) => p.name === "text" || p.name === "label")?.default || "Content"}
    </div>
  );
}
`;
}
