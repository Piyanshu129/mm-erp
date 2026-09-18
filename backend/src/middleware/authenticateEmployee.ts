import { NextFunction, Request, Response } from "express";
import { verifyEmployeeToken } from "../lib/jwt";
import { UnauthorizedError } from "../lib/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      employee?: { id: number };
    }
  }
}

// Deliberately separate from authenticate.ts's admin/staff check — an
// employee token only ever unlocks the employeePortal routes, never the
// main dashboard API, and vice versa (see lib/jwt.ts's "type" tag).
export function authenticateEmployee(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing access token");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyEmployeeToken(token);
    req.employee = { id: payload.employeeId };
    next();
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }
}
