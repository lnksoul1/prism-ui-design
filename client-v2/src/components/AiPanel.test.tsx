import { test, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiPanel } from "./AiPanel";
import { useDesignStore } from "../stores/design";

afterEach(() => {
  vi.unstubAllGlobals();
  useDesignStore.setState({ selection: [] });
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

// ===== R2 对话式精准修改 =====

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("edit mode: requests targeted edit, renders diff card, applies via edit_id", async () => {
  useDesignStore.setState({ selection: ["comp_hero", "comp_btn"] });
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/llm/edit") {
      return jsonResponse({
        success: true,
        edit_id: "edit_t1",
        requested: 2,
        dropped: 0,
        summary: "已生成 2 处修改建议，请预览后应用",
        diffs: [
          {
            op: "update",
            component_id: "comp_hero",
            component_type: "hero",
            title: "旧标题",
            reason: "换标题",
            changes: [{ field: "title", before: "旧标题", after: "限时优惠" }],
          },
          { op: "add", component_type: "banner", title: "公告", changes: [{ field: "text", before: "（无）", after: "公告" }] },
        ],
      });
    }
    // POST /api/llm/edit/apply
    return jsonResponse({ success: true, applied: 2, skipped: 0, summary: "已应用 2 处修改" });
  }) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);

  render(<AiPanel />);
  // 编辑模式: placeholder 变化、多候选开关隐藏、按钮文案为「修改」
  const input = screen.getByPlaceholderText(/对选中的 2 个组件描述修改/) as HTMLInputElement;
  expect(screen.queryByTestId("ai-multi-candidate")).toBeNull();

  await userEvent.type(input, "把标题换成限时优惠");
  await userEvent.click(screen.getByTestId("ai-edit-go"));

  // 请求体携带选中组件 ids
  await waitFor(() => expect(screen.getByTestId("ai-edit-diff")).toBeTruthy());
  const [editUrl, editInit] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(editUrl).toBe("/api/llm/edit");
  expect(JSON.parse(String(editInit.body))).toEqual({
    prompt: "把标题换成限时优惠",
    component_ids: ["comp_hero", "comp_btn"],
    session_id: null,
  });
  expect(screen.getByTestId("ai-edit-op-0")).toBeTruthy();
  expect(screen.getByTestId("ai-edit-op-1")).toBeTruthy();
  expect(screen.getByText("旧标题")).toBeTruthy();
  expect(screen.getByText("限时优惠")).toBeTruthy();

  // 应用 → /api/llm/edit/apply {edit_id} → 卡片清空 + summary
  await userEvent.click(screen.getByTestId("ai-edit-apply"));
  await waitFor(() => expect(screen.getByText(/已应用 2 处修改/)).toBeTruthy());
  const [applyUrl, applyInit] = fetchMock.mock.calls[1] as [string, RequestInit];
  expect(applyUrl).toBe("/api/llm/edit/apply");
  expect(JSON.parse(String(applyInit.body))).toEqual({ edit_id: "edit_t1" });
  expect(screen.queryByTestId("ai-edit-diff")).toBeNull();
});

test("edit mode: discard clears the diff card; empty suggestion shows status only", async () => {
  useDesignStore.setState({ selection: ["comp_hero"] });
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/llm/edit") {
      return jsonResponse({
        success: true,
        edit_id: "edit_t2",
        requested: 1,
        dropped: 0,
        summary: "已生成 1 处修改建议，请预览后应用",
        diffs: [
          { op: "delete", component_id: "comp_hero", component_type: "button", title: "点我", changes: [] },
        ],
      });
    }
    return jsonResponse({ success: true, applied: 1, skipped: 0, summary: "已应用 1 处修改" });
  }) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);

  render(<AiPanel />);
  await userEvent.type(screen.getByPlaceholderText(/对选中的 1 个组件描述修改/), "删掉这个按钮");
  await userEvent.click(screen.getByTestId("ai-edit-go"));
  await waitFor(() => expect(screen.getByTestId("ai-edit-diff")).toBeTruthy());
  expect(screen.getByText("删除")).toBeTruthy();

  await userEvent.click(screen.getByTestId("ai-edit-discard"));
  expect(screen.queryByTestId("ai-edit-diff")).toBeNull();

  // 无建议: 只显示 status
  (fetchMock as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () =>
    jsonResponse({
      success: true,
      edit_id: "edit_t3",
      requested: 0,
      dropped: 0,
      summary: "AI 未提出修改建议（可换一种描述再试）",
      diffs: [],
    })
  );
  await userEvent.type(screen.getByPlaceholderText(/对选中的 1 个组件描述修改/), "随便看看");
  await userEvent.click(screen.getByTestId("ai-edit-go"));
  await waitFor(() => expect(screen.getByText(/AI 未提出修改建议/)).toBeTruthy());
  expect(screen.queryByTestId("ai-edit-diff")).toBeNull();
});

