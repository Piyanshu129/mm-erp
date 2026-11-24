import ExcelJS from "exceljs";
import JSZip from "jszip";
import { dailySeriesThisMonth, monthlySeriesSinceStart, periodFigures } from "../modules/reports/reports.service";

// The first two tabs of the Excel export: "Summary" (the app dashboard's
// figures for today, this month and this financial year, plus each day of
// this month) and "Dashboard" (one row per month with a bar chart).
// Profit = bills − purchases, the same as the dashboard graph in the app.

export const DASHBOARD_SHEET = "Dashboard";

const MONEY = '"₹"#,##0.00;[Red]-"₹"#,##0.00';
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD1D5DB" } },
  bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
  left: { style: "thin", color: { argb: "FFD1D5DB" } },
  right: { style: "thin", color: { argb: "FFD1D5DB" } },
};

function headerRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = THIN;
  });
}

function boxed(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.border = THIN;
  });
}

function fyLabel(now: Date): string {
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export async function addSummarySheets(workbook: ExcelJS.Workbook, now = new Date()): Promise<{ months: number }> {
  const [today, month, fy, days, months] = await Promise.all([
    periodFigures("today", now),
    periodFigures("month", now),
    periodFigures("fy", now),
    dailySeriesThisMonth(now),
    monthlySeriesSinceStart(now),
  ]);

  // ---- Summary ----
  const ws = workbook.addWorksheet("Summary");
  ws.columns = [{ width: 38 }, { width: 18 }, { width: 18 }, { width: 22 }, { width: 16 }];
  ws.addRow(["Motors Mitra — Summary"]).font = { bold: true, size: 14 };
  ws.addRow([`Updated ${now.toLocaleString("en-IN")}`]).font = { italic: true, color: { argb: "FF6B7280" } };
  ws.addRow([]);

  const monthName = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  headerRow(ws.addRow(["", "Today", monthName, fyLabel(now)]));
  const figure = (label: string, pick: (f: typeof today) => number, money = false) => {
    const row = ws.addRow([label, pick(today), pick(month), pick(fy)]);
    boxed(row);
    if (money) for (const c of [2, 3, 4]) row.getCell(c).numFmt = MONEY;
    return row;
  };
  figure("Vehicles in (job cards opened)", (f) => f.vehicles);
  figure("Job cards cancelled", (f) => f.cancelled);
  figure("Estimates made", (f) => f.estimatesCount);
  figure("Estimates approved", (f) => f.estimatesApproved);
  figure("Estimate value", (f) => f.estimatesValue, true);
  figure("Purchases (stock + expenses)", (f) => f.purchases, true);
  figure("   of which stock purchases", (f) => f.inventoryPurchases, true);
  figure("   of which expenses", (f) => f.expenses, true);
  figure("Bills (sales)", (f) => f.sales, true);
  figure("Profit (bills − purchases)", (f) => f.profit, true).font = { bold: true };

  ws.addRow([]);
  headerRow(ws.addRow(["Right now", "Count"]));
  boxed(ws.addRow(["Open job cards", today.openJobCards]));
  boxed(ws.addRow(["Items low on stock", today.lowStock]));
  boxed(ws.addRow(["Items out of stock", today.outOfStock]));

  ws.addRow([]);
  ws.addRow([`Day by day — ${monthName}`]).font = { bold: true, size: 12 };
  headerRow(ws.addRow(["Date", "Purchase", "Estimates", "Bills (sales)", "Profit"]));
  for (const d of days) {
    const row = ws.addRow([
      new Date(`${d.key}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
      d.purchases,
      d.estimates,
      d.sales,
      d.profit,
    ]);
    boxed(row);
    for (const c of [2, 3, 4, 5]) row.getCell(c).numFmt = MONEY;
  }
  const sum = (rows: typeof days, f: (r: (typeof days)[number]) => number) =>
    Math.round(rows.reduce((t, r) => t + f(r), 0) * 100) / 100;
  const dayTotal = ws.addRow([
    "Total",
    sum(days, (r) => r.purchases),
    sum(days, (r) => r.estimates),
    sum(days, (r) => r.sales),
    sum(days, (r) => r.profit),
  ]);
  dayTotal.font = { bold: true };
  boxed(dayTotal);
  for (const c of [2, 3, 4, 5]) dayTotal.getCell(c).numFmt = MONEY;

  // ---- Dashboard: Sr. No. | Month | Purchase | Estimates | Profit ----
  const dash = workbook.addWorksheet(DASHBOARD_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  dash.columns = [{ width: 8 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }];
  headerRow(dash.addRow(["Sr. No.", "Month", "Purchase", "Estimates", "Profit"]));
  months.forEach((m, i) => {
    const row = dash.addRow([i + 1, m.label, m.purchases, m.estimates, m.profit]);
    boxed(row);
    for (const c of [3, 4, 5]) row.getCell(c).numFmt = MONEY;
  });
  const total = dash.addRow([
    "",
    "Total",
    sum(months, (r) => r.purchases),
    sum(months, (r) => r.estimates),
    sum(months, (r) => r.profit),
  ]);
  total.font = { bold: true };
  boxed(total);
  for (const c of [3, 4, 5]) total.getCell(c).numFmt = MONEY;
  const note = dash.addRow([]);
  note.getCell(1).value = "Profit = bills (sales) − purchases, the same as the dashboard graph in the app.";
  note.getCell(1).font = { italic: true, color: { argb: "FF6B7280" } };

  return { months: months.length };
}

// ---- The bar chart ------------------------------------------------------------
// ExcelJS can't write charts, so the chart is added to the finished file:
// a chart part, a drawing that places it, and the links between them.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function chartXml(sheet: string, rows: number, labels: string[], series: { col: string; name: string; color: string; values: number[] }[]) {
  const last = rows + 1;
  const strCache = (vals: string[]) =>
    `<c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join("")}</c:strCache>`;
  const numCache = (vals: number[]) =>
    `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals
      .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
      .join("")}</c:numCache>`;
  const ser = series
    .map(
      (s, i) =>
        `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>` +
        `<c:tx><c:strRef><c:f>${sheet}!$${s.col}$1</c:f>${strCache([s.name])}</c:strRef></c:tx>` +
        `<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill></c:spPr>` +
        `<c:invertIfNegative val="0"/>` +
        `<c:cat><c:strRef><c:f>${sheet}!$B$2:$B$${last}</c:f>${strCache(labels)}</c:strRef></c:cat>` +
        `<c:val><c:numRef><c:f>${sheet}!$${s.col}$2:$${s.col}$${last}</c:f>${numCache(s.values)}</c:numRef></c:val>` +
        `</c:ser>`
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<c:roundedCorners val="0"/>` +
    `<c:chart>` +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="en-IN" sz="1400" b="1"/><a:t>Purchase, estimates and profit by month</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
    `<c:autoTitleDeleted val="0"/>` +
    `<c:plotArea><c:layout/>` +
    `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}` +
    `<c:gapWidth val="80"/><c:axId val="50010001"/><c:axId val="50010002"/></c:barChart>` +
    `<c:catAx><c:axId val="50010001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>` +
    `<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>` +
    `<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>` +
    `<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>` +
    `<c:numFmt formatCode="&quot;₹&quot;#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:crossAx val="50010001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>` +
    `</c:plotArea>` +
    `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>` +
    `</c:chart></c:chartSpace>`
  );
}

const DRAWING_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
  `<xdr:twoCellAnchor>` +
  `<xdr:from><xdr:col>6</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
  `<xdr:to><xdr:col>18</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>22</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
  `<xdr:graphicFrame macro="">` +
  `<xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Monthly chart"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
  `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
  `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
  `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>` +
  `</a:graphicData></a:graphic>` +
  `</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;

const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const RELS_HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;

// Reads the Dashboard sheet's own rows back from the workbook, so the chart's
// cached values match the cells exactly.
export async function addDashboardChart(buffer: Buffer, workbook: ExcelJS.Workbook, months: number): Promise<Buffer> {
  if (months === 0) return buffer;
  const dash = workbook.getWorksheet(DASHBOARD_SHEET);
  if (!dash) return buffer;
  const labels: string[] = [];
  const cols: Record<"C" | "D" | "E", number[]> = { C: [], D: [], E: [] };
  for (let r = 2; r <= months + 1; r++) {
    const row = dash.getRow(r);
    labels.push(String(row.getCell(2).value ?? ""));
    cols.C.push(Number(row.getCell(3).value ?? 0));
    cols.D.push(Number(row.getCell(4).value ?? 0));
    cols.E.push(Number(row.getCell(5).value ?? 0));
  }

  const zip = await JSZip.loadAsync(buffer);
  // Find the Dashboard sheet's file through the workbook's links.
  const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
  const sheetTag = workbookXml.match(new RegExp(`<sheet [^>]*name="${DASHBOARD_SHEET}"[^>]*/>`));
  const relId = sheetTag?.[0].match(/r:id="([^"]+)"/)?.[1];
  const workbookRels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const target = relId ? workbookRels.match(new RegExp(`<Relationship [^>]*Id="${relId}"[^>]*/>`))?.[0].match(/Target="([^"]+)"/)?.[1] : null;
  if (!target) return buffer;
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const sheetName = sheetPath.split("/").pop()!;
  const sheetRelsPath = sheetPath.replace(sheetName, `_rels/${sheetName}.rels`);

  zip.file(
    "xl/charts/chart1.xml",
    chartXml(DASHBOARD_SHEET, months, labels, [
      { col: "C", name: "Purchase", color: "EB6834", values: cols.C },
      { col: "D", name: "Estimates", color: "6250D6", values: cols.D },
      { col: "E", name: "Profit", color: "2A78D6", values: cols.E },
    ])
  );
  zip.file("xl/drawings/drawing1.xml", DRAWING_XML);
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `${RELS_HEAD}<Relationship Id="rId1" Type="${REL_NS}/chart" Target="../charts/chart1.xml"/></Relationships>`
  );

  const drawingRel = `<Relationship Id="rIdMmChart" Type="${REL_NS}/drawing" Target="../drawings/drawing1.xml"/>`;
  const existingRels = await zip.file(sheetRelsPath)?.async("string");
  zip.file(sheetRelsPath, existingRels ? existingRels.replace("</Relationships>", `${drawingRel}</Relationships>`) : `${RELS_HEAD}${drawingRel}</Relationships>`);

  let sheetXml = await zip.file(sheetPath)!.async("string");
  if (!/<worksheet[^>]*xmlns:r=/.test(sheetXml)) sheetXml = sheetXml.replace("<worksheet ", `<worksheet xmlns:r="${REL_NS}" `);
  // <drawing> goes after the page settings and before these, by the file format's order.
  const before = ["<legacyDrawing", "<legacyDrawingHF", "<picture", "<oleObjects", "<controls", "<webPublishItems", "<tableParts", "<extLst", "</worksheet>"];
  const at = Math.min(...before.map((t) => sheetXml.indexOf(t)).filter((i) => i >= 0));
  sheetXml = `${sheetXml.slice(0, at)}<drawing r:id="rIdMmChart"/>${sheetXml.slice(at)}`;
  zip.file(sheetPath, sheetXml);

  const types = await zip.file("[Content_Types].xml")!.async("string");
  zip.file(
    "[Content_Types].xml",
    types.replace(
      "</Types>",
      `<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` +
        `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`
    )
  );

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
