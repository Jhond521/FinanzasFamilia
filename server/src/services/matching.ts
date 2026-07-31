import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type DecimalInput = InstanceType<typeof Prisma.Decimal> | string | number;

export type MatchableTransaction = {
  ownerUserId: string;
  amount: DecimalInput;
  date: string; // YYYY-MM-DD
};

export type MatchableQuickEntry = {
  id: string;
  userId: string;
  amount: DecimalInput;
  date: string; // YYYY-MM-DD
};

function daysBetween(a: string, b: string): number {
  const diffMs = new Date(`${a}T00:00:00.000Z`).getTime() - new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.abs(diffMs) / (1000 * 60 * 60 * 24);
}

/**
 * Candidatos de match para una transaccion (RF5): mismo dueño, monto exacto, fecha +-3 dias.
 * Recibe solo quick entries ya filtradas por el caller a `status='pending'`; si el resultado
 * tiene mas de un candidato, no se matchea automaticamente (decision confirmada del ticket #2 —
 * el caller debe ofrecerlos en la vista de "Candidatos de match" para resolucion manual).
 */
export function findMatchCandidates(
  transaction: MatchableTransaction,
  quickEntries: MatchableQuickEntry[],
): MatchableQuickEntry[] {
  return quickEntries.filter(
    (entry) =>
      entry.userId === transaction.ownerUserId &&
      new Decimal(entry.amount).equals(new Decimal(transaction.amount)) &&
      daysBetween(entry.date, transaction.date) <= 3,
  );
}
