/**
 * Project persistence for Prism.
 *
 * Design state lives in the in-memory singleton (`stateStore`). This module
 * serializes it to `.prism.json` files so projects survive server restarts.
 * The storage directory can be overridden with `PRISM_PROJECT_DIR` (used by
 * tests to keep the filesystem clean).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { stateStore } from "./state.js";

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
  file: string;
  component_count: number;
}

export interface SaveProjectResult {
  file: string;
  project_name: string;
  component_count: number;
}

export interface LoadProjectResult {
  project_name: string;
  page_count: number;
  component_count: number;
  token_count: number;
}

export function getProjectDir(): string {
  return process.env.PRISM_PROJECT_DIR || path.join(os.homedir(), ".prism", "projects");
}

function ensureProjectDir(): string {
  const dir = getProjectDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      // eslint-disable-next-line no-control-regex
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

function stateSummary() {
  const state = stateStore.getState();
  const tokenCount = Object.values(state.tokens).reduce(
    (sum, tokens) => sum + Object.keys(tokens).length,
    0
  );
  return {
    state,
    tokenCount,
    componentCount: state.components.length,
    pageCount: state.pages.length,
  };
}

/**
 * Save the current design to a `.prism.json` file.
 * If `file` is omitted, a timestamped file is created in the project dir.
 */
export function saveProject(name?: string, file?: string): SaveProjectResult {
  const { state, tokenCount, componentCount, pageCount } = stateSummary();
  const dir = ensureProjectDir();
  const projectName = name || state.projectName || "Untitled Project";
  const target = file || path.join(dir, `${slugify(projectName)}-${Date.now()}.prism.json`);

  const payload = {
    schema: "prism-project",
    version: 1,
    saved_at: new Date().toISOString(),
    project_name: projectName,
    page_count: pageCount,
    component_count: componentCount,
    token_count: tokenCount,
    project: state,
  };
  writeFileSync(target, JSON.stringify(payload, null, 2), "utf-8");
  return { file: target, project_name: projectName, component_count: componentCount };
}

/** Load a `.prism.json` file and restore it into the state store. */
export function loadProject(file: string): LoadProjectResult {
  const raw = readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const project = (parsed.project || parsed) as Record<string, unknown>;

  if (!project || typeof project !== "object" || !Array.isArray(project.pages)) {
    throw new Error("Invalid Prism project file: missing 'project.pages'");
  }

  stateStore.restoreSnapshot(project as never);
  const { tokenCount, componentCount, pageCount } = stateSummary();
  return {
    project_name: String(project.projectName || parsed.project_name || "Untitled Project"),
    page_count: pageCount,
    component_count: componentCount,
    token_count: tokenCount,
  };
}

/** List saved projects, newest first. */
export function listProjects(): ProjectMeta[] {
  const dir = getProjectDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith(".prism.json"))
    .map((f) => {
      const file = path.join(dir, f);
      try {
        const parsed = JSON.parse(readFileSync(file, "utf-8")) as {
          saved_at?: string;
          project_name?: string;
          component_count?: number;
          project?: { projectName?: string; components?: unknown[] };
        };
        return {
          id: path.basename(f, ".prism.json"),
          name: parsed.project_name || parsed.project?.projectName || f,
          updatedAt: parsed.saved_at || "",
          file,
          component_count: parsed.component_count ?? parsed.project?.components?.length ?? 0,
        };
      } catch {
        return {
          id: path.basename(f, ".prism.json"),
          name: f,
          updatedAt: "",
          file,
          component_count: 0,
        };
      }
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/**
 * Rolling autosave checkpoint. Call once at server start; on every state
 * change the current design is written to `<dir>/autosave.prism.json`
 * (debounced) so a crash/restart can be recovered with `loadProject`.
 */
export function enableAutoSave(debounceMs = 2000): () => void {
  const dir = ensureProjectDir();
  const target = path.join(dir, "autosave.prism.json");
  let timer: NodeJS.Timeout | null = null;
  let lastJson = "";

  const flush = () => {
    timer = null;
    const payload = JSON.stringify(
      { schema: "prism-project", version: 1, saved_at: new Date().toISOString(), project: stateStore.getState() },
      null,
      2
    );
    if (payload !== lastJson) {
      lastJson = payload;
      writeFileSync(target, payload, "utf-8");
    }
  };

  const onChange = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  stateStore.on("change", onChange);
  return () => {
    if (timer) clearTimeout(timer);
    stateStore.off("change", onChange);
  };
}

/** Path of the rolling autosave checkpoint (may not exist yet). */
export function autosavePath(): string {
  return path.join(getProjectDir(), "autosave.prism.json");
}
