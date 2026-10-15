/**
 * Edits made by hand in the preview.
 *
 * The live preview is written by the server and read by viewers, so the reverse
 * direction uses the same shape: a mailbox file next to the artifact.
 *
 *   <preview dir>/edits.json        written by the panel, read and consumed here
 *   <preview dir>/edit-result.json  written here, read by the panel
 *   <preview dir>/design.html       re-rendered after every applied batch
 *
 * That keeps the server stdio-only — no HTTP endpoint, no socket — and keeps
 * every mutation on the one path the rest of the server uses (`design-service`).
 * The `user` mutation source is deliberate: these edits came from a human, and
 * the activity log should say so.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, watch, writeFileSync } from "fs";
import path from "path";
import { z } from "zod";
import {
  isTokenCategory,
  removeComponent,
  reorderComponent,
  reparentComponent,
  redo,
  setToken,
  undo,
  updateComponent,
} from "../service/design-service.js";
import { stateStore } from "../state.js";
import { writePreviewFile } from "./design-preview.js";

export type PreviewEdit = {
  op: "set_props" | "move" | "reparent" | "remove" | "set_token" | "undo" | "redo";
  id?: string;
  props?: Record<string, unknown>;
  before?: string;
  after?: string;
  parentId?: string | null;
  category?: string;
  key?: string;
  value?: string;
};

export interface EditOutcome {
  op: string;
  id?: string;
  ok: boolean;
  detail?: string;
}

/** Where the panel drops edits. `PRISM_EDIT_MAILBOX` wins; `off` disables it. */
export function editMailboxPath(): string | null {
  const configured = process.env.PRISM_EDIT_MAILBOX;
  if (configured && configured.trim()) {
    const value = configured.trim();
    if (value === "off" || value === "0" || value === "false") return null;
    return path.resolve(value);
  }
  const preview = process.env.PRISM_PREVIEW_FILE;
  const dir = preview && preview.trim()
    ? path.dirname(path.resolve(preview.trim()))
    : path.join(process.cwd(), ".prism-preview");
  return path.join(dir, "edits.json");
}

/** The panel reads this to tell the user what happened to its batch. */
export function editResultPath(): string | null {
  const mailbox = editMailboxPath();
  return mailbox ? path.join(path.dirname(mailbox), "edit-result.json") : null;
}

/**
 * Apply one batch, in order. Unknown ops and unknown component ids are reported
 * per edit rather than thrown: a hand-made batch is a user action, and one stale
 * id should not discard the rest of it.
 */
