import type { Request, Response } from 'express';

import { sendSuccess } from '../../shared/utils/apiResponse';
import * as sessionsService from './sessions.service';
import type { CreateSessionInput, ListSessionsQuery } from './sessions.schema';

export async function createHandler(req: Request, res: Response) {
  const session = await sessionsService.createSession(
    req.user!.id,
    req.body as CreateSessionInput,
  );
  return sendSuccess(res, session, 201);
}

export async function listHandler(req: Request, res: Response) {
  const query = req.query as unknown as ListSessionsQuery;
  const sessions = await sessionsService.listSessions(req.user!.id, query);
  return sendSuccess(res, sessions);
}

export async function getHandler(req: Request, res: Response) {
  const session = await sessionsService.getSession(req.user!.id, req.params.id);
  return sendSuccess(res, session);
}

export async function deleteHandler(req: Request, res: Response) {
  await sessionsService.deleteSession(req.user!.id, req.params.id);
  return sendSuccess(res, null, 200);
}
