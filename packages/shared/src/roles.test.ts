import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLES, can, scopeFor } from "./roles";
import { formatId, formatInventoryId, quoteVersionId } from "./ids";
import { registerClientInput } from "./schemas/auth";

describe("role-permission matrix", () => {
  it("only references the five MVP roles", () => {
    for (const grants of Object.values(PERMISSIONS)) for (const r of Object.keys(grants)) expect(ROLES).toContain(r);
  });
  it("keeps admin-only and finance-only powers separated (maker-checker)", () => {
    expect(can("admin", "finance.manage")).toBe(false);
    expect(can("finance", "finance.manage")).toBe(true);
    expect(can("vendor", "vendors.kyc.decide")).toBe(false);
    expect(can("client", "audit.read")).toBe(false);
    expect(scopeFor("vendor", "workorders.read")).toBe("assigned");
  });
});

describe("ID formats", () => {
  it("matches the MVP document", () => {
    expect(formatId("USR", 1, 2026)).toBe("USR-000001");
    expect(formatId("LD", 42, 2026)).toBe("LD-2026-000042");
    expect(quoteVersionId(formatId("QT", 1, 2026), 2)).toBe("QT-2026-000001-V2");
    expect(formatInventoryId("hrd", 7)).toBe("INV-HRD-000007");
  });
});

describe("registration contract", () => {
  it("normalises email/GSTIN and enforces the password policy", () => {
    const r = registerClientInput.safeParse({ fullName: "A", email: " A@B.COM ", mobile: "+919876543210", password: "Abcdefgh1!", companyName: "C", gstin: "27aapfu0939f1zv", acceptTerms: true });
    expect(r.success && r.data.email).toBe("a@b.com");
    expect(r.success && r.data.gstin).toBe("27AAPFU0939F1ZV");
    expect(registerClientInput.safeParse({ fullName: "A", email: "a@b.com", mobile: "+919876543210", password: "password", companyName: "C", acceptTerms: true }).success).toBe(false);
  });
});
