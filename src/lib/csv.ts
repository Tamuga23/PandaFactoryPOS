/**
 * P2.7: export CSV simple (abre directo en Excel, con BOM UTF-8 para tildes).
 */

function escapeCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** rows = array de objetos; headers = [claveInterna, EtiquetaVisible][] en orden. */
export function toCsv(rows: Record<string, unknown>[], headers: [string, string][]): string {
  const head = headers.map(([, label]) => escapeCell(label)).join(',');
  const body = rows
    .map(r => headers.map(([key]) => escapeCell(r[key])).join(','))
    .join('\n');
  return `${head}\n${body}`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
