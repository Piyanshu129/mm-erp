"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { apiFetch, apiDownloadFile, ApiError } from "@/lib/api";

function SettingsContent() {
  const [downloading, setDownloading] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);

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

  async function handleDownloadExcel() {
    setExcelError(null);
    setDownloadingExcel(true);
    try {
      await apiDownloadFile("/backup/excel", "mm-erp-data.xlsx");
    } catch (err) {
      setExcelError(err instanceof ApiError ? err.message : "Could not download Excel export");
    } finally {
      setDownloadingExcel(false);
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

      <div className="max-w-xl rounded-md border border-gray-200 p-4">
        <h2 className="mb-1 text-base font-semibold">Excel Export</h2>
        <p className="mb-3 text-sm text-gray-500">
          A live, human-readable mirror of the database — one tab per table (Customers, Vehicles,
          Suppliers, Items, Purchases, Stock Ledger, Job Cards, Job Card Parts, Job Card Labour,
          Invoices). This runs automatically alongside the database, refreshing about once a minute
          — it does not replace the database, it's a parallel copy for anyone who wants to browse
          the data in Excel.
        </p>
        <button
          onClick={handleDownloadExcel}
          disabled={downloadingExcel}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {downloadingExcel ? "Downloading..." : "Download Excel export"}
        </button>
        {excelError && <p className="mt-2 text-sm text-red-600">{excelError}</p>}
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
