import { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";
import { actionForMethod, deniedMessage, grants } from "../lib/permissions";

// ADMIN is always a superuser and bypasses this check entirely — permission
// grants only ever scope down a STORE_USER account. Passing more than one
// module means "any of these" (e.g. a lookup route shared by two
// workflows), not "all of these".
//
// Grants are per module or per action within one (lib/permissions.ts): the
// action needed is taken from the request method — viewing (GET), adding
// (POST), editing (PATCH/PUT) or deleting (DELETE).
export function requirePermission(...allowed: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    if (req.user.role === "ADMIN") {
      next();
      return;
    }
    const action = actionForMethod(req.method);
    if (allowed.some((module) => grants(req.user!.permissions, module, action))) {
      next();
      return;
    }
    throw new ForbiddenError(deniedMessage(allowed, action));
  };
}
