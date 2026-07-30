import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = InstanceType<typeof Prisma.Decimal>;
type DecimalInput = Decimal | string | number;

export type QuickEntryType = 'personal' | 'joint';
export type QuickEntryStatus = 'pending' | 'matched' | 'no_match_expected';

export type SpendingEntry = {
  userId: string;
  amount: DecimalInput; // se guarda negativo, como el extracto
  type: QuickEntryType;
  status: QuickEntryStatus;
};

/**
 * Monto que cuenta como gastado para una entrada. Los registros 'matched' no cuentan
 * aqui: una vez matcheen con una transaccion (Fase 3), el gasto se cuenta por la
 * transaccion, no por el registro rapido (evita doble conteo).
 */
function countableAmount(entry: SpendingEntry): Decimal {
  if (entry.status === 'matched') {
    return new Decimal(0);
  }
  return new Decimal(entry.amount).abs();
}

/** Gastado conjunto: suma de todos los registros rapidos tipo 'joint' del mes. */
export function jointSpent(entries: SpendingEntry[]): Decimal {
  return entries
    .filter((entry) => entry.type === 'joint')
    .reduce((sum, entry) => sum.plus(countableAmount(entry)), new Decimal(0));
}

/** Gastado personal de una persona: suma de sus registros rapidos tipo 'personal'. */
export function personalSpent(entries: SpendingEntry[], userId: string): Decimal {
  return entries
    .filter((entry) => entry.type === 'personal' && entry.userId === userId)
    .reduce((sum, entry) => sum.plus(countableAmount(entry)), new Decimal(0));
}
