export const JOB_CARD_STATUSES = [
  "DRAFT",
  "VEHICLE_RECEIVED",
  "WORK_STARTED",
  "WAITING_FOR_PARTS",
  "WORK_IN_PROGRESS",
  "COMPLETED",
  "INVOICED",
  "CLOSED",
  "CANCELLED",
] as const;

export type JobCardStatus = (typeof JOB_CARD_STATUSES)[number];

// Once a job card reaches one of these, parts/labour can no longer be added
// or removed — protects a billed/closed record from silently drifting away
// from what the customer was actually charged.
export const LOCKED_STATUSES: readonly JobCardStatus[] = ["INVOICED", "CLOSED", "CANCELLED"];

export function isLocked(status: string): boolean {
  return (LOCKED_STATUSES as readonly string[]).includes(status);
}
