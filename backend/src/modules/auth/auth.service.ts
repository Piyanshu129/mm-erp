import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma";
import { signAccessToken } from "../../lib/jwt";
import { generateRefreshToken, hashRefreshToken } from "../../lib/refreshToken";
import { env } from "../../config/env";
import { UnauthorizedError } from "../../lib/errors";

function refreshExpiryDate(): Date {
  const days = env.REFRESH_TOKEN_EXPIRES_IN_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function issueSession(userId: number, role: string, permissions: string[]) {
  const accessToken = signAccessToken({ userId, role, permissions });

  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashRefreshToken(refreshToken),
      userId,
      expiresAt: refreshExpiryDate(),
    },
  });

  return { accessToken, refreshToken };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const { accessToken, refreshToken } = await issueSession(user.id, user.role.name, user.permissions);

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role.name, permissions: user.permissions },
  };
}

export async function refresh(presentedToken: string) {
  const tokenHash = hashRefreshToken(presentedToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { include: { role: true } } },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
    throw new UnauthorizedError("Session expired, please log in again");
  }

  // Rotate: revoke the presented token and issue a fresh pair, so a stolen
  // refresh token that gets reused after the legitimate client rotates it
  // is immediately invalid.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const { accessToken, refreshToken } = await issueSession(
    stored.user.id,
    stored.user.role.name,
    stored.user.permissions
  );

  return {
    accessToken,
    refreshToken,
    user: {
      id: stored.user.id,
      name: stored.user.name,
      email: stored.user.email,
      role: stored.user.role.name,
      permissions: stored.user.permissions,
    },
  };
}

export async function logout(presentedToken: string) {
  const tokenHash = hashRefreshToken(presentedToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getCurrentUser(userId: number) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { role: true },
  });
  return { id: user.id, name: user.name, email: user.email, role: user.role.name, permissions: user.permissions };
}
