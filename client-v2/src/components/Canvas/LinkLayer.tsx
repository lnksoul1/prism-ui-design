import { useEffect, useState } from "react";
import { useDesignStore } from "../../stores/design";
import { addCollabPageLink, observeCollabPageLinks, readCollabPageLinks } from "../../collab/collab";
import { bezierPath } from "../../lib/linkPath";
import { DEFAULT_LINK_TRANSITION, linkTransitionLabel } from "../../lib/transitions";
import type { ComponentNode, PageLinkView } from "../../types";

interface PageLike {
  id: string;
  name: string;
  components: ComponentNode[];
}

/**
 * M3 原型连线: 连线模式下渲染 SVG 贝塞尔连线（组件右中锚点 → 目标页 chip），
 * 点选组件为源、点选 chip 为目标创建连线；M4 起点连线改为选中其源组件，
 * 由检查器「链接」区编辑转场 / 删除。
 * P3b 连线迁入 Y.Doc: 数据源为协作 Map，创建直写（本地生成 id，每源组件一条）。
 */
export function LinkLayer({ page }: { page: PageLike | undefined }) {
  const state = useDesignStore((s) => s.state);
  const pendingSource = useDesignStore((s) => s.pendingLinkSource);
  const setPendingLinkSource = useDesignStore((s) => s.setPendingLinkSource);
  const [links, setLinks] = useState<PageLinkView[]>([]);

  useEffect(() => {
    const refresh = (): void => setLinks(readCollabPageLinks());
    refresh();
    return observeCollabPageLinks(refresh);
  }, []);

  if (!page || !state) return null;

  const anchorOf = (componentId: string): { x: number; y: number } | null => {
    let found: { x: number; y: number } | null = null;
    const walk = (nodes: ComponentNode[]): void => {
      for (const n of nodes) {
        if (n.id === componentId && n.layout) {
          found = { x: n.layout.x + n.layout.w, y: n.layout.y + n.layout.h / 2 };
        }
        walk(n.children ?? []);
      }
    };
    walk(page.components);
    return found;
  };

  const pageLinks = links.filter((l) => l.from_page_id === page.id && l.source_component_id);
  const otherPages = state.pages.filter((p) => p.id !== page.id);

  return (
    <div className="link-layer">
      <svg className="link-svg" width="100%" height="100%">
        {pageLinks.map((l) => {
          const from = anchorOf(l.source_component_id!);
          if (!from) return null;
          const target = otherPages.find((p) => p.id === l.to_page_id);
          const to = { x: 1140, y: 40 + Math.max(0, otherPages.findIndex((p) => p.id === l.to_page_id)) * 48 + 24 };
          return (
            <g
              key={l.id}
              className="link-curve"
              onClick={() => {
                // M4: 选中源组件 → 检查器「链接」区可改转场 / 删除
                setPendingLinkSource(null);
                useDesignStore.setState({ selection: [l.source_component_id!] });
              }}
            >
              <path data-testid={`page-link-${l.id}`} d={bezierPath(from, to)} />
              <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6}>
                {target?.name ?? "?"} · {linkTransitionLabel(l.transition)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="page-chips">
        {otherPages.map((p) => (
          <button
            key={p.id}
            data-testid={`page-chip-${p.id}`}
            className={`page-chip ${pendingSource ? "targetable" : ""}`}
            onClick={() => {
              if (!pendingSource) return;
              // P3b: 直写协作 Map（每源组件一条，addCollabPageLink 内部先摘旧出边）
              addCollabPageLink({
                id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                from_page_id: page.id,
                to_page_id: p.id,
                source_component_id: pendingSource,
                transition: DEFAULT_LINK_TRANSITION,
              });
              setPendingLinkSource(null);
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
      {pendingSource && <div className="link-hint">已选源组件，点击右侧目标页完成连线</div>}
    </div>
  );
}
