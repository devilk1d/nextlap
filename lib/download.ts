type Cell = string | number | boolean | null | undefined;

const escapeCell = (value: Cell) => {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (rows: Cell[][]) =>
  rows.map((row) => row.map(escapeCell).join(",")).join("\n");

/** Triggers a browser download for `blob`. */
export function downloadBlob(filename: string, blob: Blob) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 500);
}

export const downloadCsv = (filename: string, rows: Cell[][]) =>
  downloadBlob(filename, new Blob([toCsv(rows)], { type: "text/csv" }));
