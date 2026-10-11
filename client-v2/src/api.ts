async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

async function del(url: string): Promise<unknown> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

export const api = {
  getState: () => get<unknown>("/api/state"),
  undo: () => post("/api/undo", {}),
  redo: () => post("/api/redo", {}),
  applyStyle: (styleId: string) => post("/api/design-library/style", { style_id: styleId }),
  addLibraryComponent: (componentId: string, variant?: string) =>
    post("/api/design-library/component", { component_id: componentId, variant }),
  setBaseStyle: (id: string, style: Record<string, string>) =>
    post(`/api/component/${id}/base-style`, { style }),
  setBreakpointStyle: (id: string, breakpoint: string, style: Record<string, string>) =>
    post(`/api/component/${id}/breakpoint-style`, { breakpoint, style }),
  setBoxMode: (id: string, patch: { enabled?: boolean; internalConfig?: Record<string, unknown> }) =>
    post(`/api/component/${id}/box-mode`, patch),
  addComment: (componentId: string, text: string, opts?: { x?: number; y?: number; assignee?: string }) =>
    post("/api/comment", { component_id: componentId, text, ...opts }),
  updateComment: (id: string, patch: { text?: string; resolved?: boolean; assignee?: string | null }) =>
    post(`/api/comment/${id}`, patch),
  addPageLink: (body: { from_page_id: string; to_page_id: string; source_component_id?: string; transition?: string }) =>
    post("/api/page-links", body),
  updatePageLink: (id: string, patch: { label?: string; transition?: string }) =>
    post(`/api/page-links/${id}`, patch),
  removePageLink: (id: string) => del(`/api/page-links/${id}`),
  deleteComponent: (id: string) => del(`/api/component/${id}`),
  duplicateComponent: (id: string) => post<{ id: string; type: string }>(`/api/component/${id}/duplicate`, {}),
  createActionFlow: (body: { name?: string; componentId: string; steps: Array<{ id?: string; action: string; params?: Record<string, unknown> }> }) =>
    post("/api/action-flows", body),
  updateActionFlow: (id: string, patch: { name?: string; steps?: unknown[]; enabled?: boolean }) =>
    post(`/api/action-flows/${id}`, patch),
  removeActionFlow: (id: string) => del(`/api/action-flows/${id}`),
  promptBrief: (body?: { stack?: "react" | "html"; page_ids?: string[] }) =>
    post<{ success: boolean; brief: string }>("/api/prompt-brief", body ?? {}),
  tidyLayout: () => post<{ success: boolean; applied: number }>("/api/layout/tidy", {}),
  addPageConstraint: (componentId: string) =>
    post<{ success: boolean; constraint: { id: string; component_type: string } }>(
      "/api/page-constraints",
      { component_id: componentId }
    ),
  removePageConstraint: (id: string) => del(`/api/page-constraints/${id}`),
};

/** R2 精准修改: 生成局部修改建议（diff 预览，不落地）。 */
export function requestEdit(body: { prompt: string; component_ids: string[] }): Promise<EditPreviewView & { error?: string }> {
  return post("/api/llm/edit", body);
}

/** R2 精准修改: 应用一处已确认的修改建议（服务端一次性消费，单 undo 步）。 */
export function applyEdit(editId: string): Promise<{ success?: boolean; applied?: number; skipped?: number; summary?: string; error?: string }> {
  return post("/api/llm/edit/apply", { edit_id: editId });
}

/** R2 精准修改: diff 视图（服务端 EditOpDiff 的子集）。 */
export interface EditDiffView {
  op: "update" | "delete" | "add";
  component_id?: string;
  component_type: string;
  title?: string;
  reason?: string;
  changes: Array<{ field: string; before: string; after: string }>;
}

/** R2 精准修改: /api/llm/edit 的响应视图。 */
export interface EditPreviewView {
  edit_id: string;
  diffs: EditDiffView[];
  requested: number;
  dropped: number;
  summary: string;
}

/** R1 多候选：done 事件携带的候选视图（服务端 CandidateResult 的子集）。 */
export interface CandidateView {
  index: number;
  label: string;
  angle: string;
  ok: boolean;
  component_count: number;
  summary: string;
  preview?: Array<{ type: string; title?: string }>;
  error?: string;
}

/** R1 多候选：应用候选批次中的一个（其余丢弃）。 */
export function applyCandidate(batchId: string, index: number): Promise<unknown> {
  return post("/api/llm/apply", { batch_id: batchId, index });
}

/** M2 NL2UI 流式: 消费 /api/llm/stream 的 SSE，返回 done 事件的结果。
 * R1 多候选：传 opts.candidates > 1 时服务端生成多个候选（不落地），
 * 通过 onCandidateStart/onCandidateDone 收候选；应用走 applyCandidate。 */
export async function streamGenerate(
  prompt: string,
  onDelta: (text: string) => void,
  opts?: {
    candidates?: number;
    onCandidateStart?: (index: number, total: number, label: string, angle: string) => void;
    onCandidateDone?: (c: CandidateView) => void;
  }
): Promise<unknown> {
  const res = await fetch("/api/llm/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ prompt, candidates: opts?.candidates }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`生成请求失败（${res.status}）`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneResult: unknown = null;
  let failure: Error | null = null;

  const handleEvent = (block: string): void => {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return; // 忽略无法解析的块
    }
    if (event === "delta" && typeof parsed.text === "string") {
      onDelta(parsed.text);
    } else if (event === "candidate_start" && typeof parsed.index === "number") {
      opts?.onCandidateStart?.(
        parsed.index,
        typeof parsed.total === "number" ? parsed.total : 0,
        typeof parsed.label === "string" ? parsed.label : "",
        typeof parsed.angle === "string" ? parsed.angle : ""
      );
    } else if (event === "candidate_done" && typeof parsed.index === "number") {
      opts?.onCandidateDone?.(parsed as unknown as CandidateView);
    } else if (event === "done") {
      doneResult = parsed;
    } else if (event === "error") {
      failure = new Error(typeof parsed.message === "string" ? parsed.message : "生成失败");
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    for (const block of blocks) handleEvent(block);
  }
  if (failure) throw failure;
  return doneResult;
}
