/**
 * Animation serializer — emits runnable code per export target.
 *
 * For HTML export: inline CSS keyframes (css engine) or `<script>` blocks
 * with gsap.context() (gsap engine).
 * For React export: className (css) or useGSAP() hook (gsap).
 */

import {
  type AnimationPreset,
  type ScrollTriggerConfig,
  getAnimationPreset,
  getDefaultParams,
  listAnimationPresets,
} from "./index.js";

// ===== CDN URLs (upgrade plan appendix B) =====

export const CDN_URLS = {
  lenisCSS: "https://unpkg.com/lenis@1.3.26/dist/lenis.css",
  lenisJS: "https://unpkg.com/lenis@1.3.26/dist/lenis.min.js",
  gsap: "https://cdn.jsdelivr.net/npm/gsap@3.15/dist/gsap.min.js",
  gsapScrollTrigger: "https://cdn.jsdelivr.net/npm/gsap@3.15/dist/ScrollTrigger.min.js",
  gsapSplitText: "https://cdn.jsdelivr.net/npm/gsap@3.15/dist/SplitText.min.js",
  gsapMorphSVG: "https://cdn.jsdelivr.net/npm/gsap@3.15/dist/MorphSVGPlugin.min.js",
  gsapFlip: "https://cdn.jsdelivr.net/npm/gsap@3.15/dist/Flip.min.js",
  gsapDraggable: "https://cdn.jsdelivr.net/npm/gsap@3.15/dist/Draggable.min.js",
  gsapScrambleText: "https://cdn.jsdelivr.net/npm/gsap@3.15/dist/ScrambleTextPlugin.min.js",
  gsapDrawSVG: "https://cdn.jsdelivr.net/npm/gsap@3.15/dist/DrawSVGPlugin.min.js",
  gsapMotionPath: "https://cdn.jsdelivr.net/npm/gsap@3.15/dist/MotionPathPlugin.min.js",
  gsapInertia: "https://cdn.jsdelivr.net/npm/gsap@3.15/dist/InertiaPlugin.min.js",
  three: "https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js",
  vantaBase: "https://cdn.jsdelivr.net/npm/vanta/dist/vanta.min.js",
} as const;

const DEP_TO_CDN: Record<string, string> = {
  gsap: CDN_URLS.gsap,
  ScrollTrigger: CDN_URLS.gsapScrollTrigger,
  SplitText: CDN_URLS.gsapSplitText,
  MorphSVGPlugin: CDN_URLS.gsapMorphSVG,
  Flip: CDN_URLS.gsapFlip,
  Draggable: CDN_URLS.gsapDraggable,
  ScrambleTextPlugin: CDN_URLS.gsapScrambleText,
  DrawSVGPlugin: CDN_URLS.gsapDrawSVG,
  MotionPathPlugin: CDN_URLS.gsapMotionPath,
  InertiaPlugin: CDN_URLS.gsapInertia,
};

/** Return the set of CDN <script> tags needed for the given dependency list. */
export function cdnScriptsForDeps(deps: string[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const d of deps) {
    const url = DEP_TO_CDN[d];
    if (url && !seen.has(url)) {
      urls.push(url);
      seen.add(url);
    }
  }
  return urls.map((u) => `<script src="${u}"></script>`);
}

/** Collect all deps needed across a list of (engine, preset) pairs. */
export function collectDeps(
  animations: Array<{ engine: "css" | "gsap"; preset: string }>
): string[] {
  const deps = new Set<string>();
  for (const { engine, preset } of animations) {
    if (engine === "css") continue;
    const p = getAnimationPreset(preset);
    if (p) p.deps.forEach((d) => deps.add(d));
  }
  return Array.from(deps).sort();
}

// ===== CSS keyframe serializer (legacy 20 presets) =====

const CSS_KEYFRAMES: Record<string, string> = {
  fadeUp: `@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`,
  fadeIn: `@keyframes fadeIn{from{opacity:0}to{opacity:1}}`,
  scaleIn: `@keyframes scaleIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}`,
  slideLeft: `@keyframes slideLeft{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}`,
  slideRight: `@keyframes slideRight{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}`,
  slideUp: `@keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}`,
  spring: `@keyframes spring{0%{opacity:0;transform:scale(.8)}60%{opacity:1;transform:scale(1.05)}100%{transform:scale(1)}}`,
  bounceIn: `@keyframes bounceIn{0%{opacity:0;transform:scale(.3)}50%{opacity:1;transform:scale(1.05)}70%{transform:scale(.9)}100%{transform:scale(1)}}`,
  flipIn: `@keyframes flipIn{from{opacity:0;transform:perspective(400px) rotateX(90deg)}to{opacity:1;transform:perspective(400px) rotateX(0)}}`,
  cinematic: `@keyframes cinematic{from{opacity:0;transform:scale(1.15)}to{opacity:1;transform:scale(1)}}`,
  shimmer: `@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`,
  glitch: `@keyframes glitch{0%{transform:translate(0)}20%{transform:translate(-2px,2px)}40%{transform:translate(2px,-2px)}60%{transform:translate(-1px,1px)}80%{transform:translate(1px,-1px)}100%{transform:translate(0)}}`,
  morphBlob: `@keyframes morphBlob{0%{border-radius:50%}50%{border-radius:30% 70% 70% 30%/30% 30% 70% 70%}100%{border-radius:8px}}`,
};

