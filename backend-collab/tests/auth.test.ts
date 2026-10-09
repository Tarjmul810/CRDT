import { describe, expect, it } from "vitest";
import { MockAuthService } from "../src/server/mock-auth";

describe("MockAuthService", () => {
  it("authenticates a valid token", () => {
    const auth = new MockAuthService();

    auth.registerToken("token-1", "user-1");

    expect(auth.authenticate("token-1")).toEqual({
      userId: "user-1",
    });
  });

  it("rejects an invalid token", () => {
    const auth = new MockAuthService();

    expect(auth.authenticate("invalid-token")).toBeNull();
  });

  it("supports multiple tokens for one user", () => {
    const auth = new MockAuthService();

    auth.registerToken("laptop-token", "user-1");
    auth.registerToken("phone-token", "user-1");

    expect(auth.authenticate("laptop-token")?.userId).toBe("user-1");
    expect(auth.authenticate("phone-token")?.userId).toBe("user-1");
  });
});