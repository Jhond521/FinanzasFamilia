import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = InstanceType<typeof Prisma.Decimal>;
type DecimalInput = Decimal | string | number;

export type CardItemEntry = {
  amount: DecimalInput; // siempre positivo (docs/02-modelo-de-datos.md)
  type: 'personal' | 'joint';
};

export type CardDiffStatus = 'matched' | 'short' | 'over';

export type CardMonthProgress = {
  itemsTotal: Decimal;
  diff: Decimal;
  status: CardDiffStatus;
};

/** Suma de los montos de los items (siempre positivos). */
export function itemsTotal(items: CardItemEntry[]): Decimal {
  return items.reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
}

/**
 * Progreso de conciliacion de un card_month: cuanto llevan registrado los items vs. el monto
 * pagado, y el estado de la diferencia para el color de la UI (ticket #3, decision confirmada):
 * 'matched' (verde) cuando cuadra exacto, 'short' (advertencia) cuando falta registrar,
 * 'over' (rojo) cuando se registro de mas y hay que ajustar/corregir items hasta llegar a $0.
 */
export function cardMonthProgress(amountPaid: DecimalInput, items: CardItemEntry[]): CardMonthProgress {
  const total = itemsTotal(items);
  const diff = new Decimal(amountPaid).minus(total);
  const status: CardDiffStatus = diff.isZero() ? 'matched' : diff.isPositive() ? 'short' : 'over';
  return { itemsTotal: total, diff, status };
}

export type TypeSplit = {
  personal: Decimal;
  joint: Decimal;
  personalPercentage: Decimal;
  jointPercentage: Decimal;
};

/** Totales informativos: que porcion del pago fue personal vs. conjunta (RF6). */
export function splitByType(items: CardItemEntry[]): TypeSplit {
  const personal = items
    .filter((item) => item.type === 'personal')
    .reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const joint = items
    .filter((item) => item.type === 'joint')
    .reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
  const total = personal.plus(joint);

  return {
    personal,
    joint,
    personalPercentage: total.isZero() ? new Decimal(0) : personal.div(total).mul(100),
    jointPercentage: total.isZero() ? new Decimal(0) : joint.div(total).mul(100),
  };
}
