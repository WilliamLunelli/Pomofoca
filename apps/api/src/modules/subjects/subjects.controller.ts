import type { Request, Response } from 'express';

import { sendSuccess } from '../../shared/utils/apiResponse';
import * as subjectsService from './subjects.service';
import type {
  CreateSubjectInput,
  ListSubjectsQuery,
  UpdateSubjectInput,
} from './subjects.schema';

export async function createHandler(req: Request, res: Response) {
  const subject = await subjectsService.createSubject(
    req.user!.id,
    req.body as CreateSubjectInput,
  );
  return sendSuccess(res, subject, 201);
}

export async function listHandler(req: Request, res: Response) {
  const { archived } = req.query as unknown as ListSubjectsQuery;
  const subjects = await subjectsService.listSubjects(req.user!.id, archived === 'true');
  return sendSuccess(res, subjects);
}

export async function getHandler(req: Request, res: Response) {
  const subject = await subjectsService.getSubject(req.user!.id, req.params.id);
  return sendSuccess(res, subject);
}

export async function updateHandler(req: Request, res: Response) {
  const subject = await subjectsService.updateSubject(
    req.user!.id,
    req.params.id,
    req.body as UpdateSubjectInput,
  );
  return sendSuccess(res, subject);
}

export async function archiveHandler(req: Request, res: Response) {
  const subject = await subjectsService.archiveSubject(req.user!.id, req.params.id);
  return sendSuccess(res, subject);
}

export async function restoreHandler(req: Request, res: Response) {
  const subject = await subjectsService.restoreSubject(req.user!.id, req.params.id);
  return sendSuccess(res, subject);
}
