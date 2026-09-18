import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";

function shape(u: { id: number; name: string; email: string; isActive: boolean; permissions: string[]; role: { name: string } }) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role.name,
    // Meaningless for ADMIN (always a superuser) but harmless to return —
    // the frontend only shows/edits this when role is STORE_USER.
    permissions: u.permissions,
    isActive: u.isActive,
  };
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { createdAt: "asc" },
  });
  return users.map(shape);
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: string;
  permissions?: string[];
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError("A user with this email already exists");
  }

  const role = await prisma.role.findUnique({ where: { name: input.role } });
  if (!role) {
    throw new NotFoundError(`Unknown role: ${input.role}`);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      roleId: role.id,
      // ADMIN's permissions list is stored but never consulted (see
      // requirePermission) — only STORE_USER grants actually gate anything.
      permissions: input.role === "STORE_USER" ? (input.permissions ?? []) : [],
    },
    include: { role: true },
  });

  return shape(user);
}

export async function updateUserPermissions(userId: number, permissions: string[]) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!user) throw new NotFoundError("User not found");
  if (user.role.name !== "STORE_USER") {
    throw new ConflictError("Only Store User accounts have editable permissions — Admin already has full access");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { permissions },
    include: { role: true },
  });
  return shape(updated);
}

export async function updateUserStatus(userId: number, isActive: boolean) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
    include: { role: true },
  });

  // Deactivating a user must kill any session they're already holding.
  if (!isActive) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  return shape(updated);
}

export async function listRoles() {
  return prisma.role.findMany({ orderBy: { name: "asc" } });
}
