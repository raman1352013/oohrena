import { type Role, isStaffRole } from "@oohrena/shared";
import type { Config } from "./config.js";
import { nextId } from "./lib/ids.js";
import { audit } from "./lib/audit.js";
import { Client, Consent, GrowthPartner, User, Vendor } from "./models/foundation.js";
import { hashPassword } from "./services/session.js";
import { consentDocs } from "./routes/auth.js";
import { saveUpload } from "./lib/storage.js";
import { VendorDocument } from "./models/vendor-kyc.js";

/** Minimal valid PDF, so an approved test vendor has KYC documents on file like a real one. */
const SAMPLE_PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

type Seed = { email: string; fullName: string; mobile: string; role: Role; kyc?: "approved" | "pending"; pan?: string };

/** One named test account per role (+ a second client and a KYC-pending vendor for isolation tests). */
export const TEST_ACCOUNTS: Seed[] = [
  { email: "admin@test.oohrena.local", fullName: "Test Admin", mobile: "+919000000001", role: "admin" },
  { email: "finance@test.oohrena.local", fullName: "Test Finance Checker", mobile: "+919000000002", role: "finance" },
  // A second Finance user so maker-checker can be exercised (the maker can never verify their own entry).
  { email: "finance2@test.oohrena.local", fullName: "Test Finance Checker B", mobile: "+919000000008", role: "finance" },
  { email: "client@test.oohrena.local", fullName: "Test Client A", mobile: "+919000000003", role: "client" },
  { email: "client2@test.oohrena.local", fullName: "Test Client B", mobile: "+919000000004", role: "client" },
  { email: "vendor@test.oohrena.local", fullName: "Test Vendor A", mobile: "+919000000005", role: "vendor", kyc: "approved", pan: "ABCDE1001F" },
  { email: "vendor2@test.oohrena.local", fullName: "Test Vendor B", mobile: "+919000000006", role: "vendor", kyc: "pending", pan: "ABCDE1002F" },
  { email: "partner@test.oohrena.local", fullName: "Test Growth Partner", mobile: "+919000000007", role: "growth_partner" },
  { email: "verifier@test.oohrena.local", fullName: "Test Verifier", mobile: "+919000000009", role: "verifier" },
  { email: "ops@test.oohrena.local", fullName: "Test Operations", mobile: "+919000000010", role: "ops" },
  { email: "auditor@test.oohrena.local", fullName: "Test Auditor", mobile: "+919000000011", role: "auditor" },
];

export async function seedTestAccounts(cfg: Config, password: string, log: (m: string) => void = console.log) {
  if (cfg.NODE_ENV === "production") throw new Error("Refusing to seed test accounts into production");
  const hash = await hashPassword(cfg, password);
  for (const a of TEST_ACCOUNTS) {
    if (await User.exists({ email: a.email })) {
      log(`exists  ${a.role.padEnd(15)} ${a.email}`);
      continue;
    }
    const userId = await nextId("USR");
    let orgId: string | null = null;
    if (a.role === "client") {
      orgId = await nextId("CLT");
      await Client.create({ _id: orgId, userId, companyName: `${a.fullName} Pvt Ltd` });
    } else if (a.role === "vendor") {
      orgId = await nextId("VND");
      const approved = a.kyc === "approved";
      await Vendor.create({
        _id: orgId, userId, legalName: `${a.fullName} Media`, pan: a.pan, city: "Gwalior",
        kycStatus: a.kyc, approvedBy: approved ? "seed" : null, approvedAt: approved ? new Date() : null,
      });
      if (approved) {
        for (const type of ["pan", "gst"] as const) {
          const f = await saveUpload(cfg, SAMPLE_PDF, {
            kind: "kyc_document", allowed: ["application/pdf"], maxBytes: 1024 * 1024, encryptAtRest: true,
            ownerUserId: userId, vendorId: orgId, originalName: `${type}-sample.pdf`,
          });
          await VendorDocument.create({ vendorId: orgId, type, fileId: f._id, status: "verified", verifiedBy: "seed", verifiedAt: new Date(), uploadedBy: userId });
        }
      }
    } else if (a.role === "growth_partner") {
      orgId = await nextId("GP");
      await GrowthPartner.create({ _id: orgId, userId, name: a.fullName, city: "Gwalior" });
    }
    await User.create({ _id: userId, email: a.email, mobile: a.mobile, fullName: a.fullName, passwordHash: hash, role: a.role, isStaff: isStaffRole(a.role), orgId, createdBy: "seed", emailVerifiedAt: new Date() });
    await Consent.create(consentDocs(userId, "seed"));
    await audit(null, { action: "seed.user.create", entity: "user", entityId: userId, after: { role: a.role, email: a.email }, userId: null, role: "system" });
    log(`created ${a.role.padEnd(15)} ${a.email} (${userId}${orgId ? ` / ${orgId}` : ""})`);
  }
}
