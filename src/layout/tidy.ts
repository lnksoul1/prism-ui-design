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
 *
 * R1 M1 生成落位扩展:
 *   - opts.intents: 组件 id → 布局意图。row/grid 意图的连续单元合并为横向
 *     band（每行最多 3 个等宽）；sidebar 意图收窄为 30% 宽并靠左边距；
 *     overlay 意图不参与重排（浮层语义，保持原位）。
 *   - opts.locked: 组件 id → 固定矩形（页面布局约束）。锁定组件不移动，
 *     流式 cursor 纵向让位跳过锁定区间。
 *   - verifyLayout: 纯函数体检（重叠对数 / 超界数），供生成 summary 如实报告。
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
/** band（row/grid 意图）每行最多的成员数。 */
const BAND_COLUMNS = 3;
/** sidebar 意图单元的宽度上限（页面宽度的比例）。 */
const SIDEBAR_RATIO = 0.3;
/** 重叠/超界判定的像素容差。 */
const BOUNDS_TOLERANCE = 0.5;

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

/** R1 M1: 组件级布局意图（生成 spec 的 layout_intent 字段）。 */
export type LayoutIntentKind = "row" | "stack" | "grid" | "sidebar" | "overlay";

const BAND_INTENTS = new Set<LayoutIntentKind>(["row", "grid"]);
/** R1 M1: tidy 的可选参数（生成落位管线传入；无参数时行为与 v1 完全一致）。 */
export interface TidyOptions {
  /** 组件 id → 布局意图（缺省按 stack 处理）。 */
  intents?: Map<string, LayoutIntentKind>;
  /** 组件 id → 固定矩形（页面布局约束锁定；这些组件不移动）。 */
  locked?: Map<string, ComponentLayout>;
}

