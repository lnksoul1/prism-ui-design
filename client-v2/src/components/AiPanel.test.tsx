import { test, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiPanel } from "./AiPanel";

afterEach(() => {
  vi.unstubAllGlobals();
});

function sseResponse(events: Array<[string, unknown]>): Response {
  const encoder = new TextEncoder();
  const body = events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

test("streams deltas into preview and shows done summary", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    sseResponse([
      ["delta", { text: '{"components":' }],
      ["delta", { text: "[]}" }],
      ["done", { ok: true, component_count: 0, summary: "AI 已流式生成页面（0 个组件）" }],
    ])
  );
  vi.stubGlobal("fetch", fetchMock);

  render(<AiPanel />);
  await userEvent.type(screen.getByPlaceholderText(/描述你想要的页面/), "做一个落地页");
  await userEvent.click(screen.getByRole("button", { name: "生成" }));

  await waitFor(() => expect(screen.getByText(/已流式生成/)).toBeTruthy());
  expect(screen.getByTestId("ai-stream-preview").textContent).toContain('{"components":');
  vi.unstubAllGlobals();
});

test("error event surfaces message", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    sseResponse([["error", { message: "AI 输出无法解析为页面 JSON" }]])
  );
  vi.stubGlobal("fetch", fetchMock);

  render(<AiPanel />);
  await userEvent.type(screen.getByPlaceholderText(/描述你想要的页面/), "x");
  await userEvent.click(screen.getByRole("button", { name: "生成" }));

  await waitFor(() => expect(screen.getByText(/无法解析/)).toBeTruthy());
  vi.unstubAllGlobals();
});

test("multi-candidate: requests 3 candidates, applies one, drops the rest", async () => {
  const candidateDone = (index: number, ok: boolean) => [
    "candidate_done",
    {
      index,
      label: ok ? "均衡版" : "大胆版",
      angle: "",
      ok,
      component_count: ok ? 2 : 0,
      summary: "",
      preview: ok ? [{ type: "hero", title: "主标题" }] : [],
      ...(ok ? {} : { error: "生成失败" }),
    },
  ] as [string, unknown];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/llm/stream") {
      return sseResponse([
        ["candidate_start", { index: 0, total: 2, label: "均衡版", angle: "" }],
        candidateDone(0, true),
        candidateDone(1, false),
        [
          "done",
          {
            ok: true,
            batch_id: "batch_test_1",
            candidates: [],
            component_count: 0,
            page_count: 0,
            page_id: null,
            summary: "已生成 1 个候选，请选择一个应用（其余丢弃）",
          },
        ],
      ]);
    }
    // POST /api/llm/apply
    return new Response(
      JSON.stringify({
        success: true,
        ok: true,
        component_count: 2,
        page_count: 1,
        page_id: "page_2",
        summary: "已应用候选 1：AI 已生成页面（2 个组件，布局已自动对齐）",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);

  render(<AiPanel />);
  await userEvent.type(screen.getByPlaceholderText(/描述你想要的页面/), "做一个落地页");
  await userEvent.click(screen.getByTestId("ai-multi-candidate"));
  await userEvent.click(screen.getByRole("button", { name: "生成" }));

  // 候选区渲染: 成功卡 + 失败卡（禁用应用）
  await waitFor(() => expect(screen.getByTestId("ai-candidates")).toBeTruthy());
  expect(screen.getByTestId("ai-candidate-0")).toBeTruthy();
  expect(screen.getByTestId("ai-candidate-1")).toBeTruthy();
  const apply1 = screen.getByTestId("ai-apply-1") as HTMLButtonElement;
  expect(apply1.disabled).toBe(true);

  // 请求体携带 candidates: 3
  const streamInit = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
  expect(JSON.parse(String(streamInit.body)).candidates).toBe(3);

  // 应用候选 0 → apply 端点 + 候选区清空 + summary 显示
  await userEvent.click(screen.getByTestId("ai-apply-0"));
  await waitFor(() => expect(screen.getByText(/已应用候选 1/)).toBeTruthy());
  const [applyUrl, applyInit] = fetchMock.mock.calls[1] as [string, RequestInit];
  expect(applyUrl).toBe("/api/llm/apply");
  expect(JSON.parse(String(applyInit.body))).toEqual({ batch_id: "batch_test_1", index: 0 });
  expect(screen.queryByTestId("ai-candidates")).toBeNull();
  vi.unstubAllGlobals();
});
