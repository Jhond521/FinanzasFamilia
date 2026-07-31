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
 * Candidatos de match para una transaccion (RF5): mismo dueño, monto exacto **en valor absoluto**
 * (docs/01-prd.md RF5: "monto exacto (|valor|)"), fecha +-3 dias. El valor absoluto es a proposito:
 * los quick_entries siempre se guardan negativos (regla de Fase 2), pero una transaction real del
 * extracto puede llegar con cualquier signo segun como el banco registre ese movimiento puntual
 * (ej. una transferencia de pago que aparece como "TRANSF DE ..." positiva en vez de negativa) —
 * comparar con signo haria que ese caso nunca matcheara aunque sea, en plata, el mismo gasto.
 * Recibe solo quick entries ya filtradas por el caller a `status='pending'`; si el resultado
 * tiene mas de un candidato, no se matchea automaticamente (decision confirmada del ticket #2 —
 * el caller debe ofrecerlos en la vista de "Candidatos de match" para resolucion manual).
 */
export function findMatchCandidates(
  transaction: MatchableTransaction,
  quickEntries: MatchableQuickEntry[],
): MatchableQuickEntry[] {
  const transactionAmount = new Decimal(transaction.amount).abs();
  return quickEntries.filter(
    (entry) =>
      entry.userId === transaction.ownerUserId &&
      new Decimal(entry.amount).abs().equals(transactionAmount) &&
      daysBetween(entry.date, transaction.date) <= 3,
  );
}
