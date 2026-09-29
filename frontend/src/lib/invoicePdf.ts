// Invoice PDFs are named <car number>_<date>, e.g. HR06AB1234_30-09-2026.pdf,
// so a folder of downloaded invoices sorts and reads by vehicle.
export function invoiceFileName(registrationNumber: string, invoiceDate: string): string {
  const d = new Date(invoiceDate);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const reg = registrationNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `${reg}_${dd}-${mm}-${d.getFullYear()}`;
}

// Renders the on-screen invoice itself into an A4 PDF and downloads it, so
// the PDF always matches what the invoice page shows. The library is loaded
// only when a download is actually requested — it's browser-only and large.
export async function downloadElementAsPdf(element: HTMLElement, fileName: string): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;
  await html2pdf()
    .set({
      margin: 10,
      filename: `${fileName}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(element)
    .save();
}
