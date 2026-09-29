// Mirrors backend/src/lib/jobCardStatus.ts. A job card becomes Invoiced
// only by generating its invoice.
export const JOB_CARD_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  INVOICED: "Invoiced",
  CANCELLED: "Cancelled",
};

export function jobCardStatusLabel(status: string): string {
  return JOB_CARD_STATUS_LABELS[status] ?? status;
}
