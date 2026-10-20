"use client";

import { useEffect, useState } from "react";
import { Copy, MessageCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

// wa.me needs the number with its country code and no "+" or spaces.
// Mobile numbers here are 10-digit Indian numbers (lib/phone.ts).
export function whatsAppLink(mobile: string, text: string): string | null {
  const digits = mobile.replace(/\D/g, "");
  const number = digits.length === 10 ? `91${digits}` : digits.length >= 11 ? digits : null;
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}

// A pre-written message the user can read and edit before sending — then
// either opens WhatsApp with it ready to send to the customer, or copies it
// to paste anywhere. Nothing is sent automatically.
export function WhatsAppMessage({
  mobile,
  message,
  title,
}: {
  mobile: string | null | undefined;
  message: string;
  title: string;
}) {
  const [text, setText] = useState(message);
  const [copied, setCopied] = useState(false);

  // A new prefilled message (e.g. after a payment changes the amount due)
  // replaces the draft.
  useEffect(() => setText(message), [message]);

  const link = mobile ? whatsAppLink(mobile, text) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers / no clipboard permission: fall back to a hidden textarea.
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      <p className="text-xs text-gray-500">Check and edit the message, then send it.</p>
      <div className="flex flex-wrap gap-2">
        {link ? (
          <Button type="button" size="sm" onClick={() => window.open(link, "_blank", "noopener")}>
            <MessageCircle className="h-4 w-4" /> Open in WhatsApp
          </Button>
        ) : (
          <span className="self-center text-xs text-amber-700">No valid mobile number on file — copy the message instead.</span>
        )}
        <Button type="button" size="sm" variant="secondary" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy message"}
        </Button>
      </div>
    </div>
  );
}
