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
