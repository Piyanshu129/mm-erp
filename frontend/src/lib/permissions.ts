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
  INVOICES: "Draft Invoices",
  REPORTS: "Reports",
  EMPLOYEES: "Employees",
  ATTENDANCE: "Attendance",
  SALARY: "Salary",
};

// A grant is a whole module ("JOB_CARDS" — everything in it) or one action
// in it ("JOB_CARDS:ADD"). Mirrors backend/src/lib/permissions.ts, which
// enforces it per request.
export const PERMISSION_ACTIONS = ["VIEW", "ADD", "EDIT", "DELETE"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export const ACTION_LABELS: Record<PermissionAction, string> = { VIEW: "View", ADD: "Add", EDIT: "Edit", DELETE: "Delete" };

export function hasPermission(
  user: { role: string; permissions: string[] } | null,
  permission: Permission,
  action: PermissionAction = "VIEW"
): boolean {
  if (!user) return false;
  return user.role === "ADMIN" || user.permissions.includes(permission) || user.permissions.includes(`${permission}:${action}`);
}

// The actions a list of grants allows in one module.
export function actionsIn(permissions: string[], module: Permission): PermissionAction[] {
  if (permissions.includes(module)) return [...PERMISSION_ACTIONS];
  return PERMISSION_ACTIONS.filter((a) => permissions.includes(`${module}:${a}`));
}

// Back to grant strings: all four actions are stored as the whole module.
export function toGrants(byModule: Partial<Record<Permission, PermissionAction[]>>): string[] {
  return PERMISSIONS.flatMap((m) => {
    const acts = byModule[m] ?? [];
    if (acts.length === PERMISSION_ACTIONS.length) return [m];
    return acts.map((a) => `${m}:${a}`);
  });
}
