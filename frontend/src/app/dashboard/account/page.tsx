"use client";

import { RequireAuth } from "@/components/RequireAuth";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";

// Any signed-in user can change their own password here. Changing it signs
// them out everywhere, so they log in again with the new one.
function AccountPageContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError("The new password must be at least 8 characters");
    if (next !== confirm) return setError("The two new passwords don't match");
    setSaving(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      await logout();
      router.replace("/login?changed=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the password — check the connection and try again");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My account" description={`${user?.name ?? ""} · ${user?.email ?? ""}`} />
      <Card className="max-w-md">
        <CardBody>
          <form onSubmit={save} className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <KeyRound className="h-4 w-4 text-gray-400" /> Change password
            </p>
            <div>
              <Label>Current password</Label>
              <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div>
              <Label>New password (at least 8 characters)</Label>
              <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div>
              <Label>New password again</Label>
              <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={saving || !current || !next}>
              {saving ? "Saving..." : "Change password"}
            </Button>
            <p className="text-xs text-gray-500">You&apos;ll be signed out and log in again with the new password.</p>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountPageContent />
    </RequireAuth>
  );
}
