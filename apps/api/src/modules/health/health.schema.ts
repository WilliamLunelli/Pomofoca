export type CheckResult = 'ok' | 'error';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  checks: { database: CheckResult; redis: CheckResult };
}
