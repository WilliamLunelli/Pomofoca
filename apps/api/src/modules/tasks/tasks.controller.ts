import type { Request, Response } from 'express';

import { sendSuccess } from '../../shared/utils/apiResponse';
import * as tasksService from './tasks.service';
import type {
  CreateTaskInput,
  SubjectIdParam,
  TaskIdParam,
  UpdateTaskInput,
} from './tasks.schema';

export async function createHandler(req: Request, res: Response) {
  const { subjectId } = req.params as unknown as SubjectIdParam;
  const task = await tasksService.createTask(
    req.user!.id,
    subjectId,
    req.body as CreateTaskInput,
  );
  return sendSuccess(res, task, 201);
}

export async function listHandler(req: Request, res: Response) {
  const { subjectId } = req.params as unknown as SubjectIdParam;
  const tasks = await tasksService.listTasks(req.user!.id, subjectId);
  return sendSuccess(res, tasks);
}

export async function updateHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as TaskIdParam;
  const task = await tasksService.updateTask(
    req.user!.id,
    id,
    req.body as UpdateTaskInput,
  );
  return sendSuccess(res, task);
}

export async function deleteHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as TaskIdParam;
  await tasksService.deleteTask(req.user!.id, id);
  return sendSuccess(res, null, 200);
}
