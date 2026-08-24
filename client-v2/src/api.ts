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
