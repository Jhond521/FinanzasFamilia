import { describe, expect, it } from 'vitest';
import { jointSpent, jointSpentByUser, personalSpent, type SpendingEntry } from './spending';

const joint = (amount: string, status: SpendingEntry['status'] = 'pending', userId = 'john'): SpendingEntry => ({
  userId,
  amount,
  type: 'joint',
  status,
});

const personal = (userId: string, amount: string, status: SpendingEntry['status'] = 'pending'): SpendingEntry => ({
  userId,
  amount,
  type: 'personal',
  status,
});

describe('jointSpent', () => {
  it('suma los montos negativos como gasto positivo', () => {
    expect(jointSpent([joint('-132900'), joint('-48200')]).toString()).toBe('181100');
  });

  it('ignora registros de tipo personal', () => {
    expect(jointSpent([joint('-100'), personal('john', '-999')]).toString()).toBe('100');
  });

  it('excluye registros con status matched (se cuentan por la transaccion, Fase 3)', () => {
    expect(jointSpent([joint('-100'), joint('-50', 'matched')]).toString()).toBe('100');
  });

  it('incluye no_match_expected (no es lo mismo que matched)', () => {
    expect(jointSpent([joint('-100', 'no_match_expected')]).toString()).toBe('100');
  });

  it('arreglo vacio da cero', () => {
    expect(jointSpent([]).toString()).toBe('0');
  });
});

describe('personalSpent', () => {
  it('suma solo los registros personales de la persona pedida', () => {
    const entries = [personal('john', '-50000'), personal('lina', '-30000'), personal('john', '-20000')];
    expect(personalSpent(entries, 'john').toString()).toBe('70000');
    expect(personalSpent(entries, 'lina').toString()).toBe('30000');
  });

  it('ignora registros de tipo joint', () => {
    expect(personalSpent([joint('-100'), personal('john', '-200')], 'john').toString()).toBe('200');
  });

  it('excluye registros con status matched', () => {
    expect(personalSpent([personal('john', '-100'), personal('john', '-50', 'matched')], 'john').toString()).toBe(
      '100',
    );
  });

  it('persona sin registros da cero', () => {
    expect(personalSpent([personal('john', '-100')], 'lina').toString()).toBe('0');
  });

  it('un abono/interes positivo tipo personal resta del gastado (docs/02-modelo-de-datos.md)', () => {
    // 100 de gasto real, pero llega un abono de 30 (ej. reembolso) -> el gastado neto es 70.
    expect(personalSpent([personal('john', '-100'), personal('john', '30')], 'john').toString()).toBe('70');
  });

  it('acepta entradas sin status (transactions de Fase 3), siempre cuentan', () => {
    const entry: SpendingEntry = { userId: 'john', amount: '-100', type: 'personal' };
    expect(personalSpent([entry], 'john').toString()).toBe('100');
  });
});

describe('jointSpentByUser', () => {
  it('suma solo los registros conjuntos de la persona pedida', () => {
    const entries = [
      joint('-50000', 'pending', 'john'),
      joint('-30000', 'pending', 'lina'),
      joint('-20000', 'pending', 'john'),
    ];
    expect(jointSpentByUser(entries, 'john').toString()).toBe('70000');
    expect(jointSpentByUser(entries, 'lina').toString()).toBe('30000');
  });

  it('ignora registros de tipo personal', () => {
    expect(jointSpentByUser([personal('john', '-100'), joint('-200', 'pending', 'john')], 'john').toString()).toBe(
      '200',
    );
  });

  it('excluye registros con status matched', () => {
    const entries = [joint('-100', 'pending', 'john'), joint('-50', 'matched', 'john')];
    expect(jointSpentByUser(entries, 'john').toString()).toBe('100');
  });

  it('persona sin registros da cero', () => {
    expect(jointSpentByUser([joint('-100', 'pending', 'john')], 'lina').toString()).toBe('0');
  });
});
