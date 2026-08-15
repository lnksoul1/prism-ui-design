/**
 * Component prop schemas (开发路线图 Phase 2.2)
 *
 * Every component type gets a zod schema describing the props the dashboard
 * renderer actually reads. Schemas are intentionally LENIENT:
 *   - all fields are optional (.partial()) — a component can be created with
 *     no props and the renderer falls back to defaults;
 *   - unknown fields pass through (.passthrough()) — old callers that pass
 *     extra keys keep working, and forward-compat is preserved.
 *
 * The real win is predictability: `addComponent` / `updateComponent` validate
 * and normalize props against the schema, so AI-generated params get coerced
 * to the right shapes (e.g. numbers → strings, nested item arrays) instead of
 * silently producing broken UI. Tool descriptions reference these schemas so
 * agents know exactly which fields each type accepts.
 */

import { z } from "zod";

// ===== Shared field shapes =====

/** Card-like items: card_grid / card / feature_list / bento etc. */
const cardItem = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  desc: z.string().optional(),
  price: z.string().optional(),
  image_url: z.string().optional(),
  image: z.string().optional(),
  icon: z.string().optional(),
  button_text: z.string().optional(),
}).passthrough();

/** Navbar / footer link rows: string label OR { label, text, url }. */
const linkItem = z.union([
  z.string(),
  z.object({
    label: z.string().optional(),
    text: z.string().optional(),
    url: z.string().optional(),
    href: z.string().optional(),
  }).passthrough(),
]);

// ===== Per-type schemas =====

const hero = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  button_text: z.string().optional(),
  image_url: z.string().optional(),
}).passthrough().partial();

const navbar = z.object({
  brand: z.string().optional(),
  links: z.array(linkItem).optional(),
  cta_text: z.string().optional(),
}).passthrough().partial();

const card_grid = z.object({
  items: z.array(cardItem).optional(),
}).passthrough().partial();

const card = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  desc: z.string().optional(),
  price: z.string().optional(),
  button_text: z.string().optional(),
  image_url: z.string().optional(),
  image: z.string().optional(),
}).passthrough().partial();

const cta = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  text: z.string().optional(),
  button_text: z.string().optional(),
}).passthrough().partial();

const footer = z.object({
  text: z.string().optional(),
  copyright: z.string().optional(),
  links: z.array(linkItem).optional(),
}).passthrough().partial();

const text_section = z.object({
  title: z.string().optional(),
  text: z.string().optional(),
  body: z.string().optional(),
}).passthrough().partial();

const feature_list = z.object({
  items: z.array(cardItem).optional(),
}).passthrough().partial();

const button = z.object({
  text: z.string().optional(),
  label: z.string().optional(),
}).passthrough().partial();

