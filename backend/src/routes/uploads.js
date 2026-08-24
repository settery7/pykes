import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { s3, BUCKET, PutObjectCommand } from "../db/s3.js";
import { ah } from "../middleware/asyncHandler.js";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
// Post cards cap display at 420px tall; 1600px on the long side is generous
// headroom for retina/full-width viewing without storing raw phone-camera
// photos (routinely 3000px+, several MB) as-is. withoutEnlargement so a
// small image is never upscaled.
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 82;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadsRouter = Router();

uploadsRouter.post("/", requireAuth, upload.single("file"), ah(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "file is required" });
  }
  if (!ACCEPTED_TYPES.has(req.file.mimetype)) {
    return res.status(400).json({ error: "Only PNG, JPEG, or WebP images are allowed" });
  }

  // Re-encoding to WebP regardless of the upload format is the actual win
  // here — smaller than equivalent-quality JPEG/PNG, and every browser this
  // app targets supports it. .rotate() with no args applies the source's
  // EXIF orientation (phone photos are routinely sideways without it) and
  // then, like the rest of sharp's output, strips metadata.
  const optimized = await sharp(req.file.buffer)
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  const key = `uploads/${req.userId}/${randomUUID()}.webp`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: optimized,
      ContentType: "image/webp",
    })
  );

  // Local MinIO is reached through Caddy's /media proxy (no public URL of
  // its own); a real provider like R2 has its own public URL — set
  // S3_PUBLIC_URL to it in that environment so this points there directly.
  const publicBase = process.env.S3_PUBLIC_URL || `/media/${BUCKET}`;
  res.status(201).json({ url: `${publicBase}/${key}` });
}));
