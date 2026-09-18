import { Router } from "express";
import * as employeePortalController from "./employeePortal.controller";
import { validateBody } from "../../middleware/validate";
import { authenticateEmployee } from "../../middleware/authenticateEmployee";
import { asyncHandler } from "../../middleware/errorHandler";
import { uploadImage } from "../../middleware/upload";

export const employeePortalRouter = Router();

const uploadSelfie = uploadImage("employee-selfies").single("selfie");

employeePortalRouter.post(
  "/login",
  validateBody(employeePortalController.loginSchema),
  asyncHandler(employeePortalController.login)
);

employeePortalRouter.use(authenticateEmployee);

employeePortalRouter.get("/me", asyncHandler(employeePortalController.me));
employeePortalRouter.get("/attendance/today", asyncHandler(employeePortalController.today));
employeePortalRouter.get("/attendance/summary", asyncHandler(employeePortalController.summary));
employeePortalRouter.post("/attendance/punch", uploadSelfie, asyncHandler(employeePortalController.punch));
