/**
 * R1 多候选: 候选 spec 的服务端内存暂存。
 *
 * streamCandidateBatch 生成 N 个候选 spec（不落地 stateStore）→ 客户端展示
 * 候选卡片 → 用户选中一个经 POST /api/llm/apply 消费（成功应用后整批丢弃，
 * 其余候选即被丢弃）；未被选中的批次 10 分钟后过期清理。
 */
import type { PageSpec } from "./agent.js";

export interface CandidateBatch {
  id: string;
  created_at: number;
  prompt: string;
  specs: Array<PageSpec | null>;
}

const TTL_MS = 10 * 60 * 1000;
const MAX_BATCHES = 20;
const batches = new Map<string, CandidateBatch>();

function prune(): void {
  const now = Date.now();
  for (const [id, b] of batches) {
    if (now - b.created_at > TTL_MS) batches.delete(id);
  }
  while (batches.size > MAX_BATCHES) {
    const oldest = batches.keys().next().value;
    if (oldest === undefined) break;
    batches.delete(oldest);
  }
}

export function createCandidateBatch(prompt: string, specs: Array<PageSpec | null>): CandidateBatch {
  prune();
  const batch: CandidateBatch = {
    id: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: Date.now(),
    prompt,
    specs,
  };
  batches.set(batch.id, batch);
  return batch;
}

export function getCandidateBatch(id: string): CandidateBatch | null {
  prune();
  const b = batches.get(id);
  return b && Date.now() - b.created_at <= TTL_MS ? b : null;
}

/** 取出候选: "missing" = 批次不存在/过期；"invalid" = 该候选未成功生成。 */
export function takeCandidateSpec(
  batchId: string,
  index: number
): PageSpec | "missing" | "invalid" {
  const b = getCandidateBatch(batchId);
  if (!b) return "missing";
  const spec = b.specs[index];
  if (!spec) return "invalid";
  batches.delete(batchId);
  return spec;
}

/** 测试支持: 清空暂存批次。 */
export function clearCandidateBatchesForTests(): void {
  batches.clear();
}
