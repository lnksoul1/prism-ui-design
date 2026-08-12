/**
 * User template storage (improvement plan C3).
 *
 * A template captures the current design (style + tokens + component tree)
 * as a `.prism-template.json` file under the project directory, so a user or
 * agent can save and later re-apply recurring page structures.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { stateStore } from "./state.js";
import { getProjectDir } from "./project-store.js";

export interface TemplateMeta {
  id: string;
  name: string;
  savedAt: string;
  file: string;
  component_count: number;
}

function templatesDir(): string {
  const dir = path.join(getProjectDir(), "templates");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "template"
  );
}

/** Save the current design as a reusable template. */
export function saveTemplate(name?: string, file?: string): { file: string; name: string; component_count: number } {
  const dir = templatesDir();
  const state = stateStore.getState();
  const templateName = name || `${state.projectName || "Untitled"} Template`;
  const target = file || path.join(dir, `${slugify(templateName)}-${Date.now()}.prism-template.json`);

  const payload = {
    schema: "prism-template",
    version: 1,
    saved_at: new Date().toISOString(),
    name: templateName,
    style: state.style,
    theme_mode: state.themeMode,
    tokens: state.tokens,
    pages: state.pages,
  };
  writeFileSync(target, JSON.stringify(payload, null, 2), "utf-8");
  return { file: target, name: templateName, component_count: state.components.length };
}

/**
 * Load a template into the design. The current project name is preserved;
 * style, tokens, pages, and components are replaced by the template content.
 */
export function loadTemplate(file: string): { name: string; page_count: number; component_count: number } {
  const raw = readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.schema !== "prism-template") {
    throw new Error("Invalid template file: missing schema 'prism-template'");
  }

  const pages = Array.isArray(parsed.pages) ? (parsed.pages as never[]) : [];
  if (pages.length === 0) {
    throw new Error("Invalid template file: no pages");
  }
  const projectName = stateStore.getState().projectName;
  stateStore.restoreSnapshot({
    projectName,
    style: typeof parsed.style === "string" ? parsed.style : "minimal",
    themeMode: parsed.theme_mode === "dark" ? "dark" : "light",
    tokens: (parsed.tokens || {}) as never,
    pages,
    currentPageId: (pages[0] as { id?: string }).id,
    activityLog: [],
  });
  const state = stateStore.getState();
  return {
    name: String(parsed.name || "Template"),
    page_count: state.pages.length,
    component_count: state.components.length,
  };
}

/** List saved templates, newest first. */
export function listTemplates(): TemplateMeta[] {
  const dir = templatesDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".prism-template.json"))
    .map((f) => {
      const file = path.join(dir, f);
      try {
        const parsed = JSON.parse(readFileSync(file, "utf-8")) as {
          saved_at?: string;
          name?: string;
          pages?: Array<{ components?: unknown[] }>;
        };
        let componentCount = 0;
        for (const page of parsed.pages || []) {
          componentCount += Array.isArray(page.components) ? page.components.length : 0;
        }
        return {
          id: path.basename(f, ".prism-template.json"),
          name: parsed.name || f,
          savedAt: parsed.saved_at || "",
          file,
          component_count: componentCount,
        };
      } catch {
        return { id: path.basename(f, ".prism-template.json"), name: f, savedAt: "", file, component_count: 0 };
      }
    })
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}
