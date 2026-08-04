import { describe, expect, it } from 'vitest';
import { leaveInAccount, realSavingsContribution, sharedExpensesExcess } from './summary';

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
  it('sin sobregasto ni bono (presupuesto == gastado), el ahorro real es igual al aporte a Ahorros Conjuntos', () => {
    expect(realSavingsContribution('4118076', '5490768', '5490768').toString()).toBe('4118076');
  });

  it('resta el sobregasto individual del ahorro real (delta negativo)', () => {
    expect(realSavingsContribution('4118076', '5490768.00', '8162194.78').toString()).toBe('1446649.22');
  });

  it('suma el bono individual del ahorro real (delta positivo, se gasto menos de SU presupuesto)', () => {
    expect(realSavingsContribution('2788469.64', '3717959.52', '3113500.69').toString()).toBe('3392928.47');
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

describe('ahorro real — regresion Julio 2026 (tickets #47 + ##53)', () => {
  // Caso real de produccion, con los dos fixes aplicados:
  // - #47: cada persona usa su propio delta de Gastos del Mes, no el excedente del hogar
  //   repartido por ingreso.
  // - ##53: el presupuesto de cada bolsa por persona (Ahorros Conjuntos, Gastos del Mes) ya
  //   reconcilia las bolsas 'proportional' con las 'half' -- antes, la suma de aportes de una
  //   persona no daba su ingreso exacto (ver distribution.test.ts).
  // El 1,742,117.30 de John coincide exacto con la celda K11 del Excel de referencia.
  it('cada persona usa su propio presupuesto (ya corregido) y su propio delta', () => {
    const johnReal = realSavingsContribution('4244705.18', '5659606.90', '8162194.78');
    const linaReal = realSavingsContribution('2661840.46', '3549120.62', '3113500.69');

    expect(johnReal.toString()).toBe('1742117.3');
    expect(linaReal.toString()).toBe('3097460.39');
  });

  it('la suma del ahorro real de ambos no cambia frente al calculo household (los fixes redistribuyen, no crean ni destruyen plata)', () => {
    const johnReal = realSavingsContribution('4244705.18', '5659606.90', '8162194.78');
    const linaReal = realSavingsContribution('2661840.46', '3549120.62', '3113500.69');

    expect(johnReal.plus(linaReal).toString()).toBe('4839577.69');
  });
});
