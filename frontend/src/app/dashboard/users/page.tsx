"use client";

import { FormEvent, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { apiFetch, ApiError } from "@/lib/api";

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
      <div>
        <h1 className="mb-4 text-lg font-semibold">Users</h1>
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <table className="w-full border-collapse overflow-hidden rounded-md border border-gray-200 text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-gray-200">
                  <td className="px-3 py-2">{u.name}</td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">{u.role}</td>
                  <td className="px-3 py-2">{u.isActive ? "Active" : "Disabled"}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleActive(u)}
                      className="text-gray-600 underline hover:text-gray-900"
                    >
                      {u.isActive ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">Add user</h2>
        <form onSubmit={handleCreate} className="max-w-sm space-y-3">
          <input
            placeholder="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="STORE_USER">Store User</option>
            <option value="ADMIN">Admin</option>
          </select>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create user"}
          </button>
        </form>
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
