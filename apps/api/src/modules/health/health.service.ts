import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { redis } from '../../config/redis';
import type { CheckResult, HealthStatus } from './health.schema';

const DEFAULT_CHECK_TIMEOUT_MS = 2000;
const DEFAULT_CACHE_MS = 2000;

// Lidos na hora da chamada (não no import) para os testes poderem ajustar via process.env.
function readMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

let cached: { at: number; value: HealthStatus } | null = null;
let inFlight: Promise<HealthStatus> | null = null;

async function runCheck(name: string, check: () => Promise<unknown>): Promise<CheckResult> {
  const timeoutMs = readMs('HEALTH_CHECK_TIMEOUT_MS', DEFAULT_CHECK_TIMEOUT_MS);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
    timer.unref();
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

async function computeHealthStatus(): Promise<HealthStatus> {
  const [database, redisCheck] = await Promise.all([
    runCheck('database', () => prisma.$queryRaw`SELECT 1`),
    runCheck('redis', () => redis.ping()),
  ]);

  return {
    status: database === 'ok' && redisCheck === 'ok' ? 'ok' : 'degraded',
    checks: { database, redis: redisCheck },
  };
}

export function getHealthStatus(): Promise<HealthStatus> {
  const cacheMs = readMs('HEALTH_CACHE_MS', DEFAULT_CACHE_MS);

  if (cacheMs > 0 && cached && Date.now() - cached.at < cacheMs) {
    return Promise.resolve(cached.value);
  }

  // Execução única: chamadas concorrentes compartilham a mesma promise.
  if (inFlight) return inFlight;

  inFlight = computeHealthStatus()
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function resetHealthCacheForTests(): void {
  cached = null;
  inFlight = null;
}
