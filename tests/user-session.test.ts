import { describe, expect, it } from "vitest";
import { User } from "../src/server/user";
import { ClientSession } from "../src/server/client-session";
import { DocumentAccessService } from "../src/server/document-access";

describe("User and client sessions", () => {
  it("creates multiple sessions for the same user", () => {
    const user = new User("user-1");

    const laptopSession = new ClientSession(user.userId);
    const phoneSession = new ClientSession(user.userId);

    expect(laptopSession.userId).toBe(user.userId);
    expect(phoneSession.userId).toBe(user.userId);

    expect(laptopSession.sessionId).not.toBe(
      phoneSession.sessionId
    );

    expect(laptopSession.clientId).not.toBe(
      phoneSession.clientId
    );
  });

  it("shares document permissions across sessions", () => {
    const user = new User("user-1");

    const laptopSession = new ClientSession(user.userId);
    const phoneSession = new ClientSession(user.userId);

    const accessService = new DocumentAccessService();

    accessService.grantPermission(
      "document-1",
      user.userId,
      "editor"
    );

    expect(
      accessService.canAccess(
        "document-1",
        laptopSession.userId,
        "write"
      )
    ).toBe(true);

    expect(
      accessService.canAccess(
        "document-1",
        phoneSession.userId,
        "write"
      )
    ).toBe(true);
  });

  it("does not share permissions between different users", () => {
    const userOne = new User("user-1");
    const userTwo = new User("user-2");

    const accessService = new DocumentAccessService();

    accessService.grantPermission(
      "document-1",
      userOne.userId,
      "editor"
    );

    expect(
      accessService.canAccess(
        "document-1",
        userTwo.userId,
        "write"
      )
    ).toBe(false);
  });

  it("denies write access to viewers", () => {
    const user = new User("user-1");

    const accessService = new DocumentAccessService();

    accessService.grantPermission(
      "document-1",
      user.userId,
      "viewer"
    );

    expect(
      accessService.canAccess(
        "document-1",
        user.userId,
        "read"
      )
    ).toBe(true);

    expect(
      accessService.canAccess(
        "document-1",
        user.userId,
        "write"
      )
    ).toBe(false);
  });
});