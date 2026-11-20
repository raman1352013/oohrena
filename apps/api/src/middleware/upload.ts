import multer from "multer";
import type { Request } from "express";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_LISTING } from "@oohrena/shared";
import { Vendor } from "../models/foundation.js";
import { forbidden, notFound } from "../lib/errors.js";

/** In-memory multipart parsing; type and size are re-checked by signature in saveUpload. */
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS_PER_LISTING, fields: 20 } });

/** The vendor organisation for the signed-in vendor user (server-side scoping: never from the URL). */
export async function currentVendor(req: Request) {
  if (req.user?.role !== "vendor" || !req.user.orgId) throw forbidden();
  const v = await Vendor.findById(req.user.orgId).lean();
  if (!v) throw notFound("Vendor profile not found");
  return v;
}
