"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  History,
  Users,
  Car,
  Package,
  Truck,
  ShoppingCart,
  Receipt,
  BarChart3,
  Shield,
  Settings,
  Menu,
  X,
  LogOut,
  Wrench,
  UserCog,
  CalendarCheck,
  Banknote,
} from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/context/AuthContext";
import { hasPermission, Permission } from "@/lib/permissions";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  permission?: Permission;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: "", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Workshop",
    items: [
      { href: "/dashboard/jobcards", label: "Job Cards", icon: ClipboardList, permission: "JOB_CARDS" },
      { href: "/dashboard/service-history", label: "Service History", icon: History, permission: "JOB_CARDS" },
    ],
  },
  {
    label: "Masters",
    items: [
      { href: "/dashboard/customers", label: "Customers", icon: Users, permission: "CUSTOMERS" },
      { href: "/dashboard/vehicles", label: "Vehicles", icon: Car, permission: "VEHICLES" },
      { href: "/dashboard/items", label: "Items", icon: Package, permission: "ITEMS" },
      { href: "/dashboard/suppliers", label: "Suppliers", icon: Truck, permission: "SUPPLIERS" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/dashboard/purchases", label: "Purchases", icon: ShoppingCart, permission: "PURCHASES" },
      { href: "/dashboard/invoices", label: "Invoices", icon: Receipt, permission: "INVOICES" },
      { href: "/dashboard/reports", label: "Reports", icon: BarChart3, permission: "REPORTS" },
    ],
  },
  {
    label: "Staff",
    items: [
      { href: "/dashboard/employees", label: "Employees", icon: UserCog, permission: "EMPLOYEES" },
      { href: "/dashboard/attendance", label: "Attendance", icon: CalendarCheck, permission: "ATTENDANCE" },
      { href: "/dashboard/salary", label: "Salary", icon: Banknote, permission: "SALARY" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/dashboard/users", label: "Users", icon: Shield, adminOnly: true },
      { href: "/dashboard/settings", label: "Settings", icon: Settings, adminOnly: true },
    ],
  },
];

function NavLink({ item, pathname, onClick }: { item: NavItem; pathname: string; onClick?: () => void }) {
  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {item.label}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white">
          <Wrench className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-gray-900">Motors Mitra</p>
          <p className="text-xs leading-tight text-gray-500">Workshop ERP</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter(
            (i) => (!i.adminOnly || user?.role === "ADMIN") && (!i.permission || hasPermission(user, i.permission))
          );
          if (items.length === 0) return null;
          return (
            <div key={group.label || "root"}>
              {group.label && (
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} onClick={onNavigate} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 p-3">
        <div className="flex items-center gap-2 rounded-md px-3 py-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
            {user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="truncate text-xs text-gray-500">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="flex-shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-50">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-gray-200 bg-white md:block print:hidden">
          <SidebarContent />
        </aside>

        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden print:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white">
              <Wrench className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-gray-900">Motors Mitra</span>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl">
              <div className="flex justify-end p-2">
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        <main className="md:pl-64">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </RequireAuth>
  );
}
