"use client";

import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, Shield } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
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
  isActive: boolean;
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
        body: JSON.stringify({ name, email, password, role }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setRole("STORE_USER");
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

  return (
    <div className="space-y-8">
      <PageHeader title="Users" description="Admin and Store User accounts that can sign in." />

      {loading ? (
        <TableSkeleton />
      ) : (
        <Table minWidth={550}>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
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
                  <ActiveBadge isActive={u.isActive} />
                </Td>
                <Td>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>
                    {u.isActive ? "Disable" : "Enable"}
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
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
