import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { totalIncome } from './distribution';
import { leaveInAccount, realSavingsContribution, sharedExpensesExcess } from './summary';

const { Decimal } = Prisma;

describe('sharedExpensesExcess', () => {
  it('es cero si lo gastado no supero el presupuesto', () => {
    expect(sharedExpensesExcess('9208727.52', '9000000').toString()).toBe('0');
  });

  it('es cero si lo gastado calzo exacto con el presupuesto', () => {
    expect(sharedExpensesExcess('9208727.52', '9208727.52').toString()).toBe('0');
  });

  it('es la diferencia si lo gastado supero el presupuesto', () => {
    expect(sharedExpensesExcess('9208727.52', '9850299.52').toString()).toBe('641572');
  });
});

describe('realSavingsContribution', () => {
  it('sin exceso, el ahorro real es igual al aporte a Ahorros Conjuntos', () => {
    const total = new Decimal(100);
    const excess = new Decimal(0);
    expect(realSavingsContribution('4118076', 60, total, excess).toString()).toBe('4118076');
  });

  it('reparte el exceso proporcional al ingreso (numeros simples)', () => {
    const total = new Decimal(100);
    const excess = new Decimal(50);
    // John gana 60/100, Lina 40/100 -> exceso 30 y 20 respectivamente.
    expect(realSavingsContribution('1000', 60, total, excess).toString()).toBe('970');
    expect(realSavingsContribution('1000', 40, total, excess).toString()).toBe('980');
  });

  it('con total=0 la parte proporcional es 0 (evita dividir por cero, igual que personContribution)', () => {
    const total = new Decimal(0);
    const excess = new Decimal(50);
    expect(realSavingsContribution('0', 0, total, excess).toString()).toBe('0');
  });
});

describe('leaveInAccount', () => {
  it('suma el aporte a Gastos del Mes + Dinero Personal', () => {
    expect(leaveInAccount('5490768', '1534787.92').toString()).toBe('7025555.92');
  });

  it('no se ajusta por el exceso (a diferencia del ahorro real)', () => {
    // A diferencia de realSavingsContribution, esta cifra es informativa y no cambia si hubo sobregasto.
    expect(leaveInAccount('3717959.52', '1534787.92').toString()).toBe('5252747.44');
  });
});

describe('ahorro real + dejar en cuenta — regresion Junio 2026', () => {
  // Mismo dataset que distribution.test.ts: ingresos 11,439,100 (John) + 7,745,749 (Lina),
  // Gastos del Mes presupuestado en 9,208,727.52 (48% de 19,184,849).
  const john = { userId: 'john', amount: '11439100' };
  const lina = { userId: 'lina', amount: '7745749' };
  const total = totalIncome([john, lina]);
  const sharedExpensesBudget = new Decimal('9208727.52');

  it('la suma de las partes del exceso repartidas es igual al exceso total (sin perder centavos)', () => {
    const spent = '9850299.52'; // se paso por 641,572, igual al ejemplo de design_specs
    const excess = sharedExpensesExcess(sharedExpensesBudget, spent);
    const johnShare = new Decimal(john.amount).mul(excess).div(total);
    const linaShare = new Decimal(lina.amount).mul(excess).div(total);
    expect(johnShare.plus(linaShare).toString()).toBe(excess.toString());
  });

  it('el ahorro real total baja exactamente el exceso total frente al aporte simple total', () => {
    const johnSavingsContribution = '4118076'; // de distribution.test.ts
    const linaSavingsContribution = '2788469.64';
    const spent = '9850299.52';
    const excess = sharedExpensesExcess(sharedExpensesBudget, spent);

    const johnReal = realSavingsContribution(johnSavingsContribution, john.amount, total, excess);
    const linaReal = realSavingsContribution(linaSavingsContribution, lina.amount, total, excess);
    const totalSavingsSimple = new Decimal(johnSavingsContribution).plus(linaSavingsContribution);

    expect(totalSavingsSimple.minus(johnReal.plus(linaReal)).toString()).toBe(excess.toString());
  });
});
