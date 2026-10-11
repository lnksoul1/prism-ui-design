/**
 * R3 会话式编辑: 精准修改的多轮对话上下文。
 *
 * 每个会话绑定一个页面（page_id）；用户切页后调用方按 page_id 比对，不匹配
 * 即开新会话（旧会话等 TTL 过期）。历史只保留 user/assistant 轮次——system
 * prompt 每轮重建（选中组件的当前值每轮注入，不依赖历史快照），因此指代
 * （「再大一点」「换回刚才的文案」）由 LLM 结合历史与最新选中态消解。
 */
import type { ChatMessage } from "./providers.js";

export interface EditSession {
  id: string;
  page_id: string;
  created_at: number;
  updated_at: number;
  messages: ChatMessage[];
}

const TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 20;
/** 每会话保留的最大消息数（user+assistant 合计，超出裁掉最旧）。 */
export const MAX_SESSION_MESSAGES = 12;

const sessions = new Map<string, EditSession>();

function prune(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.updated_at > TTL_MS) sessions.delete(id);
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}

export function createEditSession(pageId: string): EditSession {
  prune();
  const s: EditSession = {
    id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    page_id: pageId,
    created_at: Date.now(),
    updated_at: Date.now(),
    messages: [],
  };
  sessions.set(s.id, s);
  return s;
}

export function getEditSession(id: string | undefined | null): EditSession | null {
  if (!id) return null;
  prune();
  return sessions.get(id) || null;
}

/** 追加一轮 user/assistant（裁剪到 MAX_SESSION_MESSAGES，touch updated_at）。 */
export function appendTurn(session: EditSession, user: string, assistant: string): void {
  session.messages.push({ role: "user", content: user }, { role: "assistant", content: assistant });
  if (session.messages.length > MAX_SESSION_MESSAGES) {
    session.messages = session.messages.slice(-MAX_SESSION_MESSAGES);
  }
  session.updated_at = Date.now();
}

/** 测试支持: 清空会话。 */
export function clearEditSessionsForTests(): void {
  sessions.clear();
}
