"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useEmployeePortalAuth } from "@/context/EmployeePortalAuthContext";

export function RequireEmployeeAuth({ children }: { children: React.ReactNode }) {
  const { employee, loading } = useEmployeePortalAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !employee) {
      router.replace("/portal/login");
    }
  }, [loading, employee, router]);

  if (loading || !employee) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">Loading...</div>;
  }

  return <>{children}</>;
}
