import { describe, expect, it } from 'vitest';
import {
  accountBalanceMatches,
  expensesToDate,
  leaveInAccountAtOpening,
  moveToSavingsAtOpening,
  type ExpenseEntry,
} from './openingReconciliation';

const personal = (amount: string): ExpenseEntry => ({ amount, type: 'personal' });
const joint = (amount: string): ExpenseEntry => ({ amount, type: 'joint' });
const movement = (amount: string): ExpenseEntry => ({ amount, type: 'movement' });
const unclassified = (amount: string): ExpenseEntry => ({ amount, type: 'unclassified' });

describe('expensesToDate', () => {
  it('suma personal y joint como gasto positivo (montos negativos, como el extracto)', () => {
    expect(expensesToDate([personal('-50000'), joint('-132900')]).toString()).toBe('182900');
  });

  it('ignora movement y unclassified', () => {
    expect(expensesToDate([personal('-50000'), movement('-999999'), unclassified('-1')]).toString()).toBe('50000');
  });

  it('un abono positivo (ej. intereses) resta del gastado', () => {
    expect(expensesToDate([personal('-100'), personal('30')]).toString()).toBe('70');
  });

  it('arreglo vacio da cero', () => {
    expect(expensesToDate([]).toString()).toBe('0');
  });
});

describe('leaveInAccountAtOpening', () => {
  it('suma Gastos del Mes + Dinero Personal y resta lo ya gastado', () => {
    expect(leaveInAccountAtOpening('5490768', '1534787.92', '200000').toString()).toBe('6825555.92');
  });

  it('sin gasto a la fecha, es igual a leaveInAccount de summary.ts', () => {
    expect(leaveInAccountAtOpening('5490768', '1534787.92', '0').toString()).toBe('7025555.92');
  });
});

describe('moveToSavingsAtOpening', () => {
  it('es el aporte completo a Ahorros Conjuntos, sin ajustar', () => {
    expect(moveToSavingsAtOpening('4118076').toString()).toBe('4118076');
  });
});

describe('accountBalanceMatches', () => {
  it('true cuando el saldo confirmado calza exacto', () => {
    expect(accountBalanceMatches('6825555.92', '6825555.92')).toBe(true);
  });

  it('false cuando hay diferencia, aunque sea de centavos', () => {
    expect(accountBalanceMatches('6825555.91', '6825555.92')).toBe(false);
  });
});
