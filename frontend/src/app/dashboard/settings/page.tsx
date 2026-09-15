"use client";

import { useState } from "react";
import { DatabaseBackup, FileSpreadsheet, Download, CheckCircle2 } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { apiFetch, apiDownloadFile, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

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
    <div className="space-y-6">
      <PageHeader title="Settings" description="Backups and data export." />

      <Card className="max-w-xl">
        <CardBody>
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900">
            <DatabaseBackup className="h-4 w-4 text-gray-400" /> Data Backup
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            Downloads a complete snapshot of every business record — customers, vehicles, items, item serial units,
            suppliers, purchases, job cards, parts, labour, invoices, employees, attendance, and salary — as one JSON
            file. Keep downloaded backups somewhere other than this machine.
          </p>
          <Button onClick={handleDownloadBackup} disabled={downloading}>
            <Download className="h-4 w-4" /> {downloading ? "Generating..." : "Download backup now"}
          </Button>
          {lastBackupAt && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Downloaded backup generated at {new Date(lastBackupAt).toLocaleString()}.
            </p>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <p className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Restoring a backup is a whole-database operation and only runs from the server via{" "}
            <code className="rounded bg-gray-200 px-1 py-0.5">npm run backup:restore -- &lt;file&gt; --yes</code> (it
            refuses to run against a database that already has data, to avoid overwriting anything by accident) — not
            exposed here as a one-click action.
          </p>
        </CardBody>
      </Card>

      <Card className="max-w-xl">
        <CardBody>
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900">
            <FileSpreadsheet className="h-4 w-4 text-gray-400" /> Excel Export
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            A live, human-readable mirror of the database — one tab per table (Customers, Vehicles, Suppliers, Items,
            Purchases, Item Units, Job Cards, Job Card Parts, Job Card Labour, Invoices, Employees, Attendance, Salary
            Payments). This runs automatically alongside the database, refreshing about once a minute — it does not
            replace the database, it&apos;s a parallel copy for anyone who wants to browse the data in Excel.
          </p>
          <Button onClick={handleDownloadExcel} disabled={downloadingExcel}>
            <Download className="h-4 w-4" /> {downloadingExcel ? "Downloading..." : "Download Excel export"}
          </Button>
          {excelError && <p className="mt-3 text-sm text-red-600">{excelError}</p>}
        </CardBody>
      </Card>
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
