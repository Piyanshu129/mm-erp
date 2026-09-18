import { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";

// ADMIN is always a superuser and bypasses this check entirely — permission
// grants only ever scope down a STORE_USER account. Passing more than one
// permission means "any of these" (e.g. a lookup route shared by two
// workflows), not "all of these".
export function requirePermission(...allowed: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    if (req.user.role === "ADMIN") {
      next();
      return;
    }
    if (allowed.some((p) => req.user!.permissions.includes(p))) {
      next();
      return;
    }
    throw new ForbiddenError("You do not have permission to access this");
  };
}
