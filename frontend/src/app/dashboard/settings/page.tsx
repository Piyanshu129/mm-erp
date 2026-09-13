"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { apiFetch } from "@/lib/api";

function SettingsContent() {
  const [downloading, setDownloading] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownloadBackup() {
    setError(null);
    setDownloading(true);
    try {
      const bundle = await apiFetch("/backup");
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mm-erp-backup-${bundle.generatedAt.replace(/[:.]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLastBackupAt(bundle.generatedAt);
    } catch {
      setError("Could not generate backup");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Settings</h1>

      <div className="max-w-xl rounded-md border border-gray-200 p-4">
        <h2 className="mb-1 text-base font-semibold">Data Backup</h2>
        <p className="mb-3 text-sm text-gray-500">
          Downloads a complete snapshot of every business record — customers, vehicles, items,
          suppliers, purchases, stock ledger, job cards, parts, labour, and invoices — as one JSON
          file. Keep downloaded backups somewhere other than this machine.
        </p>
        <button
          onClick={handleDownloadBackup}
          disabled={downloading}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {downloading ? "Generating..." : "Download backup now"}
        </button>
        {lastBackupAt && (
          <p className="mt-2 text-sm text-green-700">
            Downloaded backup generated at {new Date(lastBackupAt).toLocaleString()}.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <p className="mt-4 text-xs text-gray-400">
          Restoring a backup is a whole-database operation and only runs from the server via{" "}
          <code>npm run backup:restore -- &lt;file&gt; --yes</code> (it refuses to run against a
          database that already has data, to avoid overwriting anything by accident) — not exposed
          here as a one-click action.
        </p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <SettingsContent />
    </RequireAuth>
  );
}
