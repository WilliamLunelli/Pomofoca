import type { Plan } from '@pomofoca/shared';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  plan: Plan;
}

export interface AuthResult {
  user: AuthenticatedUser;
  tokens: AuthTokens;
}
