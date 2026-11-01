"use client";

import { ReactNode, useRef, useState } from "react";
import { Camera, Download, Printer } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { compressImage } from "@/lib/compressImage";
import { downloadElementAsPdf } from "@/lib/invoicePdf";
import { AssetLink, AuthedImage } from "@/components/AuthedMedia";
import { SharePdfButton } from "@/components/SharePdfButton";
import { Button } from "@/components/ui/Button";

// Prints just this element: a new window with the page's own styles.
function printElement(element: HTMLElement, title: string) {
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return;
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join("");
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${styles}</head><body class="bg-white p-6">${element.outerHTML}</body></html>`
  );
  win.document.close();
  win.focus();
  // Give the styles a moment to load before the print dialog opens.
  setTimeout(() => win.print(), 500);
}

// A printable slip signed on paper — the vehicle trial sign-off or the gate
// pass — with Print / Download PDF / Share on WhatsApp, then a photo of the
// signed copy uploaded back onto the job card.
export function SignOffSlip({
  jobCardId,
  kind,
  fileName,
  shareMobile,
  shareText,
  photoUrl,
  signedAt,
  disabledReason,
  onUploaded,
  children,
}: {
  jobCardId: number;
  kind: "trial" | "gate-pass";
  fileName: string;
  shareMobile: string;
  shareText: string;
  photoUrl: string | null | undefined;
  signedAt: string | null | undefined;
  // Set when the slip can't be signed yet (e.g. gate pass before closing).
  disabledReason?: string;
  onUploaded: () => Promise<void>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "upload" | null>(null);
  const what = kind === "trial" ? "trial sign-off" : "gate pass";

  async function upload(file: File) {
    setError(null);
    setBusy("upload");
    try {
      const form = new FormData();
      form.set("photo", await compressImage(file));
      await apiFetch(`/job-cards/${jobCardId}/sign-off/${kind}`, { method: "POST", body: form });
      await onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload the photo");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!ref.current) return;
    setError(null);
    setBusy("pdf");
    try {
      await downloadElementAsPdf(ref.current, fileName);
    } catch {
      setError("Could not create the PDF — use Print instead.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div ref={ref} className="rounded-md border border-gray-200 bg-white p-5 text-sm text-gray-900">
        {children}
      </div>
      {disabledReason ? (
        <p className="text-sm text-gray-500">{disabledReason}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => ref.current && printElement(ref.current, fileName)}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={download} disabled={busy !== null}>
              <Download className="h-4 w-4" /> {busy === "pdf" ? "Preparing PDF..." : "Download PDF"}
            </Button>
            <SharePdfButton getElement={() => ref.current} fileName={fileName} mobile={shareMobile} text={shareText} onError={setError} />
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Camera className="h-4 w-4" />
              {busy === "upload" ? "Uploading..." : photoUrl ? `Replace signed ${what} photo` : `Upload / take photo of signed ${what}`}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </>
      )}
      {photoUrl && (
        <div className="space-y-1">
          <p className="text-sm text-green-700">
            Signed {what} on file{signedAt ? ` — ${new Date(signedAt).toLocaleString()}` : ""}.
          </p>
          <AssetLink href={photoUrl} className="inline-block">
            <AuthedImage src={photoUrl} alt={`Signed ${what}`} className="max-h-60 rounded-md border border-gray-200 object-contain" />
          </AssetLink>
        </div>
      )}
    </div>
  );
}

// The signature boxes at the foot of a slip.
export function SignatureLines({ left, right }: { left: [string, string]; right: [string, string] }) {
  return (
    <div className="mt-10 grid grid-cols-2 gap-10">
      {[left, right].map(([title, note]) => (
        <div key={title}>
          <div className="h-12 border-b border-gray-400" />
          <p className="mt-1 font-semibold">{title}</p>
          <p className="text-xs text-gray-500">{note}</p>
        </div>
      ))}
    </div>
  );
}
