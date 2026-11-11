/**
 * Recalcula DailyStudyStat do zero, no fuso correto de cada usuario, a partir do
 * PomodoroSession bruto (fonte de verdade - DailyStudyStat e um agregado 100%
 * derivavel dele). Existe porque o bucketing de dia usava UTC puro antes desta
 * correcao, o que credita sessoes noturnas (comum no Brasil, UTC-3) no dia
 * seguinte - afetando streak, heatmap e relatorios de "hoje"/"semana".
 *
 * Idempotente: pode rodar de novo a qualquer momento sem risco (sempre apaga e
 * reconstroi do zero a partir do PomodoroSession, nunca acumula em cima do que ja
 * existe). Reaproveita reportsService.recordCompletedSession - a mesma logica que
 * roda em producao a cada sessao criada - em vez de duplicar a agregacao aqui,
 * pra garantir que o resultado bate exatamente com o que o app geraria.
 *
 * Rodar com: npx tsx scripts/backfill-timezone-buckets.ts (a partir de apps/api)
 */
import { prisma } from '../src/config/database';
import * as reportsService from '../src/modules/reports/reports.service';

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, timezone: true } });
  console.log(`Recalculando DailyStudyStat de ${users.length} usuario(s)...`);

  for (const user of users) {
    const sessions = await prisma.pomodoroSession.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: 'asc' },
    });
    if (sessions.length === 0) continue;

    await prisma.$transaction(async (tx) => {
      await tx.dailyStudyStat.deleteMany({ where: { userId: user.id } });
      for (const session of sessions) {
        await reportsService.recordCompletedSession(tx, {
          ...session,
          timezone: user.timezone,
        });
      }
    });

    console.log(
      `  ${user.id}: ${sessions.length} sessão(ões) recalculada(s) (fuso ${user.timezone})`,
    );
  }

  console.log('Concluído.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
