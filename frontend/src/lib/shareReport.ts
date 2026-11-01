import { excelFile, ExcelSheet } from "@/lib/excel";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function canShareFiles(): boolean {
  try {
    return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [new File([""], "check.xlsx", { type: XLSX })] });
  } catch {
    return false;
  }
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// One-click "Share on WhatsApp" for a file (a report's Excel). On a phone
// (or any browser that can share files) the system share sheet opens with
// the file and a summary — pick WhatsApp and the chat. On a computer the
// file downloads and WhatsApp opens with the summary ready — attach the
// downloaded file there. "retry" means the phone refused because preparing
// the file took too long after the tap: tap again (the file is kept).
export async function shareFile(opts: {
  makeFile: () => Promise<File>;
  text: string;
  ready?: File | null;
}): Promise<{ result: "shared" | "whatsapp" | "cancelled" | "retry"; file?: File }> {
  if (!canShareFiles()) {
    // Opened now, while still inside the click, so it isn't blocked as a pop-up.
    window.open(`https://wa.me/?text=${encodeURIComponent(opts.text)}`, "_blank", "noopener");
    const file = opts.ready ?? (await opts.makeFile());
    download(file);
    return { result: "whatsapp", file };
  }
  let file = opts.ready ?? null;
  try {
    file = file ?? (await opts.makeFile());
    await navigator.share({ files: [file], text: opts.text, title: file.name });
    return { result: "shared" };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return { result: "cancelled" };
    if (err instanceof DOMException && err.name === "NotAllowedError" && file) return { result: "retry", file };
    throw err;
  }
}

// A report's sheets as an Excel file, shared as above.
export async function shareReport(opts: { fileName: string; sheets: ExcelSheet[]; text: string; ready?: File | null }) {
  return shareFile({ makeFile: () => excelFile(opts.fileName, opts.sheets), text: opts.text, ready: opts.ready });
}