const CSS_HOVER_KEYFRAMES: Record<string, string> = {
  scaleUp: `:hover{transform:scale(1.05)}`,
  lift: `:hover{transform:translateY(-4px);box-shadow:0 12px 24px rgba(0,0,0,.15)}`,
  glow: `:hover{box-shadow:0 0 20px var(--color-primary, #6366F1)}`,
  ripple: `:hover::after{content:"";position:absolute;inset:0;background:radial-gradient(circle,rgba(255,255,255,.3),transparent);animation:ripplePulse .6s}`,
  spotlight: `:hover{background:radial-gradient(circle at var(--mx,50%) var(--my,50%),rgba(255,255,255,.15),transparent)}`,
  magnetic: `:hover{transform:translate(var(--mx,0),var(--my,0))}`,
  tilt: `:hover{transform:perspective(800px) rotateX(var(--rx,0)) rotateY(var(--ry,0))}`,
};

export function serializeCssPreset(
  presetName: string,
  selector: string,
  params: Record<string, number | string | boolean>
): string {
  const keyframe = CSS_KEYFRAMES[presetName] || CSS_HOVER_KEYFRAMES[presetName];
  if (!keyframe) return "";
  const duration = params.duration || 0.3;
  const delay = params.delay || 0;
  const curve = params.curve || "easeOut";
  const stagger = params.stagger || 0;

  if (CSS_KEYFRAMES[presetName]) {
    // Entry animation
    return [
      keyframe,
      `${selector}{animation:${presetName} ${duration}s ${curve} ${delay}s both${stagger ? `;animation-delay:calc(${delay}s + var(--i, 0) * ${stagger}s)` : ""}}`,
    ].join("\n");
  }
  // Hover animation
  return `${selector}${keyframe.replace(":hover", ":hover")}`;
}

// ===== GSAP serializer =====

