import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { bucketBudget, distributionContext, personContribution, totalIncome, type BucketDistributionInput } from './distribution';

const { Decimal } = Prisma;

// Config vigente (docs/01-prd.md RF2).
const AHORROS_CONJUNTOS = { percentage: '36.00', splitMode: 'proportional' as const };
const DINERO_PERSONAL = { percentage: '16.00', splitMode: 'half' as const };
const AYUDA_FAMILIA = { percentage: '0.00', splitMode: 'proportional' as const };
const GASTOS_DEL_MES = { percentage: '48.00', splitMode: 'proportional' as const };
const ACTIVE_BUCKETS = [AHORROS_CONJUNTOS, DINERO_PERSONAL, AYUDA_FAMILIA, GASTOS_DEL_MES];

// Regresion contra numeros reales de Julio 2026 (ticket ##53, formula corregida que reconcilia
// bolsas 'proportional' y 'half' -- antes de este fix la suma de aportes de una persona no daba su
// ingreso exacto, ver evidencia del ticket).
describe('distribution — regresion Julio 2026 (formula corregida, ticket ##53)', () => {
  const john = { userId: 'john', amount: '11439100' };
  const lina = { userId: 'lina', amount: '7745749' };
  const total = totalIncome([john, lina]);
  const ctx = distributionContext(ACTIVE_BUCKETS, total, 2);

  it('suma el ingreso total de la pareja', () => {
    expect(total.toString()).toBe('19184849');
  });

  it('calcula el presupuesto de cada bolsa segun su porcentaje', () => {
    expect(bucketBudget(AHORROS_CONJUNTOS, total).toString()).toBe('6906545.64');
    expect(bucketBudget(DINERO_PERSONAL, total).toString()).toBe('3069575.84');
    expect(bucketBudget(AYUDA_FAMILIA, total).toString()).toBe('0');
    expect(bucketBudget(GASTOS_DEL_MES, total).toString()).toBe('9208727.52');
  });

  it('reparte Ahorros Conjuntos segun el ingreso remanente de cada uno (tras descontar Dinero Personal)', () => {
    expect(personContribution(AHORROS_CONJUNTOS, new Decimal(john.amount), ctx).toString()).toBe('4244705.18');
    expect(personContribution(AHORROS_CONJUNTOS, new Decimal(lina.amount), ctx).toString()).toBe('2661840.46');
  });

  it('reparte Gastos del Mes segun el ingreso remanente de cada uno', () => {
    expect(personContribution(GASTOS_DEL_MES, new Decimal(john.amount), ctx).toString()).toBe('5659606.9');
    expect(personContribution(GASTOS_DEL_MES, new Decimal(lina.amount), ctx).toString()).toBe('3549120.62');
  });

  it('reparte Dinero Personal mitad y mitad, sin importar el ingreso (no cambia con el fix)', () => {
    expect(personContribution(DINERO_PERSONAL, new Decimal(john.amount), ctx).toString()).toBe('1534787.92');
    expect(personContribution(DINERO_PERSONAL, new Decimal(lina.amount), ctx).toString()).toBe('1534787.92');
  });

  it('invariante 1: la suma de los aportes de cada persona da exacto su ingreso', () => {
    const johnSum = [AHORROS_CONJUNTOS, DINERO_PERSONAL, GASTOS_DEL_MES]
      .map((b) => personContribution(b, new Decimal(john.amount), ctx))
      .reduce((sum, c) => sum.plus(c), new Decimal(0));
    const linaSum = [AHORROS_CONJUNTOS, DINERO_PERSONAL, GASTOS_DEL_MES]
      .map((b) => personContribution(b, new Decimal(lina.amount), ctx))
      .reduce((sum, c) => sum.plus(c), new Decimal(0));

    expect(johnSum.toString()).toBe(john.amount);
    expect(linaSum.toString()).toBe(lina.amount);
  });

  it('invariante 2: la suma de los aportes de todas las personas a una bolsa da exacto su presupuesto', () => {
    for (const bucket of [AHORROS_CONJUNTOS, DINERO_PERSONAL, GASTOS_DEL_MES]) {
      const sum = [john, lina]
        .map((p) => personContribution(bucket, new Decimal(p.amount), ctx))
        .reduce((acc, c) => acc.plus(c), new Decimal(0));
      expect(sum.toString()).toBe(bucketBudget(bucket, total).toString());
    }
  });

  it('los presupuestos de las bolsas activas suman el total de ingresos', () => {
    const sum = ACTIVE_BUCKETS.map((bucket) => bucketBudget(bucket, total)).reduce((acc, budget) => acc.plus(budget), new Decimal(0));
    expect(sum.toString()).toBe(total.toString());
  });
});

describe('distribution — casos borde', () => {
  it('sin ingresos (T=0), el aporte proporcional es 0 en vez de dividir por cero', () => {
    const total = totalIncome([]);
    const ctx = distributionContext(ACTIVE_BUCKETS, total, 2);
    const budget = bucketBudget(GASTOS_DEL_MES, total);
    expect(budget.toString()).toBe('0');
    expect(personContribution(GASTOS_DEL_MES, new Decimal(0), ctx).toString()).toBe('0');
  });

  it('sin bolsas proporcionales activas (Σ_P pct = 0), el aporte proporcional es 0 en vez de dividir por cero', () => {
    const buckets: BucketDistributionInput[] = [DINERO_PERSONAL]; // solo queda la bolsa 'half'
    const total = totalIncome([{ userId: 'john', amount: '11439100' }]);
    const ctx = distributionContext(buckets, total, 1);
    expect(ctx.propPctTotal.toString()).toBe('0');
    // Un bucket 'proportional' que ya no esta activo tampoco deberia explotar.
    expect(personContribution(GASTOS_DEL_MES, new Decimal('11439100'), ctx).toString()).toBe('0');
  });

  it('R_i negativo: si el ingreso de una persona es menor a su parte de las bolsas half, su aporte proporcional queda negativo', () => {
    // Persona con ingreso muy bajo frente al resto -- su parte fija de Dinero Personal (16%/2 del
    // total del hogar) supera su propio ingreso.
    const total = totalIncome([{ userId: 'john', amount: '19184849' }, { userId: 'lina', amount: '100' }]);
    const ctx = distributionContext(ACTIVE_BUCKETS, total, 2);
    const linaContribution = personContribution(AHORROS_CONJUNTOS, new Decimal('100'), ctx);
    expect(linaContribution.isNegative()).toBe(true);

    // El invariante 1 se sigue cumpliendo aunque un termino sea negativo -- la suma total da su ingreso.
    const linaSum = [AHORROS_CONJUNTOS, DINERO_PERSONAL, GASTOS_DEL_MES]
      .map((b) => personContribution(b, new Decimal('100'), ctx))
      .reduce((sum, c) => sum.plus(c), new Decimal(0));
    expect(linaSum.toString()).toBe('100');
  });

  it('n sale de las personas con ingreso del mes, no de un 2 hardcodeado', () => {
    const total = totalIncome([{ userId: 'john', amount: '9000000' }]);
    const ctx = distributionContext(ACTIVE_BUCKETS, total, 1);
    // Con una sola persona, Dinero Personal (half) le toca completo a ella, no la mitad.
    expect(personContribution(DINERO_PERSONAL, new Decimal('9000000'), ctx).toString()).toBe(
      bucketBudget(DINERO_PERSONAL, total).toString(),
    );
  });
});
