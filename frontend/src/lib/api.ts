const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
// Uploaded files (item photos, etc.) are served from the API's origin, not under /api.
const ASSET_ORIGIN = API_URL.replace(/\/api\/?$/, "");

// The backend returns a relative "/uploads/..." path in local dev, or an
// already-absolute R2 URL in production (see backend/src/middleware/upload.ts) —
// this is the one place that needs to know the difference.
export function assetUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${ASSET_ORIGIN}${url}`;
}

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseJson(res: Response) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Every call to a protected endpoint gets one automatic silent-refresh retry
// on a 401 (the access token lives only in memory and expires quickly by
// design), so a page reload or a stale token doesn't force a re-login.
export async function apiFetch(path: string, options: RequestInit = {}, isRetry = false): Promise<any> {
  const headers = new Headers(options.headers);
  // FormData bodies (file uploads) must NOT get an explicit Content-Type —
  // the browser sets the multipart boundary itself when it's left unset.
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && !isRetry && path !== "/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch(path, options, true);
    }
  }

  const body = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? "Request failed");
  }
  return body;
}

export async function tryRefresh(): Promise<boolean> {
  try {
    const body = await apiFetch("/auth/refresh", { method: "POST" }, true);
    setAccessToken(body.accessToken);
    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
}
