import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { s3, BUCKET, PutObjectCommand } from "../db/s3.js";
import { ah } from "../middleware/asyncHandler.js";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

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

  const ext = req.file.mimetype.split("/")[1];
  const key = `uploads/${req.userId}/${randomUUID()}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    })
  );

  res.status(201).json({ url: `/media/${BUCKET}/${key}` });
}));
