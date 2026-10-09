import type {
  AuthenticatedUser,
  AuthService,
} from "./auth";

export class MockAuthService implements AuthService {
  private tokens = new Map<string, string>();

  registerToken(token: string, userId: string): void {
    this.tokens.set(token, userId);
  }

  authenticate(token: string): AuthenticatedUser | null {
    const userId = this.tokens.get(token);

    if (!userId) {
      return null;
    }

    return { userId };
  }
}