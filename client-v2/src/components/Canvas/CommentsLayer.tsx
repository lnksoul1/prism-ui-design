import { useEffect, useState } from "react";
import { observeCollabComments, readCollabComments, upsertCollabComment } from "../../collab/collab";
import type { ComponentNode, CommentView } from "../../types";

interface PageLike {
  id: string;
  name: string;
  components: ComponentNode[];
}

/**
 * M3 打点评论: 未解决评论渲染为组件上的 pin（◈），点击弹出处理气泡。
 * P3a 评论迁入 Y.Doc: 数据源为协作 Map（近端写即时渲染、远端写经广播同步），
 * 服务端 REST 保留给 MCP/AI 路径并经 reconcile 汇入同一 Map。
 */
export function CommentsLayer({ page }: { page: PageLike | undefined }) {
  const [all, setAll] = useState<CommentView[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = (): void => setAll(readCollabComments());
    refresh();
    return observeCollabComments(refresh);
  }, []);

  if (!page) return null;

  const comments = all.filter((c) => !c.resolved && isOn(page, c));
  if (comments.length === 0) return null;

  const rectOf = (componentId: string): { x: number; y: number } | null => {
    let found: { x: number; y: number } | null = null;
    const walk = (nodes: ComponentNode[]): void => {
      for (const n of nodes) {
        if (n.id === componentId && n.layout) found = { x: n.layout.x, y: n.layout.y };
        walk(n.children ?? []);
      }
    };
    walk(page.components);
    return found;
  };

  const patch = (c: CommentView, p: Partial<CommentView>): void => {
    upsertCollabComment({ ...c, ...p, updatedAt: new Date().toISOString() });
    setOpenId(null);
  };

  return (
    <div className="comments-layer">
      {comments.map((c) => {
        const rect = rectOf(c.component_id);
        if (!rect) return null;
        const left = rect.x + (c.x ?? 8);
        const top = rect.y + (c.y ?? 8);
        return (
          <div
            key={c.id}
            data-testid={`comment-pin-${c.id}`}
            className="comment-anchor"
            style={{ left, top }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setOpenId(openId === c.id ? null : c.id)}
          >
            <button className="comment-pin">◈</button>
            {openId === c.id && (
              <div className="comment-popover">
                <div className="comment-meta">
                  <b>{c.author}</b>
                  {c.assignee ? <span> → {c.assignee}</span> : null}
                </div>
                <div className="comment-text">{c.text}</div>
                <div className="comment-actions">
                  <button onClick={() => patch(c, { resolved: true })}>解决</button>
                  <button
                    onClick={() => {
                      const assignee = prompt("指派给：");
                      if (assignee) patch(c, { assignee });
                    }}
                  >
                    指派
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function isOn(page: PageLike, c: CommentView): boolean {
  let found = false;
  const walk = (nodes: ComponentNode[]): void => {
    for (const n of nodes) {
      if (n.id === c.component_id) found = true;
      walk(n.children ?? []);
    }
  };
  walk(page.components);
  return found;
}
