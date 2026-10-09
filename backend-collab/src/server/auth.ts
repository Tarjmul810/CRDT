export type AuthenticatedUser = {
  userId: string;
};

export interface AuthService {
  authenticate(token: string): AuthenticatedUser | null;
}