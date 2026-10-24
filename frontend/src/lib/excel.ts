// Downloads data as a real Excel workbook (.xlsx), one sheet per entry.
// ExcelJS is loaded only when an export is actually clicked — it's large.

export interface ExcelSheet {
  name: string;
  // Column headers in order; each row is keyed by these headers.
  columns: string[];
  rows: Record<string, unknown>[];
}

// The workbook as a file (for downloading or sharing).
export async function excelFile(fileName: string, sheets: ExcelSheet[]): Promise<File> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Motors Mitra ERP";
  workbook.created = new Date();

  for (const sheet of sheets) {
    // Excel sheet names: max 31 chars, none of : \ / ? * [ ]
    const ws = workbook.addWorksheet(sheet.name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31));
    ws.columns = sheet.columns.map((header) => ({
      header,
      key: header,
      width: Math.min(40, Math.max(10, header.length + 2, ...sheet.rows.map((r) => String(r[header] ?? "").length + 2))),
    }));
    ws.getRow(1).font = { bold: true };
    ws.addRows(sheet.rows.map((r) => Object.fromEntries(sheet.columns.map((c) => [c, r[c] ?? ""]))));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function downloadExcel(fileName: string, sheets: ExcelSheet[]): Promise<void> {
  const file = await excelFile(fileName, sheets);
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// A list of plain objects (e.g. a report table) as a one-sheet workbook,
// with headers taken from the first row's keys.
export async function downloadRowsAsExcel(fileName: string, sheetName: string, rows: Record<string, unknown>[]) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  await downloadExcel(fileName, [{ name: sheetName, columns, rows }]);
}
