import fs from "fs";
import path from "path";
import multer from "multer";
import { AppError } from "../lib/errors";

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_MEDIA_MIME_TYPES = new Set([
  ...ALLOWED_IMAGE_MIME_TYPES,
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

function storageFor(subfolder: string) {
  const dir = path.join(UPLOAD_ROOT, subfolder);
  fs.mkdirSync(dir, { recursive: true });

  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${ext}`);
    },
  });
}

function fileFilterFor(allowed: Set<string>, message: string) {
  return (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!allowed.has(file.mimetype)) {
      cb(new AppError(400, message));
      return;
    }
    cb(null, true);
  };
}

export function uploadImage(subfolder: string) {
  return multer({
    storage: storageFor(subfolder),
    fileFilter: fileFilterFor(ALLOWED_IMAGE_MIME_TYPES, "Only JPEG, PNG or WEBP photos are allowed"),
    limits: { fileSize: 5 * 1024 * 1024 },
  });
}

// Job card inspection media: same photo formats, plus common phone video
// formats for the 360°/walk-around clip. Videos get a much higher cap.
export function uploadMedia(subfolder: string) {
  return multer({
    storage: storageFor(subfolder),
    fileFilter: fileFilterFor(
      ALLOWED_MEDIA_MIME_TYPES,
      "Only JPEG, PNG, WEBP photos or MP4/MOV/WEBM videos are allowed"
    ),
    limits: { fileSize: 50 * 1024 * 1024 },
  });
}

export function publicUrlFor(subfolder: string, filename: string): string {
  return `/uploads/${subfolder}/${filename}`;
}