test("edit session: consecutive turns carry the same session_id", async () => {
  useDesignStore.setState({ selection: ["comp_hero"] });
  let turn = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/llm/edit") {
      turn += 1;
      return jsonResponse({
        success: true,
        edit_id: `edit_s${turn}`,
        session_id: "sess_ctx",
        requested: 1,
        dropped: 0,
        summary: "已生成 1 处修改建议，请预览后应用",
        diffs: [
          {
            op: "update",
            component_id: "comp_hero",
            component_type: "hero",
            title: "A",
            changes: [{ field: "title", before: "A", after: "B" }],
          },
        ],
      });
    }
    return jsonResponse({ success: true, applied: 1, skipped: 0, summary: "已应用 1 处修改" });
  }) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);

  render(<AiPanel />);
  const go = () => screen.getByTestId("ai-edit-go");

  // 第一轮: 无 session_id
  await userEvent.type(screen.getByPlaceholderText(/对选中的 1 个组件描述修改/), "把标题换成 B");
  await userEvent.click(go());
  await waitFor(() => expect(screen.getByTestId("ai-edit-diff")).toBeTruthy());
  expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).session_id).toBeNull();

  // 应用后追问第二轮: 复用服务端返回的 session_id
  await userEvent.click(screen.getByTestId("ai-edit-apply"));
  await waitFor(() => expect(screen.getByText(/已应用 1 处修改/)).toBeTruthy());
  await userEvent.type(screen.getByPlaceholderText(/对选中的 1 个组件描述修改/), "再大一点");
  await userEvent.click(go());
  await waitFor(() => expect(screen.getByTestId("ai-edit-diff")).toBeTruthy());
  expect(JSON.parse(String((fetchMock.mock.calls[2] as [string, RequestInit])[1].body)).session_id).toBe("sess_ctx");
});

test("layout ops render with semantic labels (重排/间距)", async () => {
  useDesignStore.setState({ selection: ["comp_hero"] });
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/llm/edit") {
      return jsonResponse({
        success: true,
        edit_id: "edit_l1",
        session_id: "sess_l",
        requested: 2,
        dropped: 0,
        summary: "已生成 2 处修改建议，请预览后应用",
        diffs: [
          {
            op: "arrange",
            component_id: "comp_hero",
            component_type: "card",
            title: "卡片一",
            reason: "并排",
            changes: [{ field: "位置", before: "(0, 0)", after: "(16, 0)" }],
          },
          {
            op: "gap",
            component_type: "button",
            title: "点我",
            changes: [{ field: "位置", before: "(0, 136)", after: "(0, 120)" }],
          },
        ],
      });
    }
    return jsonResponse({ success: true, applied: 2, skipped: 0, summary: "已应用 2 处修改" });
  }) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);

  render(<AiPanel />);
  await userEvent.type(screen.getByPlaceholderText(/对选中的 1 个组件描述修改/), "把这两个卡片并排，间距小一点");
  await userEvent.click(screen.getByTestId("ai-edit-go"));
  await waitFor(() => expect(screen.getByTestId("ai-edit-diff")).toBeTruthy());
  expect(screen.getByText("重排")).toBeTruthy();
  expect(screen.getByText("间距")).toBeTruthy();
  expect(screen.getByText("并排")).toBeTruthy();
  expect(screen.getByText("(0, 136)")).toBeTruthy();
});

