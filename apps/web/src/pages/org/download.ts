/** Triggers a browser file download from an in-memory Blob payload. */
export function downloadBlob(filename: string, content: BlobPart, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Downloads a UTF-8 CSV string as a `.csv` file. */
export function downloadCsv(filename: string, csv: string): void {
  downloadBlob(filename, csv, 'text/csv;charset=utf-8;');
}

/** Serializes `payload` as pretty-printed JSON and downloads it. */
export function downloadJson(filename: string, payload: unknown): void {
  downloadBlob(filename, JSON.stringify(payload, null, 2), 'application/json');
}

/** Wraps a string in RFC-4180 CSV double quotes, escaping internal quotes. */
export function csvQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
