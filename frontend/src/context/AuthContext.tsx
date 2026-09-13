"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiFetch, setAccessToken, tryRefresh, CurrentUser, ApiError } from "@/lib/api";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On first load there's no access token in memory yet (it's never
  // persisted client-side), so attempt a silent refresh using the
  // httpOnly cookie before deciding the user is logged out.
  useEffect(() => {
    (async () => {
      const refreshed = await tryRefresh();
      if (refreshed) {
        const body = await apiFetch("/auth/me");
        setUser(body.user);
      }
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    try {
      const body = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAccessToken(body.accessToken);
      setUser(body.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
      throw err;
    }
  }

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
