// client-v2/src/lib/catalog.ts
/** HTML5 拖拽：设计库组件卡片写入 dataTransfer 的自定义 MIME 类型。 */
export const LIBRARY_COMPONENT_MIME = "text/prism-library-component";

export interface LibraryEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
  type: string;
  renderable?: boolean;
  variant?: string;
  props: Record<string, unknown>;
}

export interface Catalog {
  styles: LibraryEntry[];
  components: LibraryEntry[];
  termTemplates: unknown[];
}

export async function fetchCatalog(): Promise<Catalog> {
  const res = await fetch("/api/design-library");
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  return (await res.json()) as Catalog;
}
