// ===== Output Formatting Helpers =====

export function formatCssVariables(vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(
    ([key, value]) => `  --${key}: ${value};`
  );
  return `:root {\n${lines.join("\n")}\n}`;
}

export function markdownTable(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map((row) => `| ${row.join(" | ")} |`);
  return [headerLine, separator, ...rowLines].join("\n");
}
