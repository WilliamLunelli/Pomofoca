export const PLAN = {
  FREE: 'FREE',
  PREMIUM: 'PREMIUM',
} as const;

export type Plan = (typeof PLAN)[keyof typeof PLAN];
