import { Request, Response } from "express";
import { z } from "zod";
import * as usersService from "./users.service";
import { PERMISSIONS } from "../../lib/permissions";

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "STORE_USER"]),
  permissions: z.array(z.enum(PERMISSIONS)).optional(),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const updateUserPermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSIONS)),
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

export async function roles(_req: Request, res: Response) {
  const list = await usersService.listRoles();
  res.json({ roles: list });
}

export async function permissions(_req: Request, res: Response) {
  res.json({ permissions: PERMISSIONS });
}
