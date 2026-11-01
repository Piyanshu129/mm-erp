// Mirrors backend/src/lib/jobCardStatus.ts. A job card becomes Closed
// (stored as INVOICED) only by closing it, which makes its estimate the bill.
export const JOB_CARD_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  INVOICED: "Closed",
  CANCELLED: "Cancelled",
};

export function jobCardStatusLabel(status: string): string {
  return JOB_CARD_STATUS_LABELS[status] ?? status;
}