/** R1 M1: 布局体检报告（纯统计，不做任何修改）。 */
export interface LayoutReport {
  /** 根组件中两两矩形相交（交集面积 > 容差）的对数；overlay 意图组件不计入。 */
  overlaps: number;
  /** 越出页面左右边界或负坐标的组件数（纵向页高不设限）。 */
  out_of_bounds: number;
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

/** 一个流式放置项: 普通聚簇单元，或一个 row/grid 意图 band（成员单组件）。 */
type FlowItem =
  | { kind: "unit"; unit: Unit }
  | { kind: "band"; members: Unit[] };

/** 连续的 row/grid 意图单元合并为 band；多成员聚簇不参与 band（保持整体平移语义）。 */
function buildFlowItems(units: Unit[], intents: Map<string, LayoutIntentKind> | undefined): FlowItem[] {
  if (!intents || intents.size === 0) return units.map((unit) => ({ kind: "unit", unit }) as FlowItem);
  const items: FlowItem[] = [];
  let band: Unit[] = [];
  const flush = (): void => {
    if (band.length > 1) items.push({ kind: "band", members: band });
    else if (band.length === 1) items.push({ kind: "unit", unit: band[0] });
    band = [];
  };
  for (const u of units) {
    const m = u.members.length === 1 ? u.members[0] : null;
    const intent = m ? intents.get(m.id) : undefined;
    if (m && intent !== undefined && BAND_INTENTS.has(intent)) {
      band.push(u);
      continue;
    }
    flush();
    items.push({ kind: "unit", unit: u });
  }
  flush();
  return items;
}

/** 流式 cursor 纵向让位: 落点落在某个锁定矩形的 (t-gap, b) 区间内则跳到其下方。 */
function skipLocked(cursor: number, rects: Rect[]): number {
  let y = cursor;
  for (;;) {
    const hit = rects.find((r) => y >= r.t - GAP_NORMAL && y < r.b);
    if (!hit) return y;
    y = hit.b + GAP_NORMAL;
  }
}

/**
 * 计算页面根组件的整理后布局。
 *
 * @param page      目标页（只读取，不修改）
 * @param pageWidth 舞台宽度（默认 1200 桌面）
 * @param opts      意图/锁定（R1 M1；缺省时行为与 v1 一致）
 * @returns layout 实际变化的组件列表（顺序: 顶栏 → hero → 流式 → 页脚，成员按页序）
 */
export function tidyPageLayout(
  page: PageDef,
  pageWidth = TIDY_PAGE_WIDTH,
  opts?: TidyOptions
): TidyUpdate[] {
  const intents = opts?.intents;
  const lockedRects: Rect[] = opts?.locked
    ? Array.from(opts.locked.values()).map(rectOf)
    : [];
  const lockedIds = opts?.locked ? new Set(opts.locked.keys()) : new Set<string>();
  const isOverlay = (id: string): boolean => intents?.get(id) === "overlay";

  const placed = page.components
    .map((c: ComponentNode, idx: number) => ({ c, idx }))
    .filter(({ c }) => !!c.layout && !lockedIds.has(c.id) && !isOverlay(c.id))
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
  //    R1 M1: row/grid 意图 band 横向均分；sidebar 收窄靠左；locked 让位。
  const hasTop = topBars.length > 0 || heroes.length > 0;
  const items = buildFlowItems(flow, intents);
  let prev: Unit | null = null;
  for (const item of items) {
    if (item.kind === "band") {
      cursor = skipLocked(cursor, lockedRects);
      cursor += prev === null ? (hasTop ? GAP_NORMAL : 0) : GAP_NORMAL;
      const contentW = Math.max(pageWidth - TIDY_MARGIN * 2, 320);
      let row: Unit[] = [];
      let rowY = cursor;
      let placedRows = 0;
      const flushRow = (): void => {
        if (row.length === 0) return;
        const n = row.length;
        const gap = n > 1 ? GAP_NORMAL : 0;
        const w = Math.max(Math.floor((contentW - gap * (n - 1)) / n), 1);
        let x = TIDY_MARGIN;
        let rowH = 0;
        for (const u of row) {
          const m = u.members[0];
          const next = { x, y: rowY, w, h: m.layout.h };
          if (changed(m.layout, next)) updates.push({ id: m.id, layout: next });
          x += w + gap;
          rowH = Math.max(rowH, m.layout.h);
        }
        rowY += rowH + GAP_NORMAL;
        placedRows += 1;
        row = [];
      };
      for (const u of item.members) {
        row.push(u);
        if (row.length === BAND_COLUMNS) flushRow();
      }
      flushRow();
      cursor = rowY - (placedRows > 0 ? GAP_NORMAL : 0);
      placedAny = placedRows > 0 || placedAny;
      // band 之后按常规间距续排
      prev = { members: [], bb: { l: 0, t: cursor, r: pageWidth, b: cursor }, type: "", idx: 0 };
      continue;
    }
    const unit = item.unit;
    const m0 = unit.members.length === 1 ? unit.members[0] : null;
    const intent = m0 && intents ? intents.get(m0.id) : undefined;
    const gap = prev === null ? (hasTop ? GAP_NORMAL : 0) : gapBefore(prev, unit);
    cursor = skipLocked(cursor + gap, lockedRects);
    if (intent === "sidebar" && m0) {
      // sidebar: 靠左边距、宽度封顶 30%，纵向照常占位
      const next = {
        x: TIDY_MARGIN,
        y: cursor,
        w: Math.min(m0.layout.w, Math.round(pageWidth * SIDEBAR_RATIO)),
        h: m0.layout.h,
      };
      if (changed(m0.layout, next)) updates.push({ id: m0.id, layout: next });
    } else {
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

/**
 * R1 M1: 布局体检（纯函数）。
 * 统计根组件中矩形相交对数与越界数；locked 矩形按约束位参与统计；
 * overlay 意图组件是刻意的浮层，不计入重叠（仍计越界）。
 */
export function verifyLayout(page: PageDef, pageWidth = TIDY_PAGE_WIDTH, opts?: TidyOptions): LayoutReport {
  const intents = opts?.intents;
  const solid: Rect[] = []; // 参与重叠统计
  const all: Rect[] = [];   // 参与越界统计（含 overlay 浮层）
  for (const c of page.components) {
    if (!c.layout) continue;
    const l = opts?.locked?.get(c.id) ?? c.layout;
    const r = rectOf(l);
    all.push(r);
    if (intents?.get(c.id) !== "overlay") solid.push(r);
  }
  let overlaps = 0;
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const w = Math.min(solid[i].r, solid[j].r) - Math.max(solid[i].l, solid[j].l);
      const h = Math.min(solid[i].b, solid[j].b) - Math.max(solid[i].t, solid[j].t);
      if (w > BOUNDS_TOLERANCE && h > BOUNDS_TOLERANCE) overlaps += 1;
    }
  }
  let out = 0;
  for (const r of all) {
    if (r.l < -BOUNDS_TOLERANCE || r.t < -BOUNDS_TOLERANCE || r.r > pageWidth + BOUNDS_TOLERANCE) out += 1;
  }
  return { overlaps, out_of_bounds: out };
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
