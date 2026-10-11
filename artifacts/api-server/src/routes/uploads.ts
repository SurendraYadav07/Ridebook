import express, { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { authenticate } from "../middleware/auth";
import { getUploadUrl, getDownloadUrl, isStorageConfigured, getStorageMetadata } from "../lib/storage";

const router: IRouter = Router();

// Allowed MIME types for driver KYC and app documents
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const isProduction = (process.env.NODE_ENV ?? "production") === "production";

// Local disk fallback directory for dev environments
const LOCAL_STORAGE_DIR = path.join(process.cwd(), ".uploads");
if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
  try {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  } catch {}
}

function resolveLocalUploadPath(relativeKey: string): { key: string; path: string } | null {
  const root = path.resolve(LOCAL_STORAGE_DIR);
  const target = path.resolve(root, relativeKey);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return null;
  return { key: relative, path: target };
}

const localUploadBody = express.raw({
  type: (req) => ALLOWED_MIME_TYPES.has((req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase()),
  limit: MAX_FILE_SIZE_BYTES,
});

// ---------------------------------------------------------------------------
// GET /uploads/config — Check storage readiness
// ---------------------------------------------------------------------------
router.get("/uploads/config", authenticate, (req: Request, res: Response) => {
  res.status(200).json({
    storage: getStorageMetadata(),
    maxSizeBytes: MAX_FILE_SIZE_BYTES,
    allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
  });
});

// ---------------------------------------------------------------------------
// POST /uploads/presign — Generate presigned upload URL & storage key
// ---------------------------------------------------------------------------
router.post("/uploads/presign", authenticate, async (req: Request, res: Response) => {
  const { filename, contentType, fileSize, folder = "driver-documents" } = req.body;

  if (!filename || typeof filename !== "string" || !contentType || typeof contentType !== "string") {
    res.status(400).json({
      error: "invalid_request",
      message: "filename and contentType strings are required.",
    });
    return;
  }

  const normalizedContentType = contentType.toLowerCase().split(";")[0].trim();
  if (!ALLOWED_MIME_TYPES.has(normalizedContentType)) {
    res.status(400).json({
      error: "invalid_mime_type",
      message: `Disallowed file type: ${contentType}. Allowed types: JPEG, PNG, WEBP, HEIC, and PDF.`,
      allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
    });
    return;
  }

  if (fileSize !== undefined && (!Number.isFinite(fileSize) || typeof fileSize !== "number" || fileSize < 1 || fileSize > MAX_FILE_SIZE_BYTES)) {
    res.status(400).json({
      error: "file_too_large",
      message: `File size exceeds 10MB limit. Provided size: ${Math.round(fileSize / (1024 * 1024))}MB.`,
      maxSizeBytes: MAX_FILE_SIZE_BYTES,
    });
    return;
  }

  const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "");
  const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  const randomSuffix = crypto.randomUUID().slice(0, 8);
  const storageKey = `${sanitizedFolder}/${req.auth!.userId}/${Date.now()}-${randomSuffix}-${sanitizedFilename}`;

  try {
    const presigned = await getUploadUrl(storageKey, normalizedContentType, 900);

    res.status(200).json({
      uploadUrl: presigned.uploadUrl,
      method: presigned.method,
      storageKey: presigned.key,
      headers: presigned.headers,
      isLocalFallback: presigned.isLocalFallback,
      expiresInSeconds: presigned.expiresInSeconds,
    });
  } catch (err: any) {
    res.status(500).json({
      error: "storage_error",
      message: err?.message || "Failed to generate presigned upload URL.",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /uploads/download-url — Retrieve presigned download URL
// ---------------------------------------------------------------------------
router.post("/uploads/download-url", authenticate, async (req: Request, res: Response) => {
  const { storageKey } = req.body;
  if (!storageKey || typeof storageKey !== "string") {
    res.status(400).json({
      error: "invalid_request",
      message: "storageKey string is required.",
    });
    return;
  }
  if (req.auth!.role !== "admin" && !storageKey.split(/[\\/]/).includes(req.auth!.userId)) {
    res.status(404).json({ error: "not_found", message: "File not found." });
    return;
  }

  try {
    const downloadUrl = await getDownloadUrl(storageKey, 3600);
    res.status(200).json({
      storageKey,
      downloadUrl,
    });
  } catch (err: any) {
    res.status(500).json({
      error: "storage_error",
      message: err?.message || "Failed to generate download URL.",
    });
  }
});

// ---------------------------------------------------------------------------
// Local Development Storage Handlers (Fallback when S3 is unconfigured)
// ---------------------------------------------------------------------------
router.put("/uploads/local/*splat", authenticate, localUploadBody, (req: Request, res: Response) => {
  if (isProduction) {
    res.sendStatus(404);
    return;
  }
  const relKey = (req.params as any).splat || "file";
  const resolved = resolveLocalUploadPath(String(relKey));
  if (!resolved || !String(relKey).split(/[\\/]/).includes(req.auth!.userId)) {
    res.status(400).json({ error: "invalid_path", message: "Invalid upload path." });
    return;
  }
  const { key: safePath, path: fullPath } = resolved;

  try {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (body.length === 0 || body.length > MAX_FILE_SIZE_BYTES) {
      res.status(body.length > MAX_FILE_SIZE_BYTES ? 413 : 400).json({ error: "invalid_upload", message: "Upload must contain between 1 byte and 10 MB." });
      return;
    }
    fs.writeFileSync(fullPath, body, { flag: "wx" });
    res.status(200).json({ status: "uploaded", key: safePath });
  } catch (err: any) {
    res.status(500).json({ error: "fs_error", message: err.message });
  }
});

router.get("/uploads/local/*splat", authenticate, (req: Request, res: Response) => {
  if (isProduction) {
    res.sendStatus(404);
    return;
  }
  const relKey = (req.params as any).splat || "file";
  const resolved = resolveLocalUploadPath(String(relKey));
  if (!resolved || (req.auth!.role !== "admin" && !String(relKey).split(/[\\/]/).includes(req.auth!.userId))) {
    res.status(404).json({ error: "not_found", message: "File not found." });
    return;
  }
  const { path: fullPath } = resolved;

  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: "not_found", message: "File not found." });
    return;
  }

  res.sendFile(fullPath);
});

export default router;
