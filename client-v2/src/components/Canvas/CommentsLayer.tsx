import { useState } from "react";
import { useDesignStore } from "../../stores/design";
import { api } from "../../api";
import type { ComponentNode, CommentView } from "../../types";

interface PageLike {
  id: string;
  name: string;
  components: ComponentNode[];
}

/** M3 打点评论: 未解决评论渲染为组件上的 pin（◈），点击弹出处理气泡。 */
export function CommentsLayer({ page }: { page: PageLike | undefined }) {
  const state = useDesignStore((s) => s.state);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!page) return null;

  const comments = (state?.comments ?? []).filter((c) => !c.resolved && isOn(page, c));
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
                  <button onClick={() => void api.updateComment(c.id, { resolved: true })}>解决</button>
                  <button
                    onClick={() => {
                      const assignee = prompt("指派给：");
                      if (assignee) void api.updateComment(c.id, { assignee });
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
