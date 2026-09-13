import { Request, Response } from "express";
import { z } from "zod";
import * as jobCardMediaService from "./jobCardMedia.service";
import { publicUrlFor } from "../../middleware/upload";
import { AppError } from "../../lib/errors";

export const MEDIA_ANGLES = [
  "FRONT",
  "REAR",
  "LEFT",
  "RIGHT",
  "INTERIOR",
  "DASHBOARD",
  "ENGINE_BAY",
  "DAMAGE",
  "WALKAROUND",
  "OTHER",
] as const;

export const mediaFieldsSchema = z.object({
  mediaType: z.enum(["PHOTO", "VIDEO"]),
  angle: z.enum(MEDIA_ANGLES).optional(),
});

export async function addMedia(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, "No file uploaded");
  const input = mediaFieldsSchema.parse(req.body);
  const url = publicUrlFor("job-cards", req.file.filename);
  const media = await jobCardMediaService.addMedia(
    Number(req.params.jobCardId),
    input.mediaType,
    input.angle,
    url
  );
  res.status(201).json({ media });
}

export async function removeMedia(req: Request, res: Response) {
  await jobCardMediaService.removeMedia(Number(req.params.jobCardId), Number(req.params.mediaId));
  res.status(204).send();
}
