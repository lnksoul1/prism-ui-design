/**
 * 一键整理 (Tidy): rule-based one-click page rearrangement, inspired by
 * m3e-canvas tidy.ts (cluster cohesion + anchored bars + semantic gaps).
 *
 * 规则（确定性，只动位置，尺寸/顺序/内容不变）:
 *   1. 根组件矩形重叠（或间距 ≤4px）聚为一簇，作为整体移动（联合包围盒，
 *      全体成员同一 delta）；锚定类型不参与聚簇。
 *   2. 锚定类型: navbar/breadcrumb/tabs 吸附顶部全宽 (x=0, w=pageWidth)；
 *      hero/cta/banner 紧贴顶栏下方全宽；footer 追加到内容栈底全宽。
 *   3. 其余单元按原始 y 序纵向堆叠，语义间距: text 类单元后 8px、两个
 *      列表类单元之间 8px、其余 16px。X 保留原左缘（左对齐意图），宽度
 *      超过页面 70% 的单元吸附到 16px 边距。
 *
 * 没有 layout 的根组件保持流式（不重排、不输出）；children 不受影响。
 * 只输出 layout 实际发生变化的组件。
 */
import type { ComponentLayout, ComponentNode, PageDef } from "../state.js";

/** 桌面舞台宽度（containerWidthForPlatform 的 desktop 默认值）。 */
export const TIDY_PAGE_WIDTH = 1200;
/** 左右边距（宽单元吸附线）。 */
export const TIDY_MARGIN = 16;
/** 两个矩形最多相距多远仍算一簇（"几乎重叠"）。 */
const NEAR_GAP = 4;
/** 语义紧间距。 */
const GAP_TIGHT = 8;
/** 常规间距。 */
const GAP_NORMAL = 16;
/** 单元宽度超过页面宽度的该比例时吸附到边距。 */
const WIDE_RATIO = 0.7;

const TOP_BAR_TYPES = new Set(["navbar", "breadcrumb", "tabs"]);
const HERO_TYPES = new Set(["hero", "cta", "banner"]);
const FOOTER_TYPES = new Set(["footer"]);
/** 这些类型之后的单元用紧间距（标题/文本后跟内容）。 */
const TEXT_LIKE_TYPES = new Set(["text", "text_section", "breadcrumb", "heading"]);
/** 两个相邻的列表类单元之间用紧间距。 */
const LIST_LIKE_TYPES = new Set([
  "card", "card_grid", "list", "table", "feature_list", "feature_grid",
  "pricing", "testimonial", "bento_grid", "stats", "timeline", "faq", "accordion",
]);

const isTopBar = (type: string) => TOP_BAR_TYPES.has(type);
const isHero = (type: string) => HERO_TYPES.has(type);
const isFooter = (type: string) => FOOTER_TYPES.has(type);
const isAnchored = (type: string) => isTopBar(type) || isHero(type) || isFooter(type);

interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** 一个可移动单元: 单个锚定组件，或一个重叠簇（成员按页序）。 */
interface Unit {
  members: Array<{ id: string; layout: ComponentLayout }>;
  bb: Rect;
  /** 主导成员（面积最大者）的类型，用于语义间距判断。 */
  type: string;
  /** 首个成员的原始页序（排序稳定 tie-break）。 */
  idx: number;
}

export interface TidyUpdate {
  id: string;
  layout: ComponentLayout;
}

const rectOf = (layout: ComponentLayout): Rect => ({
  l: layout.x,
  t: layout.y,
  r: layout.x + layout.w,
  b: layout.y + layout.h,
});

const near = (a: Rect, b: Rect): boolean =>
  Math.min(a.r, b.r) - Math.max(a.l, b.l) >= -NEAR_GAP &&
  Math.min(a.b, b.b) - Math.max(a.t, b.t) >= -NEAR_GAP;

const union = (a: Rect, b: Rect): Rect => ({
  l: Math.min(a.l, b.l),
  t: Math.min(a.t, b.t),
  r: Math.max(a.r, b.r),
  b: Math.max(a.b, b.b),
});

const area = (r: Rect): number => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);

const changed = (a: ComponentLayout, b: ComponentLayout): boolean =>
  a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h;

/** 语义间距: 前一单元是 text 类 → 8；两个列表类之间 → 8；其余 16。 */
function gapBefore(prev: Unit, cur: Unit): number {
  if (TEXT_LIKE_TYPES.has(prev.type)) return GAP_TIGHT;
  if (LIST_LIKE_TYPES.has(prev.type) && LIST_LIKE_TYPES.has(cur.type)) return GAP_TIGHT;
  return GAP_NORMAL;
}

