import { Router } from "express";
import * as authController from "./auth.controller";
import { validateBody } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { asyncHandler } from "../../middleware/errorHandler";

export const authRouter = Router();

authRouter.post(
  "/login",
  validateBody(authController.loginSchema),
  asyncHandler(authController.login)
);
authRouter.post("/refresh", asyncHandler(authController.refresh));
authRouter.post("/logout", asyncHandler(authController.logout));
authRouter.get("/me", authenticate, asyncHandler(authController.me));
