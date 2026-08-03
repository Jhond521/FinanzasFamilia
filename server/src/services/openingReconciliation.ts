import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = InstanceType<typeof Prisma.Decimal>;
type DecimalInput = Decimal | string | number;

export type ExpenseEntry = {
  amount: DecimalInput; // negativo si es gasto, como el extracto
  type: 'personal' | 'joint' | 'movement' | 'unclassified';
};

/**
 * Gasto acumulado de una persona en lo que va del mes para el Cuadre de Inicio: todas las
 * transacciones de su propia cuenta (owner_user_id), sin importar la bolsa NI si ya se
 * clasificaron (ticket #31 — no exige pasar por Revisar, solo excluye 'movement', igual que el
 * resto de la app). Distinto de jointSpent/personalSpent (spending.ts), que miden gasto de una
 * bolsa a nivel de la pareja, no lo que salio de la cuenta puntual de una persona.
 */
export function expensesToDate(entries: ExpenseEntry[]): Decimal {
  return entries
    .filter((entry) => entry.type !== 'movement')
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
 * Cuanto mover a Nu: lo que sobra en la cuenta despues de separar lo de este mes (ticket #31).
 * No es el aporte a Ahorros Conjuntos (eso quedo como dato informativo) -- es el saldo actual
 * menos lo que debe quedar, para que el cuadre de exacto sin importar remanentes de meses
 * anteriores o el gap estructural de un bucket 'mitad_y_mitad' con ingresos desiguales; ese
 * sobrante se termina de repartir en el futuro Cuadre de Cierre. Nunca negativo: si el saldo no
 * alcanza a cubrir lo que debe quedar, no hay nada que mover.
 */
export function moveToSavingsFromBalance(accountBalance: DecimalInput, leaveInAccount: DecimalInput): Decimal {
  const result = new Decimal(accountBalance).minus(leaveInAccount);
  return result.isNegative() ? new Decimal(0) : result;
}

/** Si el saldo que la persona confirma tras la transferencia calza con lo que deberia quedar. */
export function accountBalanceMatches(confirmedBalance: DecimalInput, expectedLeaveInAccount: DecimalInput): boolean {
  return new Decimal(confirmedBalance).equals(new Decimal(expectedLeaveInAccount));
}
