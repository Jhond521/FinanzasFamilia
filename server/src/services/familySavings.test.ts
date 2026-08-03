import { describe, expect, it } from 'vitest';
import {
  balanceFromEntries,
  netMonthlySavings,
  personAdjustmentShare,
  sharedExpensesDelta,
  suggestsYieldAdjustment,
} from './familySavings';

describe('sharedExpensesDelta', () => {
  it('positivo cuando se gasto menos del presupuesto (bono)', () => {
    expect(sharedExpensesDelta('9208727.52', '9000000').toString()).toBe('208727.52');
  });

  it('negativo cuando se gasto mas del presupuesto (debito) -- a diferencia de sharedExpensesExcess, no se clampea', () => {
    expect(sharedExpensesDelta('9208727.52', '9850299.52').toString()).toBe('-641572');
  });

  it('cero cuando calzo exacto', () => {
    expect(sharedExpensesDelta('9208727.52', '9208727.52').toString()).toBe('0');
  });
});

describe('personAdjustmentShare', () => {
  it('reparte el delta proporcional al ingreso (numeros simples)', () => {
    const total = 100;
    // John gana 60/100, Lina 40/100 -> de un delta de 50, les toca 30 y 20 respectivamente.
    expect(personAdjustmentShare(50, 60, total).toString()).toBe('30');
    expect(personAdjustmentShare(50, 40, total).toString()).toBe('20');
  });

  it('funciona igual con delta negativo (debito repartido)', () => {
    const total = 100;
    expect(personAdjustmentShare(-50, 60, total).toString()).toBe('-30');
  });

  it('con total=0 la parte proporcional es 0 (evita dividir por cero)', () => {
    expect(personAdjustmentShare(50, 0, 0).toString()).toBe('0');
  });
});

describe('netMonthlySavings', () => {
  it('sin gasto grande, es el aporte integro', () => {
    expect(netMonthlySavings('3000000').toString()).toBe('3000000');
  });

  it('resta el gasto grande reportado (ejemplo del ticket: tiquetes aereos)', () => {
    expect(netMonthlySavings('3000000', '2500000').toString()).toBe('500000');
  });

  it('si el gasto grande supera el aporte, queda negativo (retiro neto, sin caso especial)', () => {
    expect(netMonthlySavings('3000000', '4000000').toString()).toBe('-1000000');
  });
});

describe('balanceFromEntries', () => {
  it('suma entradas positivas y negativas', () => {
    expect(
      balanceFromEntries([{ amount: '10000000' }, { amount: '500000' }, { amount: '-200000' }]).toString(),
    ).toBe('10300000');
  });

  it('lista vacia da cero', () => {
    expect(balanceFromEntries([]).toString()).toBe('0');
  });
});

describe('suggestsYieldAdjustment', () => {
  it('true cuando el saldo real es mayor por una diferencia pequena (dentro del umbral)', () => {
    expect(suggestsYieldAdjustment('10150000', '10000000')).toBe(true);
  });

  it('true en el borde exacto del umbral ($200.000)', () => {
    expect(suggestsYieldAdjustment('10200000', '10000000')).toBe(true);
  });

  it('false cuando la diferencia supera el umbral', () => {
    expect(suggestsYieldAdjustment('10200000.01', '10000000')).toBe(false);
  });

  it('false cuando el saldo real es menor al calculado (diferencia negativa)', () => {
    expect(suggestsYieldAdjustment('9900000', '10000000')).toBe(false);
  });

  it('false cuando calzan exacto (no hace falta ajuste)', () => {
    expect(suggestsYieldAdjustment('10000000', '10000000')).toBe(false);
  });

  it('respeta un umbral configurado distinto al default (ticket #36, umbral configurable)', () => {
    expect(suggestsYieldAdjustment('10050000', '10000000', '50000')).toBe(true);
    expect(suggestsYieldAdjustment('10050000.01', '10000000', '50000')).toBe(false);
  });
});
