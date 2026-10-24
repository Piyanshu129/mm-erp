import { Request, Response } from "express";
import { z } from "zod";
import * as usersService from "./users.service";
import { PERMISSIONS, PERMISSION_ACTIONS, isValidGrant } from "../../lib/permissions";

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "STORE_USER"]),
  permissions: z.array(z.string().refine(isValidGrant, "Unknown permission")).optional(),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const updateUserPermissionsSchema = z.object({
  permissions: z.array(z.string().refine(isValidGrant, "Unknown permission")),
});

export async function list(_req: Request, res: Response) {
  const users = await usersService.listUsers();
  res.json({ users });
}

export async function create(req: Request, res: Response) {
  const input = req.body as z.infer<typeof createUserSchema>;
  const user = await usersService.createUser(input);
  res.status(201).json({ user });
}

export async function updateStatus(req: Request, res: Response) {
  const userId = Number(req.params.id);
  const { isActive } = req.body as z.infer<typeof updateUserStatusSchema>;
  const user = await usersService.updateUserStatus(userId, isActive);
  res.json({ user });
}

export async function updatePermissions(req: Request, res: Response) {
  const userId = Number(req.params.id);
  const { permissions } = req.body as z.infer<typeof updateUserPermissionsSchema>;
  const user = await usersService.updateUserPermissions(userId, permissions);
  res.json({ user });
}

export async function remove(req: Request, res: Response) {
  await usersService.deleteUser(Number(req.params.id), req.user!.id);
  res.status(204).send();
}

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// Admin sets a new password for a user who forgot theirs.
export async function resetPassword(req: Request, res: Response) {
  const { password } = req.body as z.infer<typeof resetPasswordSchema>;
  await usersService.setPassword(Number(req.params.id), password);
  res.status(204).send();
}

export async function roles(_req: Request, res: Response) {
  const list = await usersService.listRoles();
  res.json({ roles: list });
}

export async function permissions(_req: Request, res: Response) {
  res.json({ permissions: PERMISSIONS, actions: PERMISSION_ACTIONS });
}
