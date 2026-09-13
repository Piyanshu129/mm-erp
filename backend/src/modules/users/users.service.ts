import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";

export async function listUsers() {
  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { createdAt: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role.name,
    isActive: u.isActive,
    createdAt: u.createdAt,
  }));
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: string;
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
    },
    include: { role: true },
  });

  return { id: user.id, name: user.name, email: user.email, role: user.role.name, isActive: user.isActive };
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

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role.name,
    isActive: updated.isActive,
  };
}

export async function listRoles() {
  return prisma.role.findMany({ orderBy: { name: "asc" } });
}
