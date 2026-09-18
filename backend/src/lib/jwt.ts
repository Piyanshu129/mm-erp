import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessTokenPayload {
  userId: number;
  role: string;
  permissions: string[];
  type: "staff";
}

// permissions are embedded here rather than looked up fresh per request,
// same trade-off the existing `role` field already makes: a permission
// change takes effect the next time the user's access token is reissued
// (at most ~15 minutes, via the refresh flow), not instantly.
export function signAccessToken(payload: { userId: number; role: string; permissions: string[] }): string {
  return jwt.sign({ ...payload, type: "staff" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  if (payload.type !== "staff") throw new Error("Not a staff token");
  return payload;
}

// The employee self-service portal (punch-clock attendance) is a much
// lower-stakes surface than the admin dashboard — no money movement, no
// data mutation beyond "I'm here today" — so it deliberately skips the
// admin flow's refresh-token rotation and just issues one longer-lived
// token. An employee re-logs in at most about once a day.
export interface EmployeeTokenPayload {
  employeeId: number;
  type: "employee";
}

const EMPLOYEE_TOKEN_EXPIRES_IN = "12h";

export function signEmployeeToken(payload: { employeeId: number }): string {
  return jwt.sign({ ...payload, type: "employee" }, env.JWT_ACCESS_SECRET, {
    expiresIn: EMPLOYEE_TOKEN_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyEmployeeToken(token: string): EmployeeTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as EmployeeTokenPayload;
  if (payload.type !== "employee") throw new Error("Not an employee token");
  return payload;
}
