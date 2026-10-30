"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { elementToPdfFile } from "@/lib/invoicePdf";
import { whatsAppLink } from "@/components/WhatsAppMessage";

function canShareFiles(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.canShare?.({ files: [new File([""], "check.pdf", { type: "application/pdf" })] })
    );
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

// "Share on WhatsApp" for a printed document (estimate, GST invoice). On a
// phone the share sheet opens with the PDF attached — pick WhatsApp and the
// chat. On a computer the PDF downloads and WhatsApp opens with the message
// to the customer ready — attach the downloaded PDF there.
export function SharePdfButton({
  getElement,
  fileName,
  mobile,
  text,
  onError,
}: {
  getElement: () => HTMLElement | null;
  fileName: string;
  mobile: string | null | undefined;
  text: string;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  // A phone allows sharing only straight after a tap. If making the PDF took
  // too long the share is refused — the PDF is kept and a second tap sends it.
  const [ready, setReady] = useState<File | null>(null);

  async function share() {
    const element = getElement();
    if (!element) return;
    const link = (mobile && whatsAppLink(mobile, text)) || `https://wa.me/?text=${encodeURIComponent(text)}`;

    if (!canShareFiles()) {
      // Opened now, while still inside the click, so it isn't blocked as a pop-up.
      window.open(link, "_blank", "noopener");
      setBusy(true);
      try {
        download(await elementToPdfFile(element, fileName));
      } catch {
        onError("Could not create the PDF — use Download PDF instead.");
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    let file = ready;
    try {
      file = file ?? (await elementToPdfFile(element, fileName));
      await navigator.share({ files: [file], text, title: file.name });
      setReady(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setReady(null);
      } else if (err instanceof DOMException && err.name === "NotAllowedError" && file) {
        setReady(file);
      } else {
        onError("Could not share the PDF — use Download PDF and send it on WhatsApp.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={share} disabled={busy}>
      <MessageCircle className="h-4 w-4" />
      {busy ? "Preparing PDF..." : ready ? "PDF ready — tap to share" : "Share on WhatsApp"}
    </Button>
  );
}
