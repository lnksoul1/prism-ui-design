/**
 * One-click write-back of the design canvas into the actual project files.
 *
 * - "tokens": rewrite the `:root` design-token block in `client/style.css`
 *   from the current design state (colors / radii / shadows / typography),
 *   preserving every unrelated variable. A timestamped backup is written
 *   before the edit.
 * - "preview": export the full design as `client/design-writeback.html`.
 */

import fs from "fs";
import path from "path";
import { stateStore } from "./state.js";
import { exportDesign } from "./tools/design-tools.js";

export type WritebackMode = "tokens" | "preview" | "all";

export interface WritebackResult {
  mode: WritebackMode;
  files: string[];
  backup?: string;
  token_map: Record<string, string>;
}

function hexToRgba(hex: string, alpha: number): string {
  let value = hex.trim().replace("#", "");
  if (value.length === 3) {
    value = value.split("").map((c) => c + c).join("");
  }
  const int = parseInt(value, 16);
  if (Number.isNaN(int)) return hex;
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

/**
 * Build the variable map from design tokens to the dashboard's CSS variables.
 * Only tokens that exist in the design state are included.
 */
export function buildTokenVarMap(): Record<string, string> {
  const tokens = stateStore.getState().tokens;
  const colors = tokens.colors || {};
  const radii = tokens.radii || {};
  const shadows = tokens.shadows || {};
  const typography = tokens.typography || {};
  const transitions = tokens.transitions || {};
  const map: Record<string, string> = {};

  if (colors["color-primary"]) map["--accent"] = colors["color-primary"].value;
  if (colors["color-primary-light"]) map["--accent-light"] = colors["color-primary-light"].value;
  if (colors["color-accent"]) map["--accent-bright"] = colors["color-accent"].value;
  if (colors["color-bg"]) map["--bg"] = colors["color-bg"].value;
  if (colors["color-surface"]) map["--surface"] = colors["color-surface"].value;
  if (colors["color-text"]) map["--text"] = colors["color-text"].value;
  if (colors["color-text-muted"]) map["--text-muted"] = colors["color-text-muted"].value;
  if (colors["color-border"]) {
    map["--border"] = hexToRgba(colors["color-border"].value, 0.08);
    map["--border-strong"] = hexToRgba(colors["color-border"].value, 0.14);
  }
  if (colors["color-primary"]) {
    map["--border-accent"] = hexToRgba(colors["color-primary"].value, 0.28);
  }

  if (radii["radius-sm"]) map["--radius-sm"] = radii["radius-sm"].value;
  if (radii["radius-md"]) map["--radius"] = radii["radius-md"].value;
  if (radii["radius-lg"]) map["--radius-lg"] = radii["radius-lg"].value;
  if (radii["radius-xl"]) map["--radius-xl"] = radii["radius-xl"].value;

  if (shadows["shadow-sm"]) map["--shadow-sm"] = shadows["shadow-sm"].value;
  if (shadows["shadow-md"]) map["--shadow-md"] = shadows["shadow-md"].value;
  if (shadows["shadow-lg"]) map["--shadow-lg"] = shadows["shadow-lg"].value;

  if (typography["font-display"]) map["--font-display"] = typography["font-display"].value + ", -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
  if (typography["font-body"]) map["--font"] = typography["font-body"].value + ", -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
  if (typography["font-mono"]) map["--mono"] = typography["font-mono"].value + ", Consolas, monospace";

  return map;
}

/** Replace or insert a single CSS variable inside a `:root { ... }` block. */
function applyVar(block: string, name: string, value: string): string {
  const re = new RegExp(`(${name})\\s*:\\s*[^;]+;`);
  if (re.test(block)) {
    return block.replace(re, `$1: ${value};`);
  }
  return block.replace(/(\n\})/, `\n  ${name}: ${value};\n}`);
}

function replaceRootBlock(css: string, vars: Record<string, string>): string {
  const re = /^:root \{[\s\S]*?\n\}/m;
  if (!re.test(css)) {
    // No root block: append one.
    return css + `\n:root {\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}\n`;
  }
  return css.replace(re, (block) => {
    let next = block;
    Object.entries(vars).forEach(([name, value]) => {
      next = applyVar(next, name, value);
    });
    return next;
  });
}

/** Write the design tokens back into `clientDir/style.css` with a backup. */
export function writebackTokens(clientDir: string): WritebackResult {
  const cssPath = path.join(clientDir, "style.css");
  if (!fs.existsSync(cssPath)) {
    throw new Error(`style.css not found in ${clientDir}`);
  }
  const tokenMap = buildTokenVarMap();
  const original = fs.readFileSync(cssPath, "utf-8");
  const backup = `${cssPath}.bak-${Date.now()}`;
  fs.writeFileSync(backup, original);
  fs.writeFileSync(cssPath, replaceRootBlock(original, tokenMap));
  return { mode: "tokens", files: [cssPath], backup, token_map: tokenMap };
}

/** Export the full design as `clientDir/design-writeback.html`. */
export function writebackPreview(clientDir: string): WritebackResult {
  const file = path.join(clientDir, "design-writeback.html");
  fs.writeFileSync(file, exportDesign("html"));
  return { mode: "preview", files: [file], token_map: {} };
}

export function writebackAll(clientDir: string): WritebackResult {
  const tokens = writebackTokens(clientDir);
  const preview = writebackPreview(clientDir);
  return {
    mode: "all",
    files: [...tokens.files, ...preview.files],
    backup: tokens.backup,
    token_map: tokens.token_map,
  };
}
