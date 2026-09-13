import fs from "fs";
import path from "path";
import multer from "multer";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { AppError } from "../lib/errors";
import { env, R2_CONFIGURED } from "../config/env";

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_MEDIA_MIME_TYPES = new Set([
  ...ALLOWED_IMAGE_MIME_TYPES,
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

function uniqueFilename(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase();
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${unique}${ext}`;
}

function diskStorageFor(subfolder: string): multer.StorageEngine {
  const dir = path.join(UPLOAD_ROOT, subfolder);
  fs.mkdirSync(dir, { recursive: true });

  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => cb(null, uniqueFilename(file.originalname)),
  });
}

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3Client;
}

// Streams the upload straight to R2 via a multipart-capable Upload (so a
// 50MB inspection video isn't buffered whole in memory first) — used
// whenever the host has no persistent disk (see config/env.ts's
// R2_CONFIGURED). `file.filename` is set to match diskStorage's shape, so
// publicUrlFor and every caller stay identical regardless of backend.
function s3StorageFor(subfolder: string): multer.StorageEngine {
  return {
    _handleFile(_req, file, cb) {
      const filename = uniqueFilename(file.originalname);
      const key = `${subfolder}/${filename}`;

      new Upload({
        client: getS3Client(),
        params: {
          Bucket: env.R2_BUCKET_NAME,
          Key: key,
          Body: file.stream,
          ContentType: file.mimetype,
        },
      })
        .done()
        .then(() => cb(null, { filename } as any))
        .catch(cb);
    },
    _removeFile(_req, _file, cb) {
      cb(null);
    },
  };
}

function storageFor(subfolder: string): multer.StorageEngine {
  return R2_CONFIGURED ? s3StorageFor(subfolder) : diskStorageFor(subfolder);
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
  if (R2_CONFIGURED) {
    return `${env.R2_PUBLIC_URL}/${subfolder}/${filename}`;
  }
  return `/uploads/${subfolder}/${filename}`;
}
