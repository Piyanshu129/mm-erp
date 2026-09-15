export const JOB_CARD_STATUSES = [
  "DRAFT",
  "VEHICLE_RECEIVED",
  "WORK_STARTED",
  "WAITING_FOR_PARTS",
  "WORK_IN_PROGRESS",
  "COMPLETED",
  "INVOICED",
  "READY_FOR_DELIVERY",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
] as const;

export type JobCardStatus = (typeof JOB_CARD_STATUSES)[number];

// Once a job card reaches one of these, parts/labour can no longer be added
// or removed — protects a billed/closed record from silently drifting away
// from what the customer was actually charged.
export const LOCKED_STATUSES: readonly JobCardStatus[] = [
  "INVOICED",
  "READY_FOR_DELIVERY",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
];

// Statuses that come after the vehicle has been received and before-photos
// should already exist.
export const AFTER_VEHICLE_RECEIVED: readonly JobCardStatus[] = [
  "WORK_STARTED",
  "WAITING_FOR_PARTS",
  "WORK_IN_PROGRESS",
  "COMPLETED",
  "INVOICED",
  "READY_FOR_DELIVERY",
  "DELIVERED",
  "CLOSED",
];

// Statuses that come at or after work is done and after-photos should
// already exist.
export const AT_OR_PAST_COMPLETED: readonly JobCardStatus[] = [
  "COMPLETED",
  "INVOICED",
  "READY_FOR_DELIVERY",
  "DELIVERED",
  "CLOSED",
];

// Statuses that can only be reached once an invoice has been generated.
export const POST_INVOICE_STATUSES: readonly JobCardStatus[] = [
  "INVOICED",
  "READY_FOR_DELIVERY",
  "DELIVERED",
  "CLOSED",
];

export function isLocked(status: string): boolean {
  return (LOCKED_STATUSES as readonly string[]).includes(status);
}
