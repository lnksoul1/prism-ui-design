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
};
