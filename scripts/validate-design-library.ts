/**
 * Design-library catalog migration/validation helper.
 *
 * Run with: npx tsx scripts/validate-design-library.ts
 *
 * Validates that the externalized catalog exposes:
 *   - 24 styles
 *   - 117 component templates/variants
 *   - >= 2 term templates
 * and that every style/component has the required identity fields.
 */
import { loadDesignLibraryCatalog } from "../src/design-library.js";

const catalog = loadDesignLibraryCatalog(true);

if (catalog.styles.length !== 24) {
  throw new Error(`Expected 24 design styles, got ${catalog.styles.length}`);
}
if (catalog.components.length !== 117) {
  throw new Error(`Expected 117 design components, got ${catalog.components.length}`);
}
if (catalog.termTemplates.length < 2) {
  throw new Error(`Expected at least 2 term templates, got ${catalog.termTemplates.length}`);
}
for (const style of catalog.styles) {
  if (!style.id || !style.name || !Array.isArray(style.tags)) {
    throw new Error(`Invalid style entry: ${JSON.stringify(style)}`);
  }
}
for (const component of catalog.components) {
  if (!component.id || !component.name || !component.type || !component.variant) {
    throw new Error(`Invalid component entry: ${JSON.stringify(component)}`);
  }
}
console.log(
  `Design library OK: ${catalog.styles.length} styles, ${catalog.components.length} components, ${catalog.termTemplates.length} term templates.`
);
