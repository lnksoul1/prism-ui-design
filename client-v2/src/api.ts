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
  addLibraryComponent: (componentId: string) =>
    post("/api/design-library/component", { component_id: componentId }),
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
  addPageLink: (body: { from_page_id: string; to_page_id: string; source_component_id?: string }) =>
    post("/api/page-links", body),
  removePageLink: (id: string) => del(`/api/page-links/${id}`),
  createActionFlow: (body: { name?: string; componentId: string; steps: Array<{ id?: string; action: string; params?: Record<string, unknown> }> }) =>
    post("/api/action-flows", body),
  updateActionFlow: (id: string, patch: { name?: string; steps?: unknown[]; enabled?: boolean }) =>
    post(`/api/action-flows/${id}`, patch),
  removeActionFlow: (id: string) => del(`/api/action-flows/${id}`),
};

/** M2 NL2UI 流式: 消费 /api/llm/stream 的 SSE，返回 done 事件的结果。 */
export async function streamGenerate(
  prompt: string,
  onDelta: (text: string) => void
): Promise<unknown> {
  const res = await fetch("/api/llm/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ prompt }),
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
