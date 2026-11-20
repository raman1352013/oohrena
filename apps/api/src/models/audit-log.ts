import mongoose, { Schema } from "mongoose";

/**
 * Append-only audit trail (Modules 3, 9, 10).
 * App-level: every update/delete/replace path through Mongoose throws.
 * DB-level: run scripts/mongo-app-role.js so the app's DB user can only insert/find here.
 */
const auditLogSchema = new Schema(
  {
    at: { type: Date, required: true, default: () => new Date(), immutable: true },
    userId: { type: String, default: null, immutable: true }, // null = system / anonymous
    role: { type: String, default: null, immutable: true },
    action: { type: String, required: true, immutable: true }, // e.g. auth.login, user.role.assign
    entity: { type: String, required: true, immutable: true }, // e.g. user, client, vendor
    entityId: { type: String, default: null, immutable: true },
    before: { type: Schema.Types.Mixed, default: null, immutable: true },
    after: { type: Schema.Types.Mixed, default: null, immutable: true },
    reason: { type: String, default: null, immutable: true },
    ip: { type: String, default: null, immutable: true },
    userAgent: { type: String, default: null, immutable: true },
  },
  { versionKey: false },
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ userId: 1, at: -1 });
auditLogSchema.index({ entity: 1, entityId: 1, at: -1 });
auditLogSchema.index({ action: 1, at: -1 });

const APPEND_ONLY = "Audit log is append-only";
const blocked = [
  "updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace",
  "deleteOne", "deleteMany", "findOneAndDelete",
] as const;
for (const op of blocked) {
  auditLogSchema.pre(op, function () {
    throw new Error(APPEND_ONLY);
  });
}
auditLogSchema.pre("save", function () {
  if (!this.isNew) throw new Error(APPEND_ONLY);
});
auditLogSchema.pre("deleteOne", { document: true, query: false }, function () {
  throw new Error(APPEND_ONLY);
});
auditLogSchema.pre("bulkWrite", function () {
  throw new Error(APPEND_ONLY);
});

export const AuditLog = mongoose.model("AuditLog", auditLogSchema, "audit_logs");
