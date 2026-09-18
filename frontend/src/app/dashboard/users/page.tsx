"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, Shield, Pencil } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { PERMISSIONS, PERMISSION_LABELS, Permission } from "@/lib/permissions";
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

function PermissionChecklist({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const allSelected = PERMISSIONS.every((p) => selected.includes(p));

  function toggle(p: Permission) {
    onChange(selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p]);
  }

  function toggleAll() {
    onChange(allSelected ? [] : [...PERMISSIONS]);
  }

  return (
    <div className="rounded-md border border-gray-200 p-3">
      <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
        All modules
      </label>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-gray-100 pt-2">
        {PERMISSIONS.map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={selected.includes(p)} onChange={() => toggle(p)} />
            {PERMISSION_LABELS[p]}
          </label>
        ))}
      </div>
    </div>
  );
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
                  ) : u.permissions.length === PERMISSIONS.length ? (
                    <span className="text-xs text-gray-600">All modules</span>
                  ) : u.permissions.length === 0 ? (
                    <span className="text-xs text-gray-400">None yet</span>
                  ) : (
                    <span className="text-xs text-gray-600">
                      {u.permissions.map((p) => PERMISSION_LABELS[p as Permission] ?? p).join(", ")}
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
