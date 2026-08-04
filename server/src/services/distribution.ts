import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = InstanceType<typeof Prisma.Decimal>;
type DecimalInput = Decimal | string | number;

export type SplitMode = 'proportional' | 'half';

export type BucketDistributionInput = {
  percentage: DecimalInput;
  splitMode: SplitMode;
};

export type PersonIncome = {
  userId: string;
  amount: DecimalInput;
};

/** T = suma de los ingresos totales del mes (todas las personas). */
export function totalIncome(incomes: PersonIncome[]): Decimal {
  return incomes.reduce((sum, income) => sum.plus(income.amount), new Decimal(0));
}

/** Bolsa de un rubro: P_b = T * pct_b. `percentage` viene en base 100 (36.00 = 36%). */
export function bucketBudget(bucket: BucketDistributionInput, total: Decimal): Decimal {
  return total.mul(bucket.percentage).div(100);
}

/**
 * Contexto precalculado para repartir bolsas entre personas (ticket ##53): cuanto suman los
 * porcentajes de las bolsas 'half' y 'proportional' por separado, y cuantas personas reciben
 * ingreso este mes. Se construye una sola vez por mes -- personContribution ya no puede decidir
 * mirando una sola bolsa, necesita el conjunto completo para reconciliar ambas reglas de reparto.
 */
export type DistributionContext = {
  total: Decimal; // T
  halfPctTotal: Decimal; // Σ pct de bolsas 'half'
  propPctTotal: Decimal; // Σ pct de bolsas 'proportional'
  peopleCount: number; // n -- personas con ingreso este mes, nunca hardcodeado
};

export function distributionContext(
  buckets: BucketDistributionInput[],
  total: Decimal,
  peopleCount: number,
): DistributionContext {
  const halfPctTotal = buckets
    .filter((b) => b.splitMode === 'half')
    .reduce((sum, b) => sum.plus(b.percentage), new Decimal(0));
  const propPctTotal = buckets
    .filter((b) => b.splitMode === 'proportional')
    .reduce((sum, b) => sum.plus(b.percentage), new Decimal(0));
  return { total, halfPctTotal, propPctTotal, peopleCount };
}

/**
 * Aporte de una persona a un rubro (ticket ##53): primero se descuenta a cada persona su parte de
 * las bolsas 'half' (mitad y mitad, sin importar el ingreso -- ej. Dinero Personal, docs/01-prd.md),
 * y el ingreso remanente (R_i) se reparte entre las bolsas 'proportional' segun el peso relativo de
 * sus porcentajes. Esto preserva dos invariantes: la suma de los aportes de una persona da exacto
 * su ingreso, y la suma de los aportes de todas las personas a una bolsa da exacto su presupuesto.
 *
 * Redondeado a 2 decimales (misma escala que `Decimal(14,2)` en BD) -- sin este redondeo, dividir
 * entre `propPctTotal` (ej. 84 = 36+48, que no es multiplo de 2 o 5) da un decimal periodico que
 * nunca cuadraria exacto contra el ingreso ni el presupuesto.
 */
export function personContribution(bucket: BucketDistributionInput, personIncome: Decimal, ctx: DistributionContext): Decimal {
  if (ctx.peopleCount === 0) return new Decimal(0);

  const halfContributionPerPerson = ctx.total.mul(ctx.halfPctTotal).div(100).div(ctx.peopleCount);

  if (bucket.splitMode === 'half') {
    return ctx.total.mul(bucket.percentage).div(100).div(ctx.peopleCount).toDecimalPlaces(2);
  }

  if (ctx.propPctTotal.isZero()) return new Decimal(0);
  const residualIncome = personIncome.minus(halfContributionPerPerson);
  return residualIncome.mul(bucket.percentage).div(ctx.propPctTotal).toDecimalPlaces(2);
}
