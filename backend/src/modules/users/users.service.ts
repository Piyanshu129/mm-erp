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
    where: { deletedAt: null },
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
  if (!user || user.deletedAt) throw new NotFoundError("User not found");
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
  if (!user || user.deletedAt) {
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

// Deletes a login. A user who never created anything is removed outright.
// One who has (job cards, purchases, invoices, ...) can't be, without those
// records losing who made them — so they're marked deleted instead: hidden
// from the list, unable to log in, sessions ended, and their email freed so
// it can be given to a new user.
export async function deleteUser(userId: number, actingUserId: number) {
  if (userId === actingUserId) throw new ConflictError("You can't delete your own login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: true,
      _count: {
        select: {
          purchases: true,
          supplierPayments: true,
          employeeAdvances: true,
          invoicePayments: true,
          estimates: true,
          jobCards: true,
          jobCardParts: true,
          invoices: true,
          attendanceEdits: true,
          odometerReadings: true,
        },
      },
    },
  });
  if (!user || user.deletedAt) throw new NotFoundError("User not found");

  if (user.role.name === "ADMIN") {
    const otherAdmins = await prisma.user.count({
      where: { id: { not: userId }, deletedAt: null, isActive: true, role: { name: "ADMIN" } },
    });
    if (otherAdmins === 0) throw new ConflictError("This is the only active admin — it can't be deleted");
  }

  const hasRecords = Object.values(user._count).some((n) => n > 0);
  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.deleteMany({ where: { userId } });
    if (hasRecords) {
      await tx.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), isActive: false, email: `deleted-${userId}-${Date.now()}@deleted.invalid` },
      });
    } else {
      await tx.user.delete({ where: { id: userId } });
    }
  });
}

export async function listRoles() {
  return prisma.role.findMany({ orderBy: { name: "asc" } });
}
