"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";

// Admin-only Delete for a master record (customer, supplier, item). The server
// refuses one that's already been used and says why — that message goes to
// onError for the page to show.
export function AdminDeleteButton({
  url,
  confirmText,
  onDeleted,
  onError,
}: {
  url: string;
  confirmText: string;
  onDeleted: () => void | Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!window.confirm(confirmText)) return;
    onError(null);
    setBusy(true);
    try {
      await apiFetch(url, { method: "DELETE" });
      await onDeleted();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not delete");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-50"
    >
      <Trash2 className="h-3 w-3" /> {busy ? "Deleting..." : "Delete"}
    </button>
  );
}
