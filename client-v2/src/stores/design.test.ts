import { test, describe, beforeEach, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDesignStore } from "./design";

describe("designStore", () => {
  beforeEach(() => {
    useDesignStore.setState({ state: null, selection: [], breakpoint: "desktop" });
  });

  test("applyServerState replaces state and resets revision tracking", () => {
    const { result } = renderHook(() => useDesignStore());
    act(() => {
      result.current.applyServerState({
        projectName: "P", style: "minimal", tokens: {},
        components: [], pages: [], currentPageId: null, comments: [], revision: 3,
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
});
