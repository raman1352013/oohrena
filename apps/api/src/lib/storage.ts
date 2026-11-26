import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import mongoose from "mongoose";
import type { Config, FileStorage } from "../config.js";
import { StoredFile } from "../models/files.js";
import { badRequest, notFound } from "./errors.js";
import { logger } from "./logger.js";
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
  kind: "kyc_document" | "inventory_photo" | "proof" | "payment_proof" | "creative";
  allowed: readonly string[];
  maxBytes: number;
  encryptAtRest: boolean;
  ownerUserId: string;
  vendorId?: string;
  originalName?: string;
};

let s3Client: S3Client | null = null;
function getS3Client(cfg: Config): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: cfg.S3_REGION || "auto",
      ...(cfg.S3_ENDPOINT ? { endpoint: cfg.S3_ENDPOINT } : {}),
      ...(cfg.S3_ACCESS_KEY_ID && cfg.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: cfg.S3_ACCESS_KEY_ID,
              secretAccessKey: cfg.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }
  return s3Client;
}

/** GridFS bucket in the app database: uploads survive redeploys without a separate storage account. */
const gridfs = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: "uploads" });

async function writeBytes(cfg: Config, where: FileStorage, key: string, data: Buffer, mime: string) {
  if (where === "s3") {
    await getS3Client(cfg).send(
      new PutObjectCommand({ Bucket: cfg.S3_BUCKET, Key: key, Body: data, ContentType: mime, ServerSideEncryption: "AES256" }),
    );
  } else if (where === "mongo") {
    await new Promise<void>((resolve, reject) => {
      gridfs().openUploadStream(key, { metadata: { mime } }).on("finish", () => resolve()).on("error", reject).end(data);
    });
  } else {
    const abs = path.resolve(cfg.UPLOAD_DIR, key);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, data, { flag: "wx" });
  }
}

/** True when the backend says the object doesn't exist (disk wiped, GridFS file or S3 key gone). */
function isMissing(e: unknown): boolean {
  const err = e as { code?: unknown; name?: unknown; message?: unknown; $metadata?: { httpStatusCode?: number } };
  return (
    err?.code === "ENOENT" ||
    err?.name === "NoSuchKey" ||
    err?.$metadata?.httpStatusCode === 404 ||
    (typeof err?.message === "string" && err.message.startsWith("FileNotFound"))
  );
}

async function readBytes(cfg: Config, where: FileStorage, key: string): Promise<Buffer> {
  try {
    return await readBytesFrom(cfg, where, key);
  } catch (e) {
    if (!isMissing(e)) throw e;
    // The metadata row outlived its bytes (e.g. files saved to a host disk that a redeploy wiped).
    logger.warn({ storage: where, key }, "stored file bytes are missing");
    throw notFound("File not found");
  }
}

async function readBytesFrom(cfg: Config, where: FileStorage, key: string): Promise<Buffer> {
  if (where === "s3") {
    const res = await getS3Client(cfg).send(new GetObjectCommand({ Bucket: cfg.S3_BUCKET, Key: key }));
    return Buffer.from((await res.Body?.transformToByteArray()) ?? []);
  }
  if (where === "mongo") {
    const chunks: Buffer[] = [];
    for await (const c of gridfs().openDownloadStreamByName(key)) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  }
  return readFile(path.resolve(cfg.UPLOAD_DIR, key));
}

/**
 * Stores an upload in the configured private storage (cfg.fileStorage: S3/R2, MongoDB GridFS or local
 * UPLOAD_DIR) and records it in `files`, including which backend holds it. Never served statically.
 */
export async function saveUpload(cfg: Config, buf: Buffer, o: SaveOpts) {
  if (!buf.length) throw badRequest("The file is empty");
  if (buf.length > o.maxBytes) throw badRequest(`File is too large (max ${Math.round(o.maxBytes / 1024 / 1024)} MB)`);
  const mime = sniffMime(buf);
  if (!mime || !o.allowed.includes(mime)) throw badRequest(`Unsupported file type. Allowed: ${o.allowed.map((m) => m.split("/")[1]!.toUpperCase()).join(", ")}`);
  const id = randomUUID();
  const rel = `${o.kind}/${id}${o.encryptAtRest ? ".enc" : ""}`;
  const data = o.encryptAtRest ? encrypt(cfg.encryptionKey, buf) : buf;

  await writeBytes(cfg, cfg.fileStorage, rel, data, mime);

  const sha256 = createHash("sha256").update(buf).digest("hex");
  const doc = await StoredFile.create({
    _id: id, kind: o.kind, mime, size: buf.length, sha256, storagePath: rel, storage: cfg.fileStorage, encrypted: o.encryptAtRest,
    ownerUserId: o.ownerUserId, vendorId: o.vendorId ?? null, originalName: o.originalName?.slice(0, 200) ?? null,
  });
  return doc.toObject();
}

/** Reads from the backend the file was saved to, so switching FILE_STORAGE never orphans older files. */
export async function readUpload(cfg: Config, f: { storagePath: string; encrypted: boolean; storage?: string | null }) {
  const raw = await readBytes(cfg, (f.storage as FileStorage | null | undefined) ?? "disk", f.storagePath);
  return f.encrypted ? decrypt(cfg.encryptionKey, raw) : raw;
}
