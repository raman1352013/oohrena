import mongoose, { Schema } from "mongoose";

/** Metadata for every uploaded file. Bytes live in private storage; access always goes through an authorised route. */
const fileSchema = new Schema(
  {
    _id: { type: String, required: true }, // uuid
    kind: { type: String, enum: ["kyc_document", "inventory_photo", "proof", "payment_proof", "creative"], required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true, index: true },
    storagePath: { type: String, required: true },
    encrypted: { type: Boolean, required: true },
    ownerUserId: { type: String, required: true },
    vendorId: { type: String, default: null, index: true },
    originalName: { type: String, default: null },
    /** Server upload time — authoritative; client-supplied capture times are stored separately. */
    uploadedAt: { type: Date, default: () => new Date(), immutable: true },
  },
  { versionKey: false },
);
export const StoredFile = mongoose.model("StoredFile", fileSchema, "files");
