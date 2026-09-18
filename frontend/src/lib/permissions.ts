// Mirrors backend/src/lib/permissions.ts — the grantable modules for a
// Store User account. Admin is always a superuser and never needs these.
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

export const PERMISSION_LABELS: Record<Permission, string> = {
  CUSTOMERS: "Customers",
  VEHICLES: "Vehicles",
  ITEMS: "Items",
  SUPPLIERS: "Suppliers",
  PURCHASES: "Purchases",
  JOB_CARDS: "Job Cards",
  INVOICES: "Invoices",
  REPORTS: "Reports",
  EMPLOYEES: "Employees",
  ATTENDANCE: "Attendance",
  SALARY: "Salary",
};

export function hasPermission(user: { role: string; permissions: string[] } | null, permission: Permission): boolean {
  if (!user) return false;
  return user.role === "ADMIN" || user.permissions.includes(permission);
}
