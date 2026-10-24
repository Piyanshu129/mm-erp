import { excelFile, ExcelSheet } from "@/lib/excel";

// One-click "Share on WhatsApp" for a report. On a phone (or any browser
// that can share files) the system share sheet opens with the Excel file
// and a summary — pick WhatsApp and the chat. Elsewhere WhatsApp opens with
// the summary text ready to send (attach the Excel download if needed).
export async function shareReport(opts: { fileName: string; sheets: ExcelSheet[]; text: string }): Promise<"shared" | "whatsapp" | "cancelled"> {
  try {
    const file = await excelFile(opts.fileName, opts.sheets);
    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: opts.text, title: file.name });
      return "shared";
    }
  } catch (err) {
    // The person closed the share sheet.
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(opts.text)}`, "_blank", "noopener");
  return "whatsapp";
}
