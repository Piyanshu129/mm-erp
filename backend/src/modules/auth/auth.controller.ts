import { Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import * as authService from "./auth.service";
import { UnauthorizedError } from "../../lib/errors";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// In production the frontend (Vercel) and backend (Render) are on different
// domains, so this cookie is sent on cross-site fetches — that requires
// SameSite=None (which in turn requires Secure). Local dev keeps Lax since
// localhost:3000 → localhost:4000 is same-site, and Lax needs no HTTPS.
function refreshCookieOptions() {
  const isProd = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    path: "/api/auth",
    maxAge: env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
  };
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as z.infer<typeof loginSchema>;
  const { accessToken, refreshToken, user } = await authService.login(email, password);

  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  res.json({ accessToken, user });
}

export async function refresh(req: Request, res: Response) {
  const presentedToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (!presentedToken) {
    throw new UnauthorizedError("No refresh token provided");
  }

  const { accessToken, refreshToken, user } = await authService.refresh(presentedToken);

  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  res.json({ accessToken, user });
}

export async function logout(req: Request, res: Response) {
  const presentedToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
  if (presentedToken) {
    await authService.logout(presentedToken);
  }
  res.clearCookie(env.REFRESH_COOKIE_NAME, { path: "/api/auth" });
  res.status(204).send();
}

export async function me(req: Request, res: Response) {
  const user = await authService.getCurrentUser(req.user!.id);
  res.json({ user });
}
