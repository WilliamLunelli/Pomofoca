import type { Request, Response } from 'express';

import { sendSuccess } from '../../shared/utils/apiResponse';
import * as authService from './auth.service';
import type {
  GoogleAuthInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
} from './auth.schema';

export async function registerHandler(req: Request, res: Response) {
  const result = await authService.register(req.body as RegisterInput);
  return sendSuccess(res, result, 201);
}

export async function loginHandler(req: Request, res: Response) {
  const result = await authService.login(req.body as LoginInput);
  return sendSuccess(res, result);
}

export async function googleHandler(req: Request, res: Response) {
  const result = await authService.loginWithGoogle(req.body as GoogleAuthInput);
  return sendSuccess(res, result);
}

export async function refreshHandler(req: Request, res: Response) {
  const { refreshToken } = req.body as RefreshInput;
  const tokens = await authService.refresh(refreshToken);
  return sendSuccess(res, tokens);
}

export async function logoutHandler(req: Request, res: Response) {
  const { refreshToken } = req.body as LogoutInput;
  await authService.logout(refreshToken);
  return sendSuccess(res, null, 200);
}
