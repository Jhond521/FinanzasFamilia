import { describe, expect, it } from 'vitest';
import { cardMonthProgress, itemsTotal, splitByType, type CardItemEntry } from './cardProgress';

const item = (amount: string, type: 'personal' | 'joint' = 'joint'): CardItemEntry => ({ amount, type });

describe('itemsTotal', () => {
  it('suma los montos de los items', () => {
    expect(itemsTotal([item('100000'), item('50000')]).toString()).toBe('150000');
  });

  it('arreglo vacio da cero', () => {
    expect(itemsTotal([]).toString()).toBe('0');
  });
});

describe('cardMonthProgress', () => {
  it('status "matched" (verde) cuando la suma de items cuadra exacto con lo pagado', () => {
    const result = cardMonthProgress('150000', [item('100000'), item('50000')]);
    expect(result.itemsTotal.toString()).toBe('150000');
    expect(result.diff.toString()).toBe('0');
    expect(result.status).toBe('matched');
  });

  it('status "short" (advertencia) cuando falta registrar (items < pagado)', () => {
    const result = cardMonthProgress('612400', [item('598900')]);
    expect(result.diff.toString()).toBe('13500');
    expect(result.status).toBe('short');
  });

  it('status "over" (rojo) cuando se registro de mas (items > pagado)', () => {
    const result = cardMonthProgress('100000', [item('60000'), item('50000')]);
    expect(result.diff.toString()).toBe('-10000');
    expect(result.status).toBe('over');
  });

  it('sin items registrados, diff = amountPaid completo', () => {
    const result = cardMonthProgress('50000', []);
    expect(result.diff.toString()).toBe('50000');
    expect(result.status).toBe('short');
  });
});

describe('splitByType', () => {
  it('separa personal vs conjunto y calcula el porcentaje de cada uno', () => {
    const items = [item('372900', 'personal'), item('226000', 'joint')];
    const result = splitByType(items);
    expect(result.personal.toString()).toBe('372900');
    expect(result.joint.toString()).toBe('226000');
    expect(result.personalPercentage.toDecimalPlaces(2).toString()).toBe('62.26');
    expect(result.jointPercentage.toDecimalPlaces(2).toString()).toBe('37.74');
  });

  it('un item de ajuste cuenta igual segun su type', () => {
    const items = [item('100000', 'joint')];
    const result = splitByType(items);
    expect(result.joint.toString()).toBe('100000');
  });

  it('sin items, porcentajes en cero (no divide por cero)', () => {
    const result = splitByType([]);
    expect(result.personalPercentage.toString()).toBe('0');
    expect(result.jointPercentage.toString()).toBe('0');
  });
});
