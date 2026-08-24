import { useState } from "react";
import { streamGenerate } from "../api";

export function AiPanel() {
  const [prompt, setPrompt] = useState("");
  const [streamed, setStreamed] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async (): Promise<void> => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setStreamed("");
    setStatus(null);
    try {
      const done = await streamGenerate(prompt, (text) => setStreamed((prev) => prev + text));
      const result = done as { summary?: string; error?: string } | null;
      if (result && typeof result.summary === "string") {
        setStatus(result.summary);
      } else if (result && typeof result.error === "string") {
        setStatus(result.error);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "生成失败");
    } finally {
      setBusy(false);
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
      {(streamed || status) && (
        <div className="ai-output">
          {streamed && (
            <pre data-testid="ai-stream-preview" className="ai-stream">{streamed.slice(-400)}</pre>
          )}
          {status && <div className="ai-status">{status}</div>}
        </div>
      )}
    </div>
  );
}
