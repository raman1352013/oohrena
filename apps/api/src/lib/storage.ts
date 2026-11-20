import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Config } from "../config.js";
import { StoredFile } from "../models/files.js";
import { badRequest } from "./errors.js";
import { decrypt, encrypt } from "./crypto.js";

/** Detects the real file type from its first bytes; the client's declared type and extension are ignored. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 4 && buf.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.length >= 12 && buf.subarray(4, 8).toString("latin1") === "ftyp") return "video/mp4";
  return null;
}

export type SaveOpts = {
  kind: "kyc_document" | "inventory_photo" | "proof" | "payment_proof";
  allowed: readonly string[];
  maxBytes: number;
  encryptAtRest: boolean;
  ownerUserId: string;
  vendorId?: string;
  originalName?: string;
};

/**
 * Stores an upload in the private UPLOAD_DIR (never served statically) and records it in `files`.
 * Local disk is the MVP backend; swap writeFile/readFile for object storage without changing callers.
 */
export async function saveUpload(cfg: Config, buf: Buffer, o: SaveOpts) {
  if (!buf.length) throw badRequest("The file is empty");
  if (buf.length > o.maxBytes) throw badRequest(`File is too large (max ${Math.round(o.maxBytes / 1024 / 1024)} MB)`);
  const mime = sniffMime(buf);
  if (!mime || !o.allowed.includes(mime)) throw badRequest(`Unsupported file type. Allowed: ${o.allowed.map((m) => m.split("/")[1]!.toUpperCase()).join(", ")}`);
  const id = randomUUID();
  const rel = path.join(o.kind, `${id}${o.encryptAtRest ? ".enc" : ""}`);
  const abs = path.resolve(cfg.UPLOAD_DIR, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, o.encryptAtRest ? encrypt(cfg.encryptionKey, buf) : buf, { flag: "wx" });
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const doc = await StoredFile.create({
    _id: id, kind: o.kind, mime, size: buf.length, sha256, storagePath: rel, encrypted: o.encryptAtRest,
    ownerUserId: o.ownerUserId, vendorId: o.vendorId ?? null, originalName: o.originalName?.slice(0, 200) ?? null,
  });
  return doc.toObject();
}

export async function readUpload(cfg: Config, f: { storagePath: string; encrypted: boolean }) {
  const raw = await readFile(path.resolve(cfg.UPLOAD_DIR, f.storagePath));
  return f.encrypted ? decrypt(cfg.encryptionKey, raw) : raw;
}
