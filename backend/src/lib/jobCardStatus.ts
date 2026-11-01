// A job card is Open while work is going on, Closed once it's been closed
// and billed (stored as INVOICED, its name before 2026-11-01; closing is the
// only way to reach it — see invoices.service.ts#closeJobCard), or
// Cancelled. Simplified from an eleven-step workflow on 2026-09-30.
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
