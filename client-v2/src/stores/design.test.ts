import { test, describe, beforeEach, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDesignStore } from "./design";

describe("designStore", () => {
  beforeEach(() => {
    useDesignStore.setState({
      state: null, selection: [], breakpoint: "desktop",
      playMode: false, previewPageId: null, previewTransition: null,
    });
  });

  test("applyServerState replaces state and resets revision tracking", () => {
    const { result } = renderHook(() => useDesignStore());
    act(() => {
      result.current.applyServerState({
        projectName: "P", style: "minimal", tokens: {},
        components: [], pages: [], currentPageId: null, comments: [], pageLinks: [], revision: 3,
      });
    });
    expect(useDesignStore.getState().state?.revision).toBe(3);
  });

  test("selection helpers", () => {
    const { result } = renderHook(() => useDesignStore());
    act(() => result.current.select("a"));
    act(() => result.current.select("b"));
    expect(useDesignStore.getState().selection).toEqual(["a", "b"]);
    act(() => result.current.deselect("a"));
    expect(useDesignStore.getState().selection).toEqual(["b"]);
    act(() => result.current.clearSelection());
    expect(useDesignStore.getState().selection).toEqual([]);
  });

  test("setBreakpoint guards invalid values", () => {
    const { result } = renderHook(() => useDesignStore());
    act(() => result.current.setBreakpoint("mobile"));
    expect(useDesignStore.getState().breakpoint).toBe("mobile");
    act(() => result.current.setBreakpoint("watch" as never));
    expect(useDesignStore.getState().breakpoint).toBe("mobile");
  });

  test("setPreviewPage records the transition and defaults to fade", () => {
    const { result } = renderHook(() => useDesignStore());
    act(() => result.current.setPreviewPage("page-2", "slide-left"));
    expect(useDesignStore.getState().previewPageId).toBe("page-2");
    expect(useDesignStore.getState().previewTransition).toBe("slide-left");
    act(() => result.current.setPreviewPage("page-1"));
    expect(useDesignStore.getState().previewPageId).toBe("page-1");
    expect(useDesignStore.getState().previewTransition).toBe("fade");
  });

  test("exiting play mode clears preview page and transition", () => {
    const { result } = renderHook(() => useDesignStore());
    act(() => result.current.setPlayMode(true));
    act(() => result.current.setPreviewPage("page-2", "expand"));
    expect(useDesignStore.getState().previewTransition).toBe("expand");
    act(() => result.current.setPlayMode(false));
    expect(useDesignStore.getState().previewPageId).toBeNull();
    expect(useDesignStore.getState().previewTransition).toBeNull();
  });
});
