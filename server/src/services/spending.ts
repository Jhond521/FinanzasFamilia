import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = InstanceType<typeof Prisma.Decimal>;
type DecimalInput = Decimal | string | number;

export type QuickEntryType = 'personal' | 'joint';
export type QuickEntryStatus = 'pending' | 'matched' | 'no_match_expected';

export type SpendingEntry = {
  userId: string;
  amount: DecimalInput; // se guarda negativo si es gasto, como el extracto
  type: QuickEntryType;
  // Las transactions (Fase 3) no tienen este campo — solo los quick_entries lo usan; una entrada
  // sin status siempre cuenta (una transaction ya es la fuente de verdad, no algo "pendiente").
  status?: QuickEntryStatus;
};

/**
 * Monto que cuenta como gastado para una entrada. Los registros 'matched' no cuentan
 * aqui: una vez matcheen con una transaccion (Fase 3), el gasto se cuenta por la
 * transaccion, no por el registro rapido (evita doble conteo).
 *
 * Se niega el monto en vez de tomar su valor absoluto: tanto quick_entries (##67 -- pueden ser un
 * ingreso puntual con signo positivo, ej. una transferencia que les hicieron) como transactions
 * (Fase 3, abonos/intereses tipo personal) pueden traer signo positivo, y en ambos casos negar es
 * lo correcto — un ingreso resta del gastado en vez de sumar (docs/02-modelo-de-datos.md, calculo
 * de "Gastado personal").
 */
function countableAmount(entry: SpendingEntry): Decimal {
  if (entry.status === 'matched') {
    return new Decimal(0);
  }
  return new Decimal(entry.amount).negated();
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

/**
 * Gastado conjunto atribuido a una persona: suma de sus registros tipo 'joint' (quien hizo el
 * gasto, segun `userId`/`ownerUserId` de la entrada -- no a quien "le toca" pagarlo). Se usa para
 * mostrar el desglose individual dentro de la bolsa Gastos del Mes (ticket #44), igual que
 * `personalSpent` ya hace para la bolsa personal.
 */
export function jointSpentByUser(entries: SpendingEntry[], userId: string): Decimal {
  return entries
    .filter((entry) => entry.type === 'joint' && entry.userId === userId)
    .reduce((sum, entry) => sum.plus(countableAmount(entry)), new Decimal(0));
}
