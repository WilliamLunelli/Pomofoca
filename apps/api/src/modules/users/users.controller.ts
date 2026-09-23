import type { Request, Response } from 'express';

import { sendSuccess } from '../../shared/utils/apiResponse';
import * as usersService from './users.service';
import type { UpdateUserInput } from './users.schema';

export async function getMeHandler(req: Request, res: Response) {
  const user = await usersService.getMe(req.user!.id);
  return sendSuccess(res, user);
}

export async function updateMeHandler(req: Request, res: Response) {
  const user = await usersService.updateMe(req.user!.id, req.body as UpdateUserInput);
  return sendSuccess(res, user);
}
