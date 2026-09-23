import type { Plan } from '@pomofoca/shared';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        plan: Plan;
      };
    }
  }
}

export {};
