// A job card is Open while work is going on, Invoiced once its invoice has
// been generated (the only way to reach Invoiced — see invoices.service.ts),
// or Cancelled. Simplified from an eleven-step workflow on 2026-09-30.
export const JOB_CARD_STATUSES = ["OPEN", "INVOICED", "CANCELLED"] as const;

export type JobCardStatus = (typeof JOB_CARD_STATUSES)[number];

// Once a job card reaches one of these, parts/labour can no longer be added
// or removed — protects a billed record from silently drifting away from
// what the customer was actually charged. A cancelled job card can be
// reopened (back to Open) to make changes.
export const LOCKED_STATUSES: readonly JobCardStatus[] = ["INVOICED", "CANCELLED"];

export function isLocked(status: string): boolean {
  return (LOCKED_STATUSES as readonly string[]).includes(status);
}
