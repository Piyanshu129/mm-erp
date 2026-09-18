"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { employeeApiFetch, setEmployeeToken, loadStoredEmployeeToken } from "@/lib/employeePortalApi";
import { ApiError } from "@/lib/api";

export interface EmployeeProfile {
  id: number;
  name: string;
  role: string | null;
  email: string | null;
  mobile?: string | null;
}

interface EmployeePortalAuthValue {
  employee: EmployeeProfile | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const EmployeePortalAuthContext = createContext<EmployeePortalAuthValue | undefined>(undefined);

export function EmployeePortalAuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = loadStoredEmployeeToken();
      if (token) {
        try {
          const body = await employeeApiFetch("/employee-portal/me");
          setEmployee(body.employee);
        } catch {
          setEmployeeToken(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    try {
      const body = await employeeApiFetch("/employee-portal/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setEmployeeToken(body.accessToken);
      setEmployee(body.employee);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
      throw err;
    }
  }

  function logout() {
    setEmployeeToken(null);
    setEmployee(null);
  }

  return (
    <EmployeePortalAuthContext.Provider value={{ employee, loading, error, login, logout }}>
      {children}
    </EmployeePortalAuthContext.Provider>
  );
}

export function useEmployeePortalAuth() {
  const ctx = useContext(EmployeePortalAuthContext);
  if (!ctx) throw new Error("useEmployeePortalAuth must be used within EmployeePortalAuthProvider");
  return ctx;
}
