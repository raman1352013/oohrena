import { describe, expect, it } from "vitest";
import { ROLES } from "@oohrena/shared";
import { ROLE_HOME, rolesFor, safeRedirect } from "./auth";

describe("workspace access rules", () => {
  it("lets each role open its own home workspace", () => {
    for (const role of ROLES) expect(rolesFor(ROLE_HOME[role])).toContain(role);
  });

  it("keeps clients and vendors out of admin pages, including nested ones", () => {
    expect(rolesFor("/admin")).toEqual(["admin"]);
    expect(rolesFor("/admin/leads/LD-2026-000001")).toEqual(["admin"]);
    expect(rolesFor("/admin")).not.toContain("client");
  });

  it("leaves public pages ungated and doesn't match look-alike prefixes", () => {
    expect(rolesFor("/")).toBeNull();
    expect(rolesFor("/login")).toBeNull();
    expect(rolesFor("/administrator")).toBeNull();
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
