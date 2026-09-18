import { ApiError } from "./api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const TOKEN_STORAGE_KEY = "mm_employee_portal_token";

// Kept completely separate from lib/api.ts's admin accessToken — an admin
// session and an employee-portal session can be open in the same browser
// (different tabs, or a manager checking both) without clobbering each
// other's token.
let employeeToken: string | null = null;

export function setEmployeeToken(token: string | null) {
  employeeToken = token;
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function loadStoredEmployeeToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  employeeToken = token;
  return token;
}

async function parseJson(res: Response) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// The employee-portal token is a single longer-lived JWT with no refresh
// flow (see backend/src/lib/jwt.ts) — a punch-clock is low-stakes enough
// that "log in again once a day" is an acceptable trade for not building a
// second refresh-token/cookie system. So this stays a plain fetch, no
// silent-retry-on-401 like the admin apiFetch.
export async function employeeApiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (employeeToken) {
    headers.set("Authorization", `Bearer ${employeeToken}`);
  }
  headers.set("ngrok-skip-browser-warning", "true");

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? "Request failed");
  }
  return body;
}
