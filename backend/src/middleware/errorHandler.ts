import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors";

const PRISMA_MESSAGES: Record<string, string> = {
  P2028: "Saving took too long and was cancelled, so nothing was saved — please try again",
  P2024: "The database is busy — please try again in a moment",
  P1001: "The database isn't reachable — make sure the servers are running, then try again",
  P2002: "That would duplicate an existing record — refresh the page and check before trying again",
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }

  if (err instanceof MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "Photo must be 5MB or smaller" : err.message;
    res.status(400).json({ error: message });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Database errors get a message that says what happened, instead of a
  // bare "Internal server error" (the full error is still logged below).
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(err);
    const message = PRISMA_MESSAGES[err.code];
    if (message) {
      res.status(err.code === "P2002" ? 409 : 503).json({ error: message });
      return;
    }
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error(err);
    res.status(503).json({ error: "The database isn't reachable — make sure the servers are running, then try again" });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Route not found" });
}

// Wraps an async route handler so a rejected promise reaches errorHandler
// instead of crashing the process (Express 4 doesn't do this automatically).
export function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
