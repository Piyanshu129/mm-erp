"use client";

import { EmployeePortalAuthProvider } from "@/context/EmployeePortalAuthContext";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <EmployeePortalAuthProvider>
      <div className="min-h-screen bg-gray-50">{children}</div>
    </EmployeePortalAuthProvider>
  );
}