export function serializeGsapPreset(
  presetName: string,
  selector: string,
  params: Record<string, number | string | boolean>,
  scrollTrigger?: ScrollTriggerConfig
): string {
  const p = getAnimationPreset(presetName);
  if (!p) return "";
  const merged = { ...getDefaultParams(p), ...params } as Record<string, string | number | boolean>;
  const stConfig = scrollTrigger
    ? JSON.stringify({
        start: scrollTrigger.start || "top 80%",
        end: scrollTrigger.end || "bottom 20%",
        scrub: scrollTrigger.scrub ?? false,
        pin: scrollTrigger.pin ?? false,
        markers: scrollTrigger.markers ?? false,
        toggleActions: scrollTrigger.toggleActions || "play none none reverse",
      })
    : "undefined";

  const targets = `gsap.utils.toArray('${selector}')`;

  // Per-preset codegen (representative; real impl would switch on name)
  const codeMap: Record<string, string> = {
    "gsap.splitBlur": `${targets}.forEach(el => {
  const split = new SplitText(el, {type:"chars"});
  gsap.from(split.chars, {duration:${merged.duration}, y:20, filter:"blur(${merged.blurAmount}px)", opacity:0, stagger:${merged.stagger}, ease:"${merged.ease}"${scrollTrigger ? `, scrollTrigger:${stConfig}` : ""}});
});`,
    "gsap.splitLines": `${targets}.forEach(el => {
  const split = new SplitText(el, {type:"lines"});
  gsap.from(split.lines, {duration:${merged.duration}, y:${merged.yOffset}, opacity:0, stagger:${merged.stagger}, ease:"${merged.ease}"${scrollTrigger ? `, scrollTrigger:${stConfig}` : ""}});
});`,
    "gsap.scrambleText": `${targets}.forEach(el => {
  gsap.to(el, {duration:${merged.duration}, scrambleText:{chars:"${merged.chars}", speed:${merged.speed}}, ease:"none"});
});`,
    "gsap.fadeUpStagger": `gsap.from(${targets}, {duration:${merged.duration}, y:${merged.yOffset}, opacity:0, stagger:${merged.stagger}, ease:"${merged.ease}"${scrollTrigger ? `, scrollTrigger:${stConfig}` : ""}});`,
    "gsap.flipGrid": `const state = Flip.getState(${targets});
// ...apply layout change...
Flip.from(state, {duration:${merged.duration}, ease:"${merged.ease}", absolute:true});`,
    "gsap.morphIcon": `gsap.to('${selector} path', {morphSVG:'path-to-shape', duration:${merged.duration}, ease:"${merged.ease}"});`,
    "gsap.scrollReveal": `gsap.from(${targets}, {duration:${merged.duration}, y:${merged.yOffset}, opacity:0, ease:"${merged.ease}", scrollTrigger:${stConfig}});`,
    "gsap.scrollPin": `gsap.timeline({scrollTrigger:{trigger:'${selector}', start:'top top', end:'${merged.end || "+=300%"}', pin:true, scrub:true}});
  // .to(...) add timeline steps`,
    "gsap.horizontalScroll": `gsap.to('${selector}', {xPercent:-100*(document.querySelectorAll('${selector} > *').length-1), ease:'${merged.ease}', scrollTrigger:{trigger:'${selector}', start:'top top', end:'${merged.end || "+=400%"}', scrub:true, pin:true}});`,
    "gsap.parallaxBg": `gsap.to('${selector}', {yPercent:${merged.yPercent}, ease:'${merged.ease}', scrollTrigger:{trigger:'${selector}', start:'top bottom', end:'bottom top', scrub:true}});`,
    "gsap.counter": `${targets}.forEach(el => {
  const target = ${merged.target};
  gsap.to({val:0}, {val:target, duration:${merged.duration}, ease:"${merged.ease}", onUpdate:function(){el.textContent = Math.round(this.targets()[0].val);}, scrollTrigger:${stConfig}});
});`,
    "gsap.drawSvg": `gsap.from('${selector} path', {drawSVG:0, duration:${merged.duration}, ease:"${merged.ease}"${scrollTrigger ? `, scrollTrigger:${stConfig}` : ""}});`,
    "gsap.magnetic": `${targets}.forEach(el => {
  el.addEventListener('mousemove', e => {
    const r = el.getBoundingClientRect();
    gsap.to(el, {x:(e.clientX - r.left - r.width/2) * ${merged.strength}, y:(e.clientY - r.top - r.height/2) * ${merged.strength}, duration:0.3, ease:"${merged.ease}"});
  });
  el.addEventListener('mouseleave', () => gsap.to(el, {x:0, y:0, duration:${merged.duration}, ease:"${merged.ease}"}));
});`,
    "gsap.tilt3d": `${targets}.forEach(el => {
  gsap.set(el, {transformPerspective:${merged.perspective}});
  el.addEventListener('mousemove', e => {
    const r = el.getBoundingClientRect();
    gsap.to(el, {rotationY:((e.clientX-r.left)/r.width - 0.5) * ${Number(merged.maxRotation) * 2}, rotationX:-((e.clientY-r.top)/r.height - 0.5) * ${Number(merged.maxRotation) * 2}, duration:0.3, ease:"${merged.ease}"});
  });
  el.addEventListener('mouseleave', () => gsap.to(el, {rotationX:0, rotationY:0, duration:0.5, ease:"${merged.ease}"}));
});`,
    "gsap.scrubImage": `${targets}.forEach(el => {
  el.addEventListener('mouseenter', () => gsap.to(el.querySelector('img'), {scale:${merged.scale}, duration:${merged.duration}, ease:"${merged.ease}"}));
  el.addEventListener('mouseleave', () => gsap.to(el.querySelector('img'), {scale:1, duration:${merged.duration}, ease:"${merged.ease}"}));
});`,
    "gsap.textScrambleHover": `${targets}.forEach(el => {
  el.addEventListener('mouseenter', () => gsap.to(el, {duration:${merged.duration}, scrambleText:{chars:"${merged.chars}"}, ease:"none"}));
});`,
    "gsap.iconMorphHover": `${targets}.forEach(el => {
  el.addEventListener('mouseenter', () => gsap.to(el.querySelector('path'), {morphSVG:'path-hover', duration:${merged.duration}, ease:"${merged.ease}"}));
  el.addEventListener('mouseleave', () => gsap.to(el.querySelector('path'), {morphSVG:'path-default', duration:${merged.duration}, ease:"${merged.ease}"}));
});`,
    "gsap.glowPulse": `gsap.to('${selector}', {filter:"drop-shadow(0 0 ${merged.maxBlur}px currentColor)", duration:${merged.duration}, repeat:-1, yoyo:true, ease:"sine.inOut"});`,
    "gsap.flipCard": `${targets}.forEach(el => {
  el.addEventListener('mouseenter', () => Flip.flip(el, {duration:${merged.duration}, ease:"${merged.ease}"}));
});`,
    "gsap.draggable": `Draggable.create('${selector}', {type:'${merged.type}', edgeResistance:${merged.edgeResistance}, inertia:true});`,
    "gsap.timelineIntro": `const tl = gsap.timeline();
tl.from('${selector} .eyebrow', {opacity:0, y:20, duration:${(merged.duration as number) * 0.2}, ease:"${merged.ease}"})
  .from('${selector} .title', {opacity:0, y:30, duration:${(merged.duration as number) * 0.3}, ease:"${merged.ease}"}, '-=${merged.overlap}')
  .from('${selector} .subtitle', {opacity:0, y:20, duration:${(merged.duration as number) * 0.25}, ease:"${merged.ease}"}, '-=${merged.overlap}')
  .from('${selector} .cta', {opacity:0, y:15, duration:${(merged.duration as number) * 0.25}, ease:"${merged.ease}"}, '-=${merged.overlap}');`,
    "gsap.scrollStory": `const tl = gsap.timeline({scrollTrigger:{trigger:'${selector}', start:'top top', end:'${merged.end || "+=600%"}', pin:true, scrub:true}});
// .to(...) add story steps`,
    "gsap.batchReveal": `ScrollTrigger.batch(${targets}, {start:'${merged.start || "top 85%"}', onEnter: batch => gsap.from(batch, {duration:${merged.duration}, y:30, opacity:0, stagger:${merged.stagger}, ease:"power3.out"})});`,
    "gsap.matchMediaResponsive": `gsap.matchMedia().add('(max-width:768px)', () => {
  gsap.from('${selector}', {opacity:0, y:20, duration:0.5});
}).add('(min-width:769px)', () => {
  gsap.from('${selector}', {opacity:0, filter:'blur(8px)', duration:0.8});
});`,
    "gsap.floatingY": `gsap.to('${selector}', {y:${merged.amplitude}, duration:${merged.duration}, repeat:-1, yoyo:true, ease:"${merged.ease}"});`,
    "gsap.shimmerBar": `gsap.fromTo('${selector}::after', {backgroundPosition:'-200% 0'}, {backgroundPosition:'200% 0', duration:${merged.duration}, repeat:-1, ease:"${merged.ease}"});`,
    "gsap.marqueeInfinite": `gsap.to('${selector}', {xPercent:-50, duration:${merged.duration}, repeat:-1, ease:'none'});`,
  };

  return codeMap[presetName] || `// preset ${presetName} not implemented`;
}

