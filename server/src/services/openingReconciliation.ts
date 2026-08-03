import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = InstanceType<typeof Prisma.Decimal>;
type DecimalInput = Decimal | string | number;

export type ExpenseEntry = {
  amount: DecimalInput; // negativo si es gasto, como el extracto
  type: 'personal' | 'joint' | 'movement' | 'unclassified';
};

/**
 * Gasto acumulado de una persona en lo que va del mes para el Cuadre de Inicio (ticket #29):
 * transacciones tipo personal o joint de su propia cuenta (owner_user_id), sin importar la
 * bolsa. Distinto de jointSpent/personalSpent (spending.ts), que miden gasto de una bolsa a
 * nivel de la pareja, no lo que salio de la cuenta puntual de una persona.
 */
export function expensesToDate(entries: ExpenseEntry[]): Decimal {
  return entries
    .filter((entry) => entry.type === 'personal' || entry.type === 'joint')
    .reduce((sum, entry) => sum.plus(new Decimal(entry.amount).negated()), new Decimal(0));
}

/**
 * Cuanto debe quedar en la cuenta al hacer el Cuadre de Inicio: el aporte del mes a Gastos del
 * Mes + Dinero Personal de esa persona, menos lo que ya salio de su cuenta este mes (RF2 +
 * resolucion del ticket #29 — no confundir con leaveInAccount de summary.ts, que es la cifra de
 * cierre de mes y no descuenta gasto a la fecha).
 */
export function leaveInAccountAtOpening(
  sharedExpensesContribution: DecimalInput,
  personalContribution: DecimalInput,
  expensesToDateAmount: DecimalInput,
): Decimal {
  return new Decimal(sharedExpensesContribution).plus(personalContribution).minus(expensesToDateAmount);
}

/**
 * Cuanto mover a Nu: el aporte completo del mes a Ahorros Conjuntos, integro — a diferencia de
 * leaveInAccountAtOpening, no se ajusta por gasto a la fecha (ticket #29, resolucion del autor).
 */
export function moveToSavingsAtOpening(savingsContribution: DecimalInput): Decimal {
  return new Decimal(savingsContribution);
}

/** Si el saldo que la persona confirma tras la transferencia calza con lo que deberia quedar. */
export function accountBalanceMatches(confirmedBalance: DecimalInput, expectedLeaveInAccount: DecimalInput): boolean {
  return new Decimal(confirmedBalance).equals(new Decimal(expectedLeaveInAccount));
}
