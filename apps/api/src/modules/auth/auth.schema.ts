import { z } from 'zod';

// timezone: IANA (ex: "America/Sao_Paulo"), capturado automaticamente pelo
// frontend via Intl.DateTimeFormat().resolvedOptions().timeZone - nunca digitado
// pelo usuario, entao so precisa ser uma string; validacao de formato IANA de
// verdade (com fallback) fica em shared/utils/timezone.ts::resolveTimezone.
const timezoneField = z.string().min(1).max(100).optional();

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
  timezone: timezoneField,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  timezone: timezoneField,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const googleAuthSchema = z.object({
  idToken: z.string().min(1),
  timezone: timezoneField,
});
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});
export type LogoutInput = z.infer<typeof logoutSchema>;