/** Wrap GSAP code in a gsap.context() block for HTML export. */
export function wrapGsapContext(code: string, scope?: string): string {
  return `gsap.context(() => {\n${code}\n}${scope ? `, '${scope}'` : `)`};`;
}

/** Generate the Lenis + GSAP init script for HTML export (mode=lenis-gsap). */
export function generateLenisGsapInit(options: {
  lerp?: number;
  duration?: number;
  wheelMultiplier?: number;
  syncTouch?: boolean;
  anchors?: boolean;
  allowNestedScroll?: boolean;
}): string {
  const opts = JSON.stringify({
    autoRaf: false,
    anchors: options.anchors ?? true,
    allowNestedScroll: options.allowNestedScroll ?? true,
    lerp: options.lerp ?? 0.1,
    duration: options.duration ?? 1.2,
    wheelMultiplier: options.wheelMultiplier ?? 1,
    syncTouch: options.syncTouch ?? false,
    respectReducedMotion: true,
  });
  return `<script>
(function(){
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof Lenis === 'undefined' || typeof gsap === 'undefined') return;
  const lenis = new Lenis(${opts});
  if (window.ScrollTrigger) { lenis.on('scroll', ScrollTrigger.update); }
  gsap.ticker.add(function(time){ lenis.raf(time * 1000); });
  gsap.ticker.lagSmoothing(0);
  window.__lenis = lenis;
})();
</script>`;
}

/** List all presets (for design_list_animation_engines tool). */
export function listAllPresetsForExport() {
  return listAnimationPresets().map((p) => ({
    name: p.name,
    engine: p.engine,
    category: p.category,
    description: p.description,
    deps: p.deps,
    supportsScrollTrigger: !!p.supportsScrollTrigger,
    params: p.params,
  }));
}
