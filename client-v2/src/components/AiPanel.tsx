import { useEffect, useState } from "react";
import { applyCandidate, requestEdit, streamGenerate, applyEdit, type CandidateView, type EditPreviewView } from "../api";
import { useDesignStore } from "../stores/design";

const OP_LABEL: Record<string, string> = {
  update: "修改",
  delete: "删除",
  add: "新增",
  arrange: "重排",
  align: "对齐",
  gap: "间距",
  undo: "撤销",
  redo: "恢复",
};

export function AiPanel() {
  const [prompt, setPrompt] = useState("");
  const [streamed, setStreamed] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // R1 多候选：开启后一次生成 3 个候选（不落地），选中一个应用
  const [multiCandidate, setMultiCandidate] = useState(false);
  const [candidates, setCandidates] = useState<CandidateView[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [applying, setApplying] = useState<number | null>(null);
  // R2 精准修改：画布有选中组件时，对话改为局部修改（diff 预览 → 确认应用）
  const selection = useDesignStore((s) => s.selection);
  // R3 会话式编辑: 连续追问共享上下文；页面切换后服务端按 page_id 自动开新会话
  const [editSessionId, setEditSessionId] = useState<string | null>(null);
  // R5 会话化撤销：本轮会话存在时即使取消选中仍走编辑通道（可输入「撤销刚才那步」）
  const editMode = selection.length > 0 || editSessionId !== null;
  const [editPreview, setEditPreview] = useState<EditPreviewView | null>(null);
  const [editApplying, setEditApplying] = useState(false);
  const currentPageId = useDesignStore((s) => s.state?.currentPageId ?? null);

  // 选中集变化后，旧 diff 可能已失效 → 丢弃预览
  useEffect(() => {
    setEditPreview(null);
  }, [selection]);
  // 页面切换 → 丢弃会话（服务端亦有 page_id 兜底）
  useEffect(() => {
    setEditSessionId(null);
  }, [currentPageId]);

  const submit = async (): Promise<void> => {
    if (editMode) await doEdit();
    else await generate();
  };

  const generate = async (): Promise<void> => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setStreamed("");
    setStatus(null);
    setCandidates([]);
    setBatchId(null);
    try {
      const done = (await streamGenerate(
        prompt,
        (text) => setStreamed((prev) => prev + text),
        multiCandidate
          ? {
              candidates: 3,
              onCandidateStart: () => setStreamed((prev) => (prev ? prev + "\n" : prev)),
              onCandidateDone: (c) => setCandidates((prev) => [...prev, c]),
            }
          : undefined
      )) as { summary?: string; error?: string; batch_id?: string } | null;
      if (done && typeof done.batch_id === "string") {
        setBatchId(done.batch_id);
      }
      if (done && typeof done.summary === "string") {
        setStatus(done.summary);
      } else if (done && typeof done.error === "string") {
        setStatus(done.error);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "生成失败");
    } finally {
      setBusy(false);
    }
  };

  const apply = async (index: number): Promise<void> => {
    if (!batchId || applying !== null) return;
    setApplying(index);
    try {
      const result = (await applyCandidate(batchId, index)) as { summary?: string; error?: string };
      setCandidates([]);
      setBatchId(null);
      setStreamed("");
      if (result && typeof result.summary === "string") {
        setStatus(result.summary);
      } else if (result && typeof result.error === "string") {
        setStatus(result.error);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "应用候选失败");
    } finally {
      setApplying(null);
    }
  };

  const doEdit = async (): Promise<void> => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setStatus(null);
    setEditPreview(null);
    try {
      const preview = await requestEdit({ prompt, component_ids: selection, session_id: editSessionId });
      if (preview && typeof preview.session_id === "string") {
        setEditSessionId(preview.session_id);
      }
      if (preview && Array.isArray(preview.diffs) && preview.diffs.length > 0) {
        setEditPreview(preview);
      } else if (preview && typeof preview.summary === "string") {
        setStatus(preview.summary);
      } else if (preview && typeof preview.error === "string") {
        setStatus(preview.error);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "修改建议生成失败");
    } finally {
      setBusy(false);
    }
  };

  const confirmEdit = async (): Promise<void> => {
    if (!editPreview || editApplying) return;
    setEditApplying(true);
    try {
      const result = await applyEdit(editPreview.edit_id);
      setEditPreview(null);
      setPrompt("");
      if (result && typeof result.summary === "string") setStatus(result.summary);
      else if (result && typeof result.error === "string") setStatus(result.error);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "应用修改失败");
    } finally {
      setEditApplying(false);
    }
  };

  return (
    <div className="ai-panel">
      <div className="ai-input-row">
        <input
          className="ai-input"
          placeholder={
            editMode
              ? selection.length > 0
                ? `对选中的 ${selection.length} 个组件描述修改，例如：把标题换成「限时优惠」`
                : "描述修改，或输入「撤销刚才那步」"
              : "描述你想要的页面，例如：做一个 SaaS 落地页"
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
        />
        <button
          className="ai-go"
          data-testid={editMode ? "ai-edit-go" : "ai-go"}
          disabled={busy || !prompt.trim()}
          onClick={() => void submit()}
        >
          {busy ? (editMode ? "分析中…" : "生成中…") : editMode ? "修改" : "生成"}
        </button>
      </div>
      {!editMode && (
        <label className="ai-multi-toggle">
          <input
            type="checkbox"
            data-testid="ai-multi-candidate"
            checked={multiCandidate}
            onChange={(e) => setMultiCandidate(e.target.checked)}
          />
          多候选（生成 3 版供挑选）
        </label>
      )}
      {(streamed || status || candidates.length > 0 || editPreview) && (
        <div className="ai-output">
          {streamed && (
            <pre data-testid="ai-stream-preview" className="ai-stream">{streamed.slice(-400)}</pre>
          )}
          {editPreview && (
            <div className="ai-edit" data-testid="ai-edit-diff">
              <div className="ai-edit-head">
                <span className="ai-edit-title">AI 修改建议（{editPreview.diffs.length} 处）</span>
                <div className="ai-edit-actions">
                  <button
                    className="ai-edit-apply"
                    data-testid="ai-edit-apply"
                    disabled={editApplying}
                    onClick={() => void confirmEdit()}
                  >
                    {editApplying ? "应用中…" : "应用"}
                  </button>
                  <button
                    className="ai-edit-discard"
                    data-testid="ai-edit-discard"
                    onClick={() => setEditPreview(null)}
                  >
                    放弃
                  </button>
                </div>
              </div>
              {editPreview.diffs.map((d, i) => (
                <div key={i} className={`ai-edit-op ai-edit-op-${d.op}`} data-testid={`ai-edit-op-${i}`}>
                  <div className="ai-edit-op-head">
                    <span className={`ai-edit-kind ai-edit-kind-${d.op}`}>{OP_LABEL[d.op] || d.op}</span>
                    {(d.component_type || d.title) && (
                      <span className="ai-edit-target">{d.component_type}{d.title ? ` · ${d.title}` : ""}</span>
                    )}
                    {d.reason && <span className="ai-edit-reason">{d.reason}</span>}
                  </div>
                  {d.changes.map((c) => (
                    <div key={c.field} className="ai-edit-change">
                      <span className="ai-edit-field">{c.field}</span>
                      <span className="ai-edit-before">{c.before}</span>
                      <span className="ai-edit-arrow">→</span>
                      <span className="ai-edit-after">{c.after}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {candidates.length > 0 && (
            <div className="ai-candidates" data-testid="ai-candidates">
              {candidates.map((c) => (
                <div
                  key={c.index}
                  className={c.ok ? "ai-candidate" : "ai-candidate ai-candidate-failed"}
                  data-testid={`ai-candidate-${c.index}`}
                >
                  <div className="ai-candidate-head">
                    <span className="ai-candidate-label">{c.label}</span>
                    <span className="ai-candidate-meta">
                      {c.ok ? `${c.component_count} 个组件` : (c.error || "生成失败")}
                    </span>
                  </div>
                  {c.preview && c.preview.length > 0 && (
                    <div className="ai-candidate-preview">
                      {c.preview.map((p, i) => (
                        <span key={i} className="ai-candidate-chip">{p.title || p.type}</span>
                      ))}
                    </div>
                  )}
                  <button
                    className="ai-candidate-apply"
                    data-testid={`ai-apply-${c.index}`}
                    disabled={!c.ok || applying !== null}
                    onClick={() => void apply(c.index)}
                  >
                    {applying === c.index ? "应用中…" : "应用此版本"}
                  </button>
                </div>
              ))}
            </div>
          )}
          {status && <div className="ai-status">{status}</div>}
        </div>
      )}
    </div>
  );
}
