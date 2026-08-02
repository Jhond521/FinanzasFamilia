import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = InstanceType<typeof Prisma.Decimal>;
type DecimalInput = Decimal | string | number;

/**
 * Excedente de Gastos del Mes (bolsa kind='shared_expenses'): positivo solo si lo gastado
 * supero el presupuesto de la bolsa; si no se paso, no hay exceso que imputar (docs/02-modelo-de-datos.md).
 */
export function sharedExpensesExcess(budget: DecimalInput, spent: DecimalInput): Decimal {
  const excess = new Decimal(spent).minus(budget);
  return excess.isPositive() ? excess : new Decimal(0);
}

/**
 * Ahorro real de una persona: su aporte a Ahorros Conjuntos menos la parte que le toca del
 * exceso de Gastos del Mes, repartida proporcional a su ingreso (misma proporcion que
 * personContribution con splitMode='proportional', no una formula nueva). Con total=0 la
 * parte proporcional es 0 -- misma convencion que personContribution para evitar dividir por cero.
 */
export function realSavingsContribution(
  savingsContribution: DecimalInput,
  personIncome: DecimalInput,
  total: Decimal,
  excess: Decimal,
): Decimal {
  const excessShare = total.isZero() ? new Decimal(0) : excess.mul(personIncome).div(total);
  return new Decimal(savingsContribution).minus(excessShare);
}

/**
 * Dejar en cuenta de una persona: aporte a Gastos del Mes + aporte a Dinero Personal, cifra
 * informativa del dia 1 que NO se ajusta por el sobregasto (a diferencia del ahorro real).
 */
export function leaveInAccount(
  sharedExpensesContribution: DecimalInput,
  personalContribution: DecimalInput,
): Decimal {
  return new Decimal(sharedExpensesContribution).plus(personalContribution);
}
