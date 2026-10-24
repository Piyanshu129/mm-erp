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

// Micro-level grants: a module on its own ("JOB_CARDS") allows everything in
// it, as before; "JOB_CARDS:VIEW" / ":ADD" / ":EDIT" / ":DELETE" allow one
// action. The action of a request comes from its HTTP method (see
// requirePermission.ts): reading is VIEW, POST is ADD, PATCH/PUT is EDIT,
// DELETE is DELETE.
export const PERMISSION_ACTIONS = ["VIEW", "ADD", "EDIT", "DELETE"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export function isValidGrant(value: string): boolean {
  const [module, action, extra] = value.split(":");
  if (extra !== undefined || !isValidPermission(module)) return false;
  return action === undefined || (PERMISSION_ACTIONS as readonly string[]).includes(action);
}

export function actionForMethod(method: string): PermissionAction {
  switch (method.toUpperCase()) {
    case "POST":
      return "ADD";
    case "PATCH":
    case "PUT":
      return "EDIT";
    case "DELETE":
      return "DELETE";
    default:
      return "VIEW";
  }
}

// Whether a list of grants allows an action in a module.
export function grants(permissions: string[], module: string, action: PermissionAction): boolean {
  return permissions.includes(module) || permissions.includes(`${module}:${action}`);
}

const ACTION_WORDS: Record<PermissionAction, string> = { VIEW: "view", ADD: "add", EDIT: "edit", DELETE: "delete" };
const MODULE_WORDS: Record<string, string> = {
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

export function deniedMessage(modules: string[], action: PermissionAction): string {
  return `You don't have permission to ${ACTION_WORDS[action]} in ${modules.map((m) => MODULE_WORDS[m] ?? m).join(" / ")} — ask an admin`;
}
