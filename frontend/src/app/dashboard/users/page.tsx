"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, Shield, Pencil, Trash2, KeyRound } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSION_ACTIONS,
  ACTION_LABELS,
  Permission,
  PermissionAction,
  actionsIn,
  toGrants,
} from "@/lib/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { ActiveBadge, Badge } from "@/components/ui/Badge";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  isActive: boolean;
}

// Which actions a Store User may take in each module: View / Add / Edit /
// Delete. The server enforces the same per request.
function PermissionChecklist({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const byModule = Object.fromEntries(PERMISSIONS.map((m) => [m, actionsIn(selected, m)])) as Record<Permission, PermissionAction[]>;
  const allSelected = PERMISSIONS.every((m) => byModule[m].length === PERMISSION_ACTIONS.length);

  function set(module: Permission, actions: PermissionAction[]) {
    // Add/Edit/Delete without View makes no sense — any of them turns View on.
    const next = actions.length && !actions.includes("VIEW") ? (["VIEW", ...actions] as PermissionAction[]) : actions;
    onChange(toGrants({ ...byModule, [module]: next }));
  }
  function toggle(module: Permission, action: PermissionAction) {
    const has = byModule[module].includes(action);
    // Turning View off turns the whole module off.
    if (has && action === "VIEW") return set(module, []);
    set(module, has ? byModule[module].filter((a) => a !== action) : [...byModule[module], action]);
  }

  return (
    <div className="overflow-x-auto rounded-md border border-gray-200">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-500">
            <th className="px-3 py-2 text-left">
              <label className="flex items-center gap-2 font-medium text-gray-700">
                <input type="checkbox" checked={allSelected} onChange={() => onChange(allSelected ? [] : [...PERMISSIONS])} />
                Module (all)
              </label>
            </th>
            {PERMISSION_ACTIONS.map((a) => (
              <th key={a} className="px-2 py-2 text-center">
                {ACTION_LABELS[a]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map((m) => {
            const all = byModule[m].length === PERMISSION_ACTIONS.length;
            return (
              <tr key={m} className="border-t border-gray-100">
                <td className="px-3 py-1.5">
                  <label className="flex items-center gap-2 text-gray-700">
                    <input type="checkbox" checked={all} onChange={() => set(m, all ? [] : [...PERMISSION_ACTIONS])} />
                    {PERMISSION_LABELS[m]}
                  </label>
                </td>
                {PERMISSION_ACTIONS.map((a) => (
                  <td key={a} className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${PERMISSION_LABELS[m]} — ${ACTION_LABELS[a]}`}
                      checked={byModule[m].includes(a)}
                      onChange={() => toggle(m, a)}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// "Job Cards (View, Add) · Items" — what a user may do, for the list.
function describeGrants(perms: string[]): string {
  return PERMISSIONS.map((m) => {
    const acts = actionsIn(perms, m);
    if (acts.length === 0) return null;
    if (acts.length === PERMISSION_ACTIONS.length) return PERMISSION_LABELS[m];
    return `${PERMISSION_LABELS[m]} (${acts.map((a) => ACTION_LABELS[a]).join(", ")})`;
  })
    .filter(Boolean)
    .join(" · ");
}

function UsersPageContent() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("STORE_USER");
  const [permissions, setPermissions] = useState<string[]>([]);

  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function loadUsers() {
    setLoading(true);
    const body = await apiFetch("/users");
    setUsers(body.users);
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role, permissions: role === "STORE_USER" ? permissions : undefined }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setRole("STORE_USER");
      setPermissions([]);
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create user");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: UserRow) {
    await apiFetch(`/users/${user.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    await loadUsers();
  }

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // An admin sets a new password for a user who forgot theirs; they're
  // signed out everywhere and log in with the new one.
  async function handleResetPassword(user: UserRow) {
    const password = window.prompt(`New password for ${user.name} (${user.email}) — at least 8 characters:`);
    if (password == null) return;
    setDeleteError(null);
    setNotice(null);
    if (password.length < 8) {
      setDeleteError("The password must be at least 8 characters");
      return;
    }
    try {
      await apiFetch(`/users/${user.id}/password`, { method: "PATCH", body: JSON.stringify({ password }) });
      setNotice(`Password reset for ${user.name}. Give them the new password — they've been signed out and must log in with it.`);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not reset the password");
    }
  }

  async function handleDelete(user: UserRow) {
    if (
      !window.confirm(
        `Delete ${user.name} (${user.email})? They won't be able to log in any more. Records they entered keep their name.`
      )
    ) {
      return;
    }
    setDeleteError(null);
    try {
      await apiFetch(`/users/${user.id}`, { method: "DELETE" });
      if (editingUser?.id === user.id) setEditingUser(null);
      await loadUsers();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete user");
    }
  }

  function openEditPermissions(user: UserRow) {
    setEditingUser(user);
    setEditPermissions(user.permissions);
    setEditError(null);
  }

  async function saveEditPermissions(e: FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);
    setEditSubmitting(true);
    try {
      await apiFetch(`/users/${editingUser.id}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permissions: editPermissions }),
      });
      setEditingUser(null);
      await loadUsers();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Could not save permissions");
    } finally {
      setEditSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Users" description="Admin and Store User accounts that can sign in." />

      {deleteError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}
      {notice && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}

      {loading ? (
        <TableSkeleton />
      ) : (
        <Table minWidth={700}>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Permissions</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <Tr key={u.id}>
                <Td className="font-medium text-gray-900">{u.name}</Td>
                <Td>{u.email}</Td>
                <Td>
                  <Badge tone={u.role === "ADMIN" ? "purple" : "blue"}>{u.role}</Badge>
                </Td>
                <Td>
                  {u.role === "ADMIN" ? (
                    <span className="text-xs text-gray-400">All (Admin)</span>
                  ) : PERMISSIONS.every((m) => u.permissions.includes(m)) ? (
                    <span className="text-xs text-gray-600">All modules</span>
                  ) : u.permissions.length === 0 ? (
                    <span className="text-xs text-gray-400">None yet</span>
                  ) : (
                    <span className="text-xs text-gray-600">
                      {describeGrants(u.permissions)}
                    </span>
                  )}
                </Td>
                <Td>
                  <ActiveBadge isActive={u.isActive} />
                </Td>
                <Td>
                  <div className="flex items-center gap-3">
                    {u.role === "STORE_USER" && (
                      <button
                        onClick={() => openEditPermissions(u)}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Pencil className="h-3 w-3" /> Permissions
                      </button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>
                      {u.isActive ? "Disable" : "Enable"}
                    </Button>
                    <button
                      onClick={() => handleResetPassword(u)}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      title="Set a new password"
                    >
                      <KeyRound className="h-3 w-3" /> Reset password
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                      title="Delete user"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {editingUser && (
        <Card className="max-w-sm">
          <CardBody>
            <form onSubmit={saveEditPermissions} className="space-y-3">
              <p className="text-sm font-medium text-gray-900">Permissions for {editingUser.name}</p>
              <PermissionChecklist selected={editPermissions} onChange={setEditPermissions} />
              {editError && <p className="text-sm text-red-600">{editError}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={editSubmitting}>
                  {editSubmitting ? "Saving..." : "Save permissions"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
          <Shield className="h-4 w-4 text-gray-400" /> Add user
        </h2>
        <Card className="max-w-sm">
          <CardBody>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label>Password (min 8 characters)</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Role</Label>
                <Select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="STORE_USER">Store User</option>
                  <option value="ADMIN">Admin</option>
                </Select>
              </div>
              {role === "STORE_USER" && (
                <div>
                  <Label>Permissions — which parts of the ERP can this user access?</Label>
                  <PermissionChecklist selected={permissions} onChange={setPermissions} />
                </div>
              )}
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create user"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function UsersPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <UsersPageContent />
    </RequireAuth>
  );
}
