import mongoose, { Schema } from "mongoose";
import { KYC_DOC_TYPES } from "@oohrena/shared";

const vendorDocumentSchema = new Schema(
  {
    vendorId: { type: String, required: true, index: true },
    type: { type: String, enum: KYC_DOC_TYPES, required: true },
    fileId: { type: String, required: true },
    status: { type: String, enum: ["uploaded", "verified", "rejected"], default: "uploaded" },
    verifiedBy: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    uploadedBy: { type: String, required: true },
  },
  { timestamps: { createdAt: "uploadedAt", updatedAt: "updatedAt" }, versionKey: false },
);
export const VendorDocument = mongoose.model("VendorDocument", vendorDocumentSchema, "vendor_documents");

/** Bank details: account number encrypted at rest (AES-256-GCM); only the last 4 digits are stored in clear. */
const vendorBankSchema = new Schema(
  {
    vendorId: { type: String, required: true, unique: true },
    accountName: { type: String, required: true },
    accountNoEnc: { type: String, required: true, select: false },
    accountLast4: { type: String, required: true },
    ifsc: { type: String, required: true },
    bankName: { type: String, default: null },
    verifiedBy: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);
export const VendorBank = mongoose.model("VendorBank", vendorBankSchema, "vendor_bank");