/** 非锚定根组件 → 重叠簇单元（传递闭包，迭代合并）。 */
function buildClusters(
  items: Array<{ id: string; type: string; layout: ComponentLayout; idx: number }>
): Unit[] {
  const units: Unit[] = items.map((p) => ({
    members: [{ id: p.id, layout: p.layout }],
    bb: rectOf(p.layout),
    type: p.type,
    idx: p.idx,
  }));
  for (;;) {
    let merged = false;
    outer: for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        if (!near(units[i].bb, units[j].bb)) continue;
        // 大成员命名簇（容器意图），成员按页序保持稳定
        const big = area(units[i].bb) >= area(units[j].bb) ? units[i] : units[j];
        units[i] = {
          members: [...units[i].members, ...units[j].members],
          bb: union(units[i].bb, units[j].bb),
          type: big.type,
          idx: Math.min(units[i].idx, units[j].idx),
        };
        units.splice(j, 1);
        merged = true;
        break outer;
      }
    }
    if (!merged) return units;
  }
}

/**
 * 计算页面根组件的整理后布局。
 *
 * @param page      目标页（只读取，不修改）
 * @param pageWidth 舞台宽度（默认 1200 桌面）
 * @returns layout 实际变化的组件列表（顺序: 顶栏 → hero → 流式 → 页脚，成员按页序）
 */
export function tidyPageLayout(page: PageDef, pageWidth = TIDY_PAGE_WIDTH): TidyUpdate[] {
  const placed = page.components
    .map((c: ComponentNode, idx: number) => ({ c, idx }))
    .filter(({ c }) => !!c.layout)
    .map(({ c, idx }) => ({
      id: c.id,
      type: c.type,
      layout: c.layout as ComponentLayout,
      idx,
    }));

  const anchored = placed.filter((p) => isAnchored(p.type));
  const topBars = anchored.filter((p) => isTopBar(p.type)).sort(byOriginal);
  const heroes = anchored.filter((p) => isHero(p.type)).sort(byOriginal);
  const footers = anchored.filter((p) => isFooter(p.type)).sort(byOriginal);
  const flow = buildClusters(placed.filter((p) => !isAnchored(p.type)));
  flow.sort(
    (a, b) => a.bb.t - b.bb.t || a.bb.l - b.bb.l || a.idx - b.idx
  );

  const updates: TidyUpdate[] = [];
  let cursor = 0;
  let placedAny = false;

  // 2. 锚定: 顶栏从 y=0 起全宽堆叠（紧贴），hero 紧随其下全宽
  for (const bar of topBars) {
    pushAnchored(updates, bar, 0, cursor, pageWidth);
    cursor += bar.layout.h;
    placedAny = true;
  }
  for (const hero of heroes) {
    pushAnchored(updates, hero, 0, cursor, pageWidth);
    cursor += hero.layout.h;
    placedAny = true;
  }

  // 3. 流式: 原始 y 序 + 语义间距；保留原 x（宽单元吸附 16px 边距）
  const hasTop = topBars.length > 0 || heroes.length > 0;
  let prev: Unit | null = null;
  for (const unit of flow) {
    const gap = prev === null ? (hasTop ? GAP_NORMAL : 0) : gapBefore(prev, unit);
    cursor += gap;
    const w = unit.bb.r - unit.bb.l;
    const x = w > pageWidth * WIDE_RATIO ? TIDY_MARGIN : unit.bb.l;
    const dx = x - unit.bb.l;
    const dy = cursor - unit.bb.t;
    for (const m of unit.members) {
      const next = {
        x: Math.round(m.layout.x + dx),
        y: Math.round(m.layout.y + dy),
        w: m.layout.w,
        h: m.layout.h,
      };
      if (changed(m.layout, next)) updates.push({ id: m.id, layout: next });
    }
    cursor += unit.bb.b - unit.bb.t;
    placedAny = true;
    prev = unit;
  }

  // 页脚: 内容栈底追加（与上方留 16px 间距），全宽
  if (footers.length > 0 && placedAny) cursor += GAP_NORMAL;
  for (const footer of footers) {
    pushAnchored(updates, footer, 0, cursor, pageWidth);
    cursor += footer.layout.h;
  }

  return updates;
}

function byOriginal(
  a: { layout: ComponentLayout; idx: number },
  b: { layout: ComponentLayout; idx: number }
): number {
  return a.layout.y - b.layout.y || a.layout.x - b.layout.x || a.idx - b.idx;
}

function pushAnchored(
  updates: TidyUpdate[],
  p: { id: string; layout: ComponentLayout },
  x: number,
  y: number,
  pageWidth: number
): void {
  const next = { x, y, w: pageWidth, h: p.layout.h };
  if (changed(p.layout, next)) updates.push({ id: p.id, layout: next });
}
