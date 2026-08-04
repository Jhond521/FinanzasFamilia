import { describe, expect, it } from 'vitest';
import {
  balanceFromEntries,
  netMonthlySavings,
  personSharedExpensesDelta,
  suggestsYieldAdjustment,
} from './familySavings';

describe('personSharedExpensesDelta', () => {
  it('positivo cuando la persona gasto menos de SU presupuesto (bono)', () => {
    expect(personSharedExpensesDelta('9208727.52', '9000000').toString()).toBe('208727.52');
  });

  it('negativo cuando la persona gasto mas de SU presupuesto (retiro) -- no se clampea', () => {
    expect(personSharedExpensesDelta('9208727.52', '9850299.52').toString()).toBe('-641572');
  });

  it('cero cuando calzo exacto', () => {
    expect(personSharedExpensesDelta('9208727.52', '9208727.52').toString()).toBe('0');
  });

  it('regresion Julio 2026 (tickets #47 + ##53): cada persona responde por su propia bolsa, con el presupuesto ya corregido', () => {
    // Presupuesto de Gastos del Mes ya reconciliado con el resto de bolsas (ticket ##53) -- antes
    // el presupuesto de John era 5,490,768.00 (formula vieja); ahora es 5,659,606.90.
    // John se paso de su presupuesto -> retiro de sus ahorros.
    expect(personSharedExpensesDelta('5659606.90', '8162194.78').toString()).toBe('-2502587.88');
    // Lina gasto menos de su presupuesto -> bono a sus ahorros.
    expect(personSharedExpensesDelta('3549120.62', '3113500.69').toString()).toBe('435619.93');
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
