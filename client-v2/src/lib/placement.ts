// client-v2/src/lib/placement.ts — 新增组件的布局落点
import { collabMaps } from "../collab/collab";
import { editComponent } from "../collab/edits";
import { useDesignStore } from "../stores/design";
import type { ComponentNode } from "../types";

/**
 * 轮询等待服务端新增的组件经 /ws → observer 投影进本地 ydoc。
 * editComponent 要求条目已存在（服务端 addComponent 响应先于广播到达），
 * 每 50ms 轮询一次，最长 ~3s。
 */
export function waitForComponent(id: string, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      if (collabMaps()?.components.get(id)) {
        resolve();
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        reject(new Error(`组件未出现在协同文档中: ${id}`));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * 点击添加（设计库卡片/chip）无落点信息：在当前页根组件下方错落放置——
 * y = max(layout.y + (layout.h ?? 80)) + 24，无任何布局时回退 16。
 */
export async function placeNewComponent(componentId: string): Promise<void> {
  await waitForComponent(componentId);
  const s = useDesignStore.getState().state;
  const page = s?.pages?.find((p) => p.id === s.currentPageId) ?? s?.pages?.[0];
  const roots: ComponentNode[] = page?.components ?? [];
  let maxBottom: number | null = null;
  for (const c of roots) {
    if (!c.layout) continue;
    const bottom = (c.layout.y ?? 0) + (c.layout.h ?? 80);
    if (maxBottom === null || bottom > maxBottom) maxBottom = bottom;
  }
  const nextY = maxBottom === null ? 16 : maxBottom + 24;
  editComponent(componentId, (draft) => {
    const layout = (draft.layout as Record<string, number> | undefined) ?? {};
    draft.layout = { ...layout, x: 16, y: nextY, w: 320, h: 80 };
  });
}
