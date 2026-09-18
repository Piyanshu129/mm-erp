// The grantable modules for a STORE_USER account. ADMIN is always a
// superuser and bypasses this list entirely (see requirePermission.ts) —
// Users management and Backup/Settings are deliberately NOT in this list;
// they stay ADMIN-only forever, since granting them would let a
// permission-scoped account create other logins or restore the database.
export const PERMISSIONS = [
  "CUSTOMERS",
  "VEHICLES",
  "ITEMS",
  "SUPPLIERS",
  "PURCHASES",
  "JOB_CARDS",
  "INVOICES",
  "REPORTS",
  "EMPLOYEES",
  "ATTENDANCE",
  "SALARY",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isValidPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
