import { useEffect, useMemo, useState } from "react";
import { fetchCatalog, LIBRARY_COMPONENT_MIME, type LibraryEntry } from "../lib/catalog";
import { api } from "../api";

export function DesignLibrary() {
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchCatalog>> | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalog().then(setCatalog).catch((e: unknown) => setError(String(e)));
  }, []);

  const match = (e: LibraryEntry): boolean =>
    !query ||
    e.name.toLowerCase().includes(query.toLowerCase()) ||
    e.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()));

  const styles = useMemo(() => (catalog?.styles || []).filter(match), [catalog, query]);
  const components = useMemo(
    () => (catalog?.components || []).filter((c) => c.renderable !== false && match(c)),
    [catalog, query]
  );

  if (error) return <div className="lib-error">设计库加载失败：{error}</div>;
  if (!catalog) return <div className="lib-loading">加载设计库…</div>;

  return (
    <div className="design-library">
      <h3 className="panel-title">设计库</h3>
      <input
        className="tool-search"
        placeholder="搜索风格、组件…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="lib-section">
        <div className="lib-section-title">风格（{styles.length}）</div>
        {styles.map((s) => (
          <button key={s.id} className="lib-item" onClick={() => void api.applyStyle(s.id)}>
            <span className="lib-item-name">{s.name}</span>
            <span className="lib-item-desc">{s.description}</span>
          </button>
        ))}
      </div>
      <div className="lib-section">
        <div className="lib-section-title">组件（{components.length}）</div>
        {components.map((c) => (
          <button
            key={c.id}
            className="lib-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(LIBRARY_COMPONENT_MIME, c.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => void api.addLibraryComponent(c.id)}
          >
            <span className="lib-item-name">{c.name}</span>
            <span className="lib-item-desc">{c.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