const stats = z.object({
  items: z.array(z.object({
    value: z.string().optional(),
    label: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough().partial();

const pricing = z.object({
  plans: z.array(z.object({
    name: z.string().optional(),
    price: z.string().optional(),
    featured: z.boolean().optional(),
    features: z.array(z.string()).optional(),
    button_text: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough().partial();

const testimonial = z.object({
  quote: z.string().optional(),
  author: z.string().optional(),
  role: z.string().optional(),
  avatar: z.string().optional(),
}).passthrough().partial();

const banner = z.object({
  text: z.string().optional(),
  button_text: z.string().optional(),
}).passthrough().partial();

const timeline = z.object({
  items: z.array(z.object({
    date: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough().partial();

const faq = z.object({
  items: z.array(z.object({
    question: z.string().optional(),
    answer: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough().partial();

const form = z.object({
  fields: z.array(z.object({
    label: z.string().optional(),
    type: z.string().optional(),
    placeholder: z.string().optional(),
  }).passthrough()).optional(),
  button_text: z.string().optional(),
}).passthrough().partial();

const image = z.object({
  src: z.string().optional(),
  url: z.string().optional(),
  alt: z.string().optional(),
}).passthrough().partial();

const tabs = z.object({
  items: z.array(z.union([
    z.string(),
    z.object({
      label: z.string().optional(),
      title: z.string().optional(),
      content: z.string().optional(),
      body: z.string().optional(),
    }).passthrough(),
  ])).optional(),
  tabs: z.array(z.unknown()).optional(),
}).passthrough().partial();

const accordion = z.object({
  items: z.array(z.object({
    title: z.string().optional(),
    question: z.string().optional(),
    content: z.string().optional(),
    answer: z.string().optional(),
    description: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough().partial();

const carousel = z.object({
  slides: z.array(z.object({
    title: z.string().optional(),
    text: z.string().optional(),
    description: z.string().optional(),
  }).passthrough()).optional(),
  items: z.array(z.unknown()).optional(),
}).passthrough().partial();

const modal = z.object({
  title: z.string().optional(),
  text: z.string().optional(),
  body: z.string().optional(),
  description: z.string().optional(),
  cancel_text: z.string().optional(),
  confirm_text: z.string().optional(),
}).passthrough().partial();

const sidebar = z.object({
  title: z.string().optional(),
  links: z.array(z.union([z.string(), z.object({
    label: z.string().optional(),
    text: z.string().optional(),
    icon: z.string().optional(),
  }).passthrough()])).optional(),
  items: z.array(z.unknown()).optional(),
}).passthrough().partial();

const breadcrumb = z.object({
  items: z.array(z.union([z.string(), z.object({
    label: z.string().optional(),
    text: z.string().optional(),
  }).passthrough()])).optional(),
  crumbs: z.array(z.unknown()).optional(),
}).passthrough().partial();

const pagination = z.object({
  total: z.number().optional(),
  totalPages: z.number().optional(),
  current: z.number().optional(),
  currentPage: z.number().optional(),
}).passthrough().partial();

const progress = z.object({
  label: z.string().optional(),
  value: z.number().optional(),
  percent: z.number().optional(),
}).passthrough().partial();

const badge = z.object({
  text: z.string().optional(),
  label: z.string().optional(),
  color: z.string().optional(),
}).passthrough().partial();

const avatar = z.object({
  name: z.string().optional(),
  image: z.string().optional(),
  url: z.string().optional(),
}).passthrough().partial();

const input = z.object({
  label: z.string().optional(),
  placeholder: z.string().optional(),
  type: z.string().optional(),
  value: z.string().optional(),
}).passthrough().partial();

const grid = z.object({
  items: z.array(z.unknown()).optional(),
}).passthrough().partial();

const table = z.object({
  headers: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).optional(),
  items: z.array(z.unknown()).optional(),
}).passthrough().partial();

const alert = z.object({
  text: z.string().optional(),
  message: z.string().optional(),
  title: z.string().optional(),
}).passthrough().partial();

const tooltip = z.object({
  text: z.string().optional(),
  content: z.string().optional(),
  label: z.string().optional(),
}).passthrough().partial();

const bento_grid = z.object({
  items: z.array(cardItem).optional(),
}).passthrough().partial();

const skeleton = z.object({
  lines: z.number().optional(),
  width: z.string().optional(),
}).passthrough().partial();

const command_palette = z.object({
  placeholder: z.string().optional(),
  items: z.array(z.object({
    label: z.string().optional(),
    icon: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough().partial();

const glass_card = z.object({
  title: z.string().optional(),
  text: z.string().optional(),
  description: z.string().optional(),
}).passthrough().partial();

const fab = z.object({
  label: z.string().optional(),
  hint: z.string().optional(),
}).passthrough().partial();

const marquee = z.object({
  items: z.array(z.union([z.string(), z.object({
    title: z.string().optional(),
    text: z.string().optional(),
  }).passthrough()])).optional(),
}).passthrough().partial();

const feature_grid = z.object({
  items: z.array(z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough().partial();

const cookie_banner = z.object({
  text: z.string().optional(),
  accept_text: z.string().optional(),
  decline_text: z.string().optional(),
}).passthrough().partial();

const toggle = z.object({
  label: z.string().optional(),
  checked: z.boolean().optional(),
}).passthrough().partial();

// ===== Registry =====

/** Registry: component type → zod schema (all lenient: partial + passthrough). */
export const COMPONENT_PROP_SCHEMAS: Record<string, z.ZodType> = {
  hero,
  navbar,
  card_grid,
  card,
  cta,
  footer,
  text_section,
  feature_list,
  button,
  stats,
  pricing,
  testimonial,
  banner,
  timeline,
  faq,
  form,
  image,
  tabs,
  accordion,
  carousel,
  modal,
  sidebar,
  breadcrumb,
  pagination,
  progress,
  badge,
  avatar,
  input,
  grid,
  table,
  alert,
  tooltip,
  bento_grid,
  skeleton,
  command_palette,
  glass_card,
  fab,
  marquee,
  feature_grid,
  cookie_banner,
  toggle,
  // Canvas-first fidelity types (created by shapesToComponents)
  text: z.object({ text: z.string().optional(), fontSize: z.string().optional(), fontFamily: z.string().optional(), align: z.string().optional() }).passthrough().partial(),
  section: z.object({ title: z.string().optional() }).passthrough().partial(),
  container: z.object({ text: z.string().optional() }).passthrough().partial(),
};

/**
 * Validate & normalize props for a component type. Returns the parsed props
 * (unknown keys preserved). Throws when the value shape is fundamentally
 * wrong (e.g. items: "not-an-array").
 */
export function validateComponentProps(type: string, props: Record<string, unknown>): Record<string, unknown> {
  const schema = COMPONENT_PROP_SCHEMAS[type];
  if (!schema) return props;
  const result = schema.safeParse(props || {});
  if (!result.success) {
    // Lenient fallback: keep the original props rather than dropping data.
    return props || {};
  }
  return result.data as Record<string, unknown>;
}

/** Human-readable field description for a component type (for tool docs). */
export function describeComponentProps(type: string): string {
  const schema = COMPONENT_PROP_SCHEMAS[type];
  if (!schema) return "";
  const shape = (schema as z.ZodObject<Record<string, z.ZodType>>).shape || {};
  const fields = Object.keys(shape).map((k) => `${k}${isArrayField(shape[k]) ? "[]" : ""}`).join(", ");
  return fields ? `props fields: ${fields}` : "";
}

function isArrayField(schema: unknown): boolean {
  return !!schema && typeof schema === "object" && (schema as { _zodType?: string })._zodType === "ZodArray";
}