test("R8 layout report card: split overlap/oob counts and tidy button", async () => {
  useDesignStore.setState({ selection: ["comp_hero"] });
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/llm/edit") {
      return jsonResponse({
        success: true,
        edit_id: "edit_lr1",
        session_id: "sess_lr",
        requested: 1,
        dropped: 0,
        summary: "已生成 1 处修改建议，请预览后应用",
        diffs: [
          { op: "add", component_type: "banner", title: "公告", changes: [{ field: "text", before: "（无）", after: "公告" }] },
        ],
      });
    }
    if (url === "/api/layout/tidy") {
      return jsonResponse({ success: true, applied: 5 });
    }
    return jsonResponse({
      success: true,
      applied: 1,
      skipped: 0,
      layout_issues: 3,
      layout_overlaps: 2,
      layout_out_of_bounds: 1,
      summary: "已应用 1 处修改，2 处布局重叠 · 1 处越界待处理",
    });
  }) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);

  render(<AiPanel />);
  await userEvent.type(screen.getByPlaceholderText(/对选中的 1 个组件描述修改/), "加一条公告");
  await userEvent.click(screen.getByTestId("ai-edit-go"));
  await waitFor(() => expect(screen.getByTestId("ai-edit-diff")).toBeTruthy());
  await userEvent.click(screen.getByTestId("ai-edit-apply"));

  // 体检卡: 拆分展示重叠与越界（服务端 summary 尾巴与卡片文案并存）
  await waitFor(() => expect(screen.getByTestId("ai-layout-report")).toBeTruthy());
  const card = screen.getByTestId("ai-layout-report");
  expect(card.textContent).toContain("布局体检");
  expect(card.textContent).toContain("2 处重叠");
  expect(card.textContent).toContain("1 处越界");

  // 一键整理 → POST /api/layout/tidy → 卡片收起 + 状态栏提示
  await userEvent.click(screen.getByTestId("ai-layout-tidy"));
  await waitFor(() => expect(screen.queryByTestId("ai-layout-report")).toBeNull());
  await waitFor(() => expect(screen.getByText(/已一键整理布局（5 处调整）/)).toBeTruthy());
  const tidyCall = fetchMock.mock.calls.find(([u]) => u === "/api/layout/tidy");
  expect(tidyCall).toBeTruthy();
});

test("R5 undo renders bare diff entry without target row", async () => {
  useDesignStore.setState({ selection: ["comp_hero"] });
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/llm/edit") {
      return jsonResponse({
        success: true,
        edit_id: "edit_u1",
        session_id: "sess_u",
        requested: 1,
        dropped: 0,
        summary: "已生成 1 处修改建议，请预览后应用",
        diffs: [{ op: "undo", component_type: "", reason: "撤销上一步 AI 修改", changes: [] }],
      });
    }
    return jsonResponse({ success: true, applied: 1, skipped: 0, added: 0, summary: "已撤销上一步 AI 修改" });
  }) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);

  render(<AiPanel />);
  await userEvent.type(screen.getByPlaceholderText(/对选中的 1 个组件描述修改/), "撤销刚才那步");
  await userEvent.click(screen.getByTestId("ai-edit-go"));
  await waitFor(() => expect(screen.getByTestId("ai-edit-diff")).toBeTruthy());
  expect(screen.getByText("撤销")).toBeTruthy();
  expect(screen.getByText("撤销上一步 AI 修改")).toBeTruthy();
  expect(document.querySelector(".ai-edit-target")).toBeNull();
  expect(screen.queryByText(/hero/)).toBeFalsy();
});

test("R5 session keeps edit mode without selection; sends empty component_ids", async () => {
  useDesignStore.setState({ selection: ["comp_hero"] });
  const bodies: Array<{ component_ids?: string[]; session_id?: string | null }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/llm/edit") {
      bodies.push(JSON.parse(String(init?.body || "{}")));
      return jsonResponse({
        success: true,
        edit_id: "edit_e1",
        session_id: "sess_keep",
        requested: 0,
        dropped: 0,
        summary: "AI 未提出修改建议（可换一种描述再试）",
        diffs: [],
      });
    }
    return jsonResponse({ success: true, applied: 0, skipped: 0, added: 0, summary: "ok" });
  }) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchMock);

  render(<AiPanel />);
  const go = () => screen.getByTestId("ai-edit-go");
  await userEvent.type(screen.getByPlaceholderText(/对选中的 1 个组件描述修改/), "改标题");
  await userEvent.click(go());
  await waitFor(() => expect(screen.getByText(/未提出修改建议/)).toBeTruthy());
  expect(bodies[0]).toMatchObject({ component_ids: ["comp_hero"], session_id: null });

  // 取消选中 → 会话仍在，面板保持编辑模式（可输入「撤销刚才那步」）
  useDesignStore.setState({ selection: [] });
  const input = await screen.findByPlaceholderText(/描述修改，或输入「撤销刚才那步」/);
  await userEvent.type(input, "撤销刚才那步");
  await userEvent.click(go());
  await waitFor(() => expect(bodies.length).toBe(2));
  expect(bodies[1]).toMatchObject({ component_ids: [], session_id: "sess_keep" });
});
