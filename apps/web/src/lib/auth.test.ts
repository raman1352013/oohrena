import { describe, expect, it } from "vitest";
import { ROLES } from "@oohrena/shared";
import { ROLE_HOME, isPublicPath, rolesFor, safeRedirect } from "./auth";

describe("workspace access rules", () => {
  it("lets each role open its own home workspace", () => {
    for (const role of ROLES) expect(rolesFor(ROLE_HOME[role])).toContain(role);
  });

  it("keeps clients and vendors out of admin pages, including nested ones", () => {
    expect(rolesFor("/admin")).toEqual(["admin", "verifier", "ops", "auditor"]);
    expect(rolesFor("/admin/leads/LD-2026-000001")).toEqual(["admin", "verifier", "ops", "auditor"]);
    expect(rolesFor("/admin")).not.toContain("client");
    expect(rolesFor("/admin")).not.toContain("vendor");
  });

  it("leaves public pages ungated and doesn't match look-alike prefixes", () => {
    expect(rolesFor("/")).toBeNull();
    expect(rolesFor("/login")).toBeNull();
    expect(rolesFor("/administrator")).toBeNull();
  });
});

describe("public pages (everything else needs sign-in)", () => {
  it("opens the landing page, marketplace and auth pages without a session", () => {
    for (const p of ["/", "/marketplace", "/login", "/register", "/forgot-password", "/terms"])
      expect(isPublicPath(p)).toBe(true);
    expect(isPublicPath("/marketplace/")).toBe(true);
  });

  it("treats workspaces and unknown pages as private", () => {
    for (const p of [
      "/admin",
      "/client",
      "/reports",
      "/print/quote/QT-1",
      "/settings",
      "/marketplacex",
    ])
      expect(isPublicPath(p)).toBe(false);
  });
});

describe("post-login redirect", () => {
  it("accepts only same-app paths", () => {
    expect(safeRedirect("/admin")).toBe("/admin");
    expect(safeRedirect("//evil.example")).toBeUndefined();
    expect(safeRedirect("https://evil.example")).toBeUndefined();
    expect(safeRedirect(42)).toBeUndefined();
  });
});