export function applyEdits(edits: PreviewEdit[], source: "ai" | "user" = "user"): EditOutcome[] {
  const outcomes: EditOutcome[] = [];
  for (const raw of Array.isArray(edits) ? edits : []) {
    const edit = (raw ?? {}) as PreviewEdit;
    const op = String(edit.op ?? "");
    const id = typeof edit.id === "string" ? edit.id : undefined;
    try {
      switch (op) {
        case "set_props": {
          if (!id || typeof edit.props !== "object" || edit.props === null) {
            throw new Error("set_props needs `id` and `props`");
          }
          const ok = updateComponent(id, edit.props, source);
          outcomes.push({ op, id, ok, detail: ok ? undefined : "unknown component id" });
          break;
        }
        case "move": {
          const before = typeof edit.before === "string" ? edit.before : null;
          const after = typeof edit.after === "string" ? edit.after : null;
          if (!id || (!before && !after)) throw new Error("move needs `id` and either `before` or `after`");
          const ok = reorderComponent(id, before ?? after!, before ? "before" : "after", source);
          outcomes.push({ op, id, ok, detail: ok ? undefined : "unknown component id" });
          break;
        }
        case "reparent": {
          if (!id) throw new Error("reparent needs `id`");
          const parentId = typeof edit.parentId === "string" ? edit.parentId : null;
          const ok = reparentComponent(id, parentId, source);
          outcomes.push({ op, id, ok, detail: ok ? undefined : "unknown component id" });
          break;
        }
        case "remove": {
          if (!id) throw new Error("remove needs `id`");
          const ok = removeComponent(id, source);
          outcomes.push({ op, id, ok, detail: ok ? undefined : "unknown component id" });
          break;
        }
        case "set_token": {
          const category = String(edit.category ?? "");
          const key = String(edit.key ?? "");
          if (!key || !edit.value) throw new Error("set_token needs `category`, `key` and `value`");
          if (!isTokenCategory(category)) throw new Error(`unknown token category "${category}"`);
          setToken(category, key, String(edit.value), source);
          outcomes.push({ op, ok: true, detail: key });
          break;
        }
        case "undo":
        case "redo": {
          const result = op === "undo" ? undo() : redo();
          outcomes.push({ op, ok: result !== false, detail: result === false ? "nothing to " + op : undefined });
          break;
        }
        default:
          outcomes.push({ op: op || "(missing op)", ok: false, detail: `unknown op "${op}"` });
      }
    } catch (error) {
      outcomes.push({ op, id, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}

/**
 * Consume the mailbox once: apply, acknowledge by removing it, re-render the
 * preview (new revision), and leave a result file for the panel.
 *
 * A batch that cannot be parsed is moved aside instead of retried forever — a
 * half-written JSON file must not spin the watcher.
 */
export function drainEditMailbox():
  | { applied: false }
  | { applied: true; outcomes: EditOutcome[]; revision: number; components: number } {
  const mailbox = editMailboxPath();
  if (!mailbox || !existsSync(mailbox)) return { applied: false };

  let payload: unknown;
  try {
    payload = JSON.parse(readFileSync(mailbox, "utf8"));
  } catch (error) {
    renameSync(mailbox, mailbox.replace(/\.json$/, "") + ".rejected.json");
    return { applied: false };
  }

  const edits = Array.isArray(payload)
    ? (payload as PreviewEdit[])
    : ((payload as { edits?: PreviewEdit[] })?.edits ?? []);
  const outcomes = applyEdits(edits);
  rmSync(mailbox, { force: true });

  const preview = writePreviewFile("html", { annotate: true });
  const result = {
    at: Date.now(),
    ok: outcomes.every((o) => o.ok),
    outcomes,
    revision: preview.revision,
    components: preview.componentCount,
    project: stateStore.getState().projectName,
  };
  const resultPath = editResultPath();
  if (resultPath) {
    mkdirSync(path.dirname(resultPath), { recursive: true });
    writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");
  }
  return {
    applied: true,
    outcomes,
    revision: preview.revision,
    components: preview.componentCount,
  };
}

/**
 * Watch the mailbox directory and drain it whenever the panel writes a batch.
 *
 * Directory watching (rather than watching the file) also catches the atomic
 * write-then-rename a client may use, and the debounce collapses the burst of
 * events one write produces.
 */
export function startEditMailbox(log: (message: string) => void = () => {}): () => void {
  const mailbox = editMailboxPath();
  if (!mailbox) {
    log("edit mailbox disabled");
    return () => {};
  }
  const dir = path.dirname(mailbox);
  mkdirSync(dir, { recursive: true });

  let timer: NodeJS.Timeout | null = null;
  const drain = () => {
    try {
      const result = drainEditMailbox();
      if (!result.applied) return;
      const failed = result.outcomes.filter((o) => !o.ok);
      log(
        `applied ${result.outcomes.length - failed.length}/${result.outcomes.length} preview edits` +
          (failed.length ? ` (${failed.map((f) => `${f.op}:${f.detail ?? "failed"}`).join(", ")})` : "")
      );
    } catch (error) {
      log(`edit mailbox failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const watcher = watch(dir, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      drain();
    }, 60);
  });

  // A batch written while the server was down is still applied on startup.
  drain();

  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}

// ===== Tool: design_apply_edits =====

const editSchema = z.object({
  op: z
    .enum(["set_props", "move", "reparent", "remove", "set_token", "undo", "redo"])
    .describe("set_props | move | reparent | remove | set_token | undo | redo"),
  id: z.string().optional().describe("target component id (all ops except set_token/undo/redo)"),
  props: z.record(z.unknown()).optional().describe("set_props: the props to merge"),
  before: z.string().optional().describe("move: place before this component id"),
  after: z.string().optional().describe("move: place after this component id"),
  parentId: z.string().nullable().optional().describe("reparent: new parent id, or null for top level"),
  category: z.string().optional().describe("set_token: colors | typography | spacing | shadows | radii | transitions"),
  key: z.string().optional().describe("set_token: the token key"),
  value: z.string().optional().describe("set_token: the token value"),
});

export function registerApplyEditsTool(server: McpServer): void {
  server.registerTool(
    "design_apply_edits",
    {
      title: "Apply Preview Edits",
      description: `Apply a batch of edits to the design — the same operations a person makes by hand in the live preview panel.

Use it when the user describes a change they just made (or wants) in editing terms: rewording a component, moving it, deleting it, reparenting it under another component, or changing a design token. Every edit goes through the normal design service, so the activity log marks it as a user edit and \`design_undo\` can take it back.

Edits apply in order and are reported one by one: an unknown id or a missing field fails that edit only, never the whole batch.

Args:
  - edits (array): the batch. Each entry is one of
      { op: "set_props", id, props }        merge props into a component (wording, button text, …)
      { op: "move", id, before? | after? }  reorder among siblings
      { op: "reparent", id, parentId|null } nest under another component, or lift to top level
      { op: "remove", id }                  delete a component
      { op: "set_token", category, key, value } change one design token
      { op: "undo" } | { op: "redo" }       step the design history

Returns:
  - outcomes: per-edit success/failure with a reason
  - revision: the live-preview revision written after the batch (also on disk)`,
      inputSchema: { edits: z.array(editSchema).describe("the edits to apply, in order") },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ edits }) => {
      try {
        const outcomes = applyEdits(edits as PreviewEdit[]);
        const preview = writePreviewFile("html", { annotate: true });
        const state = stateStore.getState();
        const failed = outcomes.filter((o) => !o.ok);
        const lines = [
          `Applied ${outcomes.length - failed.length}/${outcomes.length} edits.`,
          ``,
          ...outcomes.map((o) => `${o.ok ? "✅" : "❌"} ${o.op}${o.id ? ` ${o.id}` : ""}${o.detail ? ` — ${o.detail}` : ""}`),
          ``,
          `**Components:** ${preview.componentCount}`,
          `**Preview:** ${preview.path} (revision ${preview.revision})`,
          `**Project:** ${state.projectName}`,
        ];
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: {
            success: failed.length === 0,
            applied: outcomes.length - failed.length,
            failed: failed.length,
            outcomes: outcomes as unknown as Record<string, unknown>[],
            revision: preview.revision,
            component_count: preview.componentCount,
            preview_path: preview.path,
          },
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
