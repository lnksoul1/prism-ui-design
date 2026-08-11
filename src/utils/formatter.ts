// ===== Output Formatting Helpers =====

export function formatCssVariables(vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(
    ([key, value]) => `  --${key}: ${value};`
  );
  return `:root {\n${lines.join("\n")}\n}`;
}

export function truncateIfNeeded(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return (
    text.slice(0, limit - 200) +
    "\n\n... [Response truncated. Use more specific parameters to reduce output size.]"
  );
}

export function markdownTable(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map((row) => `| ${row.join(" | ")} |`);
  return [headerLine, separator, ...rowLines].join("\n");
}
