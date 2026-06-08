/** Convert an array of plain-object rows to a CSV string. The column set
 *  is derived from a fixed `columns` list rather than the row keys so the
 *  output is stable when the upstream adds optional fields.
 *
 *  Cells are stringified with JSON.stringify for objects/arrays; primitives
 *  are coerced to a string. Quotes and commas are RFC-4180 escaped. */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T & string; label?: string }[],
): string {
  const header = columns.map((c) => csvCell(c.label ?? c.key)).join(',');
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const v = r[c.key];
          if (v === null || v === undefined) return '';
          if (typeof v === 'object') return csvCell(JSON.stringify(v));
          return csvCell(String(v));
        })
        .join(','),
    )
    .join('\n');
  return `${header}\n${body}`;
}

function csvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Trigger a file download for arbitrary text content. No-op outside a
 *  browser. Caller owns the filename + content-type. */
export function downloadText(filename: string, content: string, mime: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — Safari aborts the download if we revoke
  // before the dialog has registered the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
