/**
 * Design version snapshots (improvement plan C4).
 *
 * Session-scoped snapshot store with a bounded history. A snapshot is a deep
 * copy of the design state; versions can be listed, restored, and diffed.
 */

import { stateStore } from "./state.js";

export interface DesignVersion {
  id: string;
  name: string;
  createdAt: string;
  projectName: string;
  componentCount: number;
  snapshot: ReturnType<typeof stateStore.getState>;
}

const MAX_VERSIONS = 50;
const versions: DesignVersion[] = [];

export function createVersion(name?: string): DesignVersion {
  const state = stateStore.getState();
  const version: DesignVersion = {
    id: `ver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name || `Version ${versions.length + 1}`,
    createdAt: new Date().toISOString(),
    projectName: state.projectName,
    componentCount: state.components.length,
    snapshot: JSON.parse(JSON.stringify(state)),
  };
  versions.push(version);
  if (versions.length > MAX_VERSIONS) {
    versions.shift();
  }
  return version;
}

export function listVersions(): Array<Omit<DesignVersion, "snapshot">> {
  return [...versions].reverse().map(({ snapshot: _snapshot, ...meta }) => meta);
}

export function getVersion(id: string): DesignVersion | undefined {
  return versions.find((v) => v.id === id);
}

export function restoreVersion(id: string): DesignVersion {
  const version = getVersion(id);
  if (!version) {
    throw new Error(`Version not found: ${id}`);
  }
  stateStore.restoreSnapshot(version.snapshot);
  return version;
}

export interface VersionDiff {
  from_id: string;
  to_id: string;
  components_added: number;
  components_removed: number;
  components_modified: number;
  token_changes: number;
  summary: string[];
}

interface FlatNode {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: FlatNode[];
}

function countComponents(nodes: FlatNode[]): number {
  let n = 0;
  const walk = (list: FlatNode[]) => {
    for (const node of list) {
      n++;
      if (Array.isArray(node.children)) walk(node.children as FlatNode[]);
    }
  };
  walk(nodes);
  return n;
}

export function diffVersions(fromId: string, toId: string): VersionDiff {
  const from = getVersion(fromId);
  const to = getVersion(toId);
  if (!from || !to) {
    throw new Error(`Cannot diff: version ${!from ? fromId : toId} not found`);
  }

  const fromComps = new Map<string, { type: string; props: Record<string, unknown> }>();
  const toComps = new Map<string, { type: string; props: Record<string, unknown> }>();
  const collect = (nodes: FlatNode[], map: typeof fromComps) => {
    for (const node of nodes) {
      map.set(node.id, { type: node.type, props: node.props || {} });
      if (Array.isArray(node.children)) collect(node.children as FlatNode[], map);
    }
  };
  collect(from.snapshot.components as unknown as FlatNode[], fromComps);
  collect(to.snapshot.components as unknown as FlatNode[], toComps);

  let added = 0;
  let removed = 0;
  let modified = 0;
  for (const [id, comp] of toComps) {
    const prev = fromComps.get(id);
    if (!prev) added++;
    else if (prev.type !== comp.type || JSON.stringify(prev.props) !== JSON.stringify(comp.props)) modified++;
  }
  for (const id of fromComps.keys()) {
    if (!toComps.has(id)) removed++;
  }

  const fromTokens = from.snapshot.tokens;
  const toTokens = to.snapshot.tokens;
  let tokenChanges = 0;
  (Object.keys(toTokens) as Array<keyof typeof toTokens>).forEach((cat) => {
    const a = fromTokens[cat] || {};
    const b = toTokens[cat] || {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if ((a[key]?.value || "") !== (b[key]?.value || "")) tokenChanges++;
    }
  });

  const summary = [
    `Components: ${fromComps.size} → ${toComps.size} (+${added} / -${removed} / modified ${modified})`,
    `Token changes: ${tokenChanges}`,
    added > 0 ? `Added: ${[...toComps.entries()].filter(([id]) => !fromComps.has(id)).map(([, c]) => c.type).join(", ")}` : "",
    removed > 0 ? `Removed: ${[...fromComps.entries()].filter(([id]) => !toComps.has(id)).map(([, c]) => c.type).join(", ")}` : "",
  ].filter(Boolean);

  return {
    from_id: fromId,
    to_id: toId,
    components_added: added,
    components_removed: removed,
    components_modified: modified,
    token_changes: tokenChanges,
    summary,
  };
}

export function versionCount(): number {
  return versions.length;
}

/** Test helper: clear the in-memory version store. */
export function clearVersionsForTests(): void {
  versions.length = 0;
}
