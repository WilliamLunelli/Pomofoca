import type { Request, Response } from 'express';

import { sendSuccess } from '../../shared/utils/apiResponse';
import * as routineService from './routine.service';
import type {
  CreateRoutineBlockInput,
  RoutineBlockIdParam,
  UpdateRoutineBlockInput,
} from './routine.schema';

export async function createHandler(req: Request, res: Response) {
  const block = await routineService.createRoutineBlock(
    req.user!.id,
    req.body as CreateRoutineBlockInput,
  );
  return sendSuccess(res, block, 201);
}

export async function listHandler(req: Request, res: Response) {
  const blocks = await routineService.listRoutineBlocks(req.user!.id);
  return sendSuccess(res, blocks);
}

export async function updateHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as RoutineBlockIdParam;
  const block = await routineService.updateRoutineBlock(
    req.user!.id,
    id,
    req.body as UpdateRoutineBlockInput,
  );
  return sendSuccess(res, block);
}

export async function deleteHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as RoutineBlockIdParam;
  await routineService.deleteRoutineBlock(req.user!.id, id);
  return sendSuccess(res, null, 200);
}
