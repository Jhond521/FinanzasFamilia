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
 * Ahorro real de una persona: su aporte a Ahorros Conjuntos mas su propio delta de Gastos del
 * Mes (presupuesto de esa persona menos lo que gasto). Cada quien responde por su propia bolsa
 * -- no se reparte el exceso del hogar por ingreso (ticket #47: el reparto proporcional
 * terminaba subsidiando a quien se pasaba con el subgasto de la otra persona).
 */
export function realSavingsContribution(
  savingsContribution: DecimalInput,
  personSharedBudget: DecimalInput,
  personSharedSpent: DecimalInput,
): Decimal {
  const delta = new Decimal(personSharedBudget).minus(personSharedSpent);
  return new Decimal(savingsContribution).plus(delta);
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
