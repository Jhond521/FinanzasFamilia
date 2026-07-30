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
 * Aporte de una persona a un rubro: proporcional a su ingreso sobre el total,
 * o mitad y mitad si el rubro reparte por igual (p.ej. Dinero Personal).
 * Con T=0 (sin ingresos aun) el aporte proporcional es 0 para evitar division por cero.
 */
export function personContribution(
  bucket: BucketDistributionInput,
  budget: Decimal,
  personIncome: Decimal,
  total: Decimal,
): Decimal {
  if (bucket.splitMode === 'half') {
    return budget.div(2);
  }
  if (total.isZero()) {
    return new Decimal(0);
  }
  return budget.mul(personIncome).div(total);
}
