import { useState } from "react";
import { applyCandidate, streamGenerate, type CandidateView } from "../api";

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

  return (
    <div className="ai-panel">
      <div className="ai-input-row">
        <input
          className="ai-input"
          placeholder="描述你想要的页面，例如：做一个 SaaS 落地页"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void generate(); }}
        />
        <button className="ai-go" disabled={busy || !prompt.trim()} onClick={() => void generate()}>
          {busy ? "生成中…" : "生成"}
        </button>
      </div>
      <label className="ai-multi-toggle">
        <input
          type="checkbox"
          data-testid="ai-multi-candidate"
          checked={multiCandidate}
          onChange={(e) => setMultiCandidate(e.target.checked)}
        />
        多候选（生成 3 版供挑选）
      </label>
      {(streamed || status || candidates.length > 0) && (
        <div className="ai-output">
          {streamed && (
            <pre data-testid="ai-stream-preview" className="ai-stream">{streamed.slice(-400)}</pre>
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
