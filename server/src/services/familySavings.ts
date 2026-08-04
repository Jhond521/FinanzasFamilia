import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = InstanceType<typeof Prisma.Decimal>;
type DecimalInput = Decimal | string | number;

/** Valor por defecto del umbral de "Rendimientos" (COP) -- configurable en Configuracion, ver
 * AppSettings.yieldAutoThreshold. Se usa como default de esta funcion y como valor inicial de la
 * fila singleton la primera vez que se pide GET /api/settings. */
export const YIELD_AUTO_THRESHOLD = new Decimal('200000');

/**
 * Delta con signo de Gastos del Mes (household-wide): positivo si se gasto MENOS del
 * presupuesto (bono, se suma al ahorro), negativo si se gasto MAS (debito, se resta). A
 * diferencia de sharedExpensesExcess (summary.ts), que esta clampeada a >=0 porque el cierre de
 * mes normal (#34) nunca premia el subgasto, este proceso de cierre (#36) si lo hace.
 */
export function sharedExpensesDelta(budget: DecimalInput, spent: DecimalInput): Decimal {
  return new Decimal(budget).minus(spent);
}

/**
 * Porcion de una persona de un delta total, proporcional a su ingreso -- mismo reparto que el
 * ahorro real de summary.ts (excessShare), aplicado aqui al delta completo con signo. Con
 * total=0 la parte proporcional es 0, misma convencion que distribution.ts para evitar dividir
 * por cero.
 */
export function personAdjustmentShare(delta: DecimalInput, personIncome: DecimalInput, total: DecimalInput): Decimal {
  const totalDecimal = new Decimal(total);
  if (totalDecimal.isZero()) return new Decimal(0);
  return new Decimal(delta).mul(personIncome).div(totalDecimal);
}

/**
 * Entrada "Ahorros de [Mes]" neta: el aporte presupuestado a Ahorros Conjuntos del mes, menos
 * el gasto grande de ahorros que haya reportado el usuario (vacaciones, compras grandes -- paso
 * 7/7b del ticket #36). Sin gasto grande, es el aporte integro. Si el gasto grande supera el
 * aporte, el resultado queda negativo (retiro neto ese mes) -- extension natural de la resta, no
 * un caso especial.
 */
export function netMonthlySavings(baseSavingsContribution: DecimalInput, bigExpense: DecimalInput = 0): Decimal {
  return new Decimal(baseSavingsContribution).minus(bigExpense);
}

/** Suma de una lista de entradas del ledger (positivo = aporta, negativo = resta) -- el saldo de una persona. */
export function balanceFromEntries(entries: { amount: DecimalInput }[]): Decimal {
  return entries.reduce((sum, entry) => sum.plus(entry.amount), new Decimal(0));
}

/**
 * true si el saldo real de la cajita de Nu es MAYOR al calculado por el ledger, por una
 * diferencia positiva de hasta `threshold` (configurable, ver AppSettings.yieldAutoThreshold) --
 * caso en el que el paso 10 del cierre ofrece agregar la diferencia como "Rendimientos". Si la
 * diferencia es negativa (el saldo real es menor al calculado) o mayor al umbral, no se sugiere
 * -- queda para revision manual.
 */
export function suggestsYieldAdjustment(
  actualBalance: DecimalInput,
  calculatedBalance: DecimalInput,
  threshold: DecimalInput = YIELD_AUTO_THRESHOLD,
): boolean {
  const difference = new Decimal(actualBalance).minus(calculatedBalance);
  return difference.gt(0) && difference.lte(threshold);
}
