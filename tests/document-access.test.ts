// tests/document-access.test.ts

import { describe, expect, it } from "vitest";
import { DocumentAccessService } from "../src/server/document-access";

describe("DocumentAccessService", () => {
  it("allows owners to read and write", () => {
    const access = new DocumentAccessService();

    access.grantPermission("doc-1", "user-1", "owner");

    expect(access.canAccess("doc-1", "user-1", "read")).toBe(true);
    expect(access.canAccess("doc-1", "user-1", "write")).toBe(true);
  });

  it("allows editors to read and write", () => {
    const access = new DocumentAccessService();

    access.grantPermission("doc-1", "user-2", "editor");

    expect(access.canAccess("doc-1", "user-2", "read")).toBe(true);
    expect(access.canAccess("doc-1", "user-2", "write")).toBe(true);
  });

  it("allows viewers to read but not write", () => {
    const access = new DocumentAccessService();

    access.grantPermission("doc-1", "user-3", "viewer");

    expect(access.canAccess("doc-1", "user-3", "read")).toBe(true);
    expect(access.canAccess("doc-1", "user-3", "write")).toBe(false);
  });

  it("denies users without permission", () => {
    const access = new DocumentAccessService();

    expect(access.canAccess("doc-1", "unknown-user", "read")).toBe(false);
    expect(access.canAccess("doc-1", "unknown-user", "write")).toBe(false);
  });

  it("revokes permissions", () => {
    const access = new DocumentAccessService();

    access.grantPermission("doc-1", "user-1", "editor");

    expect(access.canAccess("doc-1", "user-1", "write")).toBe(true);

    access.revokePermission("doc-1", "user-1");

    expect(access.canAccess("doc-1", "user-1", "read")).toBe(false);
    expect(access.canAccess("doc-1", "user-1", "write")).toBe(false);
  });

  it("keeps permissions separate between documents", () => {
    const access = new DocumentAccessService();

    access.grantPermission("doc-1", "user-1", "editor");

    expect(access.canAccess("doc-1", "user-1", "write")).toBe(true);
    expect(access.canAccess("doc-2", "user-1", "write")).toBe(false);
  });
});