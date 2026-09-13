"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/context/AuthContext";

function TopBar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 print:hidden">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="font-semibold">Motors Mitra ERP</span>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
            Dashboard
          </Link>
          <Link href="/dashboard/jobcards" className="text-gray-600 hover:text-gray-900">
            Job Cards
          </Link>
          <Link href="/dashboard/customers" className="text-gray-600 hover:text-gray-900">
            Customers
          </Link>
          <Link href="/dashboard/vehicles" className="text-gray-600 hover:text-gray-900">
            Vehicles
          </Link>
          <Link href="/dashboard/items" className="text-gray-600 hover:text-gray-900">
            Items
          </Link>
          <Link href="/dashboard/suppliers" className="text-gray-600 hover:text-gray-900">
            Suppliers
          </Link>
          <Link href="/dashboard/purchases" className="text-gray-600 hover:text-gray-900">
            Purchases
          </Link>
          <Link href="/dashboard/invoices" className="text-gray-600 hover:text-gray-900">
            Invoices
          </Link>
          <Link href="/dashboard/service-history" className="text-gray-600 hover:text-gray-900">
            Service History
          </Link>
          <Link href="/dashboard/reports" className="text-gray-600 hover:text-gray-900">
            Reports
          </Link>
          {user?.role === "ADMIN" && (
            <>
              <Link href="/dashboard/users" className="text-gray-600 hover:text-gray-900">
                Users
              </Link>
              <Link href="/dashboard/settings" className="text-gray-600 hover:text-gray-900">
                Settings
              </Link>
            </>
          )}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-500">
          {user?.name} · {user?.role}
        </span>
        <button onClick={handleLogout} className="text-gray-600 underline hover:text-gray-900">
          Sign out
        </button>
      </div>
    </header>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="min-h-screen">
        <TopBar />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </div>
    </RequireAuth>
  );
}
