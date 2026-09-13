import crypto from "crypto";

// The opaque refresh token is a random value handed to the client; only its
// SHA-256 hash is ever persisted, so a database leak can't be replayed as a
// valid session.
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
