import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { redis } from '../../config/redis';

const CHECK_TIMEOUT_MS = 2000;

type CheckResult = 'ok' | 'error';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  checks: { database: CheckResult; redis: CheckResult };
  uptimeSeconds: number;
}

async function runCheck(name: string, check: () => Promise<unknown>): Promise<CheckResult> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS);
  });

  try {
    await Promise.race([check(), timeout]);
    return 'ok';
  } catch (err) {
    // Detalhes só no log - nunca devolvidos ao cliente (rota pública).
    logger.warn({ err }, `health: ${name} check failed`);
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const [database, redisCheck] = await Promise.all([
    runCheck('database', () => prisma.$queryRaw`SELECT 1`),
    runCheck('redis', () => redis.ping()),
  ]);

  return {
    status: database === 'ok' && redisCheck === 'ok' ? 'ok' : 'degraded',
    checks: { database, redis: redisCheck },
    uptimeSeconds: Math.round(process.uptime()),
  };
}
