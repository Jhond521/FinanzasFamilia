import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { bucketBudget, personContribution, totalIncome } from './distribution';

const { Decimal } = Prisma;

// Config vigente (docs/01-prd.md RF2).
const AHORROS_CONJUNTOS = { percentage: '36.00', splitMode: 'proportional' as const };
const DINERO_PERSONAL = { percentage: '16.00', splitMode: 'half' as const };
const AYUDA_FAMILIA = { percentage: '0.00', splitMode: 'proportional' as const };
const GASTOS_DEL_MES = { percentage: '48.00', splitMode: 'proportional' as const };

// Regresion contra numeros reales de Junio 2026 (ver docs/01-prd.md y 02-modelo-de-datos.md):
// ingresos 11,439,100 (John) + 7,745,749 (Lina) -> bolsas 36/16/0/48.
describe('distribution — regresion Junio 2026', () => {
  const john = { userId: 'john', amount: '11439100' };
  const lina = { userId: 'lina', amount: '7745749' };
  const total = totalIncome([john, lina]);

  it('suma el ingreso total de la pareja', () => {
    expect(total.toString()).toBe('19184849');
  });

  it('calcula el presupuesto de cada bolsa segun su porcentaje', () => {
    expect(bucketBudget(AHORROS_CONJUNTOS, total).toString()).toBe('6906545.64');
    expect(bucketBudget(DINERO_PERSONAL, total).toString()).toBe('3069575.84');
    expect(bucketBudget(AYUDA_FAMILIA, total).toString()).toBe('0');
    expect(bucketBudget(GASTOS_DEL_MES, total).toString()).toBe('9208727.52');
  });

  it('los presupuestos de las bolsas activas suman el total de ingresos', () => {
    const sum = [AHORROS_CONJUNTOS, DINERO_PERSONAL, AYUDA_FAMILIA, GASTOS_DEL_MES]
      .map((bucket) => bucketBudget(bucket, total))
      .reduce((acc, budget) => acc.plus(budget), new Decimal(0));
    expect(sum.toString()).toBe(total.toString());
  });

  it('reparte Ahorros Conjuntos proporcional al ingreso de cada uno', () => {
    const budget = bucketBudget(AHORROS_CONJUNTOS, total);
    expect(personContribution(AHORROS_CONJUNTOS, budget, new Decimal(john.amount), total).toString()).toBe(
      '4118076',
    );
    expect(personContribution(AHORROS_CONJUNTOS, budget, new Decimal(lina.amount), total).toString()).toBe(
      '2788469.64',
    );
  });

  it('reparte Gastos del Mes proporcional al ingreso de cada uno', () => {
    const budget = bucketBudget(GASTOS_DEL_MES, total);
    expect(personContribution(GASTOS_DEL_MES, budget, new Decimal(john.amount), total).toString()).toBe(
      '5490768',
    );
    expect(personContribution(GASTOS_DEL_MES, budget, new Decimal(lina.amount), total).toString()).toBe(
      '3717959.52',
    );
  });

  it('reparte Dinero Personal mitad y mitad, sin importar el ingreso', () => {
    const budget = bucketBudget(DINERO_PERSONAL, total);
    expect(personContribution(DINERO_PERSONAL, budget, new Decimal(john.amount), total).toString()).toBe(
      '1534787.92',
    );
    expect(personContribution(DINERO_PERSONAL, budget, new Decimal(lina.amount), total).toString()).toBe(
      '1534787.92',
    );
  });
});

describe('distribution — casos borde', () => {
  it('sin ingresos (T=0), el aporte proporcional es 0 en vez de dividir por cero', () => {
    const total = totalIncome([]);
    const budget = bucketBudget(GASTOS_DEL_MES, total);
    expect(budget.toString()).toBe('0');
    expect(personContribution(GASTOS_DEL_MES, budget, new Decimal(0), total).toString()).toBe('0');
  });
});
