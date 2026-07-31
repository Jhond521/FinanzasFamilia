import { describe, expect, it } from 'vitest';
import { findMatchCandidates, type MatchableQuickEntry, type MatchableTransaction } from './matching';

const johnEntry = (overrides: Partial<MatchableQuickEntry> = {}): MatchableQuickEntry => ({
  id: 'qe1',
  userId: 'john',
  amount: '-132900',
  date: '2026-06-15',
  ...overrides,
});

const johnTx = (overrides: Partial<MatchableTransaction> = {}): MatchableTransaction => ({
  ownerUserId: 'john',
  amount: '-132900',
  date: '2026-06-15',
  ...overrides,
});

describe('findMatchCandidates', () => {
  it('encuentra un candidato con mismo dueño, monto exacto y misma fecha', () => {
    const result = findMatchCandidates(johnTx(), [johnEntry()]);
    expect(result).toHaveLength(1);
  });

  it('encuentra un candidato hasta 3 dias de diferencia', () => {
    const result = findMatchCandidates(johnTx({ date: '2026-06-18' }), [johnEntry({ date: '2026-06-15' })]);
    expect(result).toHaveLength(1);
  });

  it('no matchea si la diferencia de fecha es mayor a 3 dias', () => {
    const result = findMatchCandidates(johnTx({ date: '2026-06-19' }), [johnEntry({ date: '2026-06-15' })]);
    expect(result).toHaveLength(0);
  });

  it('no matchea si el dueño es distinto', () => {
    const result = findMatchCandidates(johnTx(), [johnEntry({ userId: 'lina' })]);
    expect(result).toHaveLength(0);
  });

  it('no matchea si el monto no es exacto', () => {
    const result = findMatchCandidates(johnTx({ amount: '-132900' }), [johnEntry({ amount: '-132901' })]);
    expect(result).toHaveLength(0);
  });

  it('retorna varios candidatos cuando hay ambiguedad (para resolucion manual)', () => {
    const result = findMatchCandidates(johnTx(), [
      johnEntry({ id: 'qe1' }),
      johnEntry({ id: 'qe2', date: '2026-06-16' }),
    ]);
    expect(result.map((e) => e.id).sort()).toEqual(['qe1', 'qe2']);
  });

  it('matchea aunque los signos no coincidan (RF5: "monto exacto (|valor|)", caso real reportado)', () => {
    // Un quick_entry siempre se guarda negativo (regla de Fase 2), pero la transaction real puede
    // llegar positiva segun como el banco registre ese movimiento puntual (ej. "TRANSF DE ..." en
    // vez de "TRANSF A ..."). Debe matchear igual: es el mismo gasto en plata.
    const result = findMatchCandidates(johnTx({ amount: '84661' }), [johnEntry({ amount: '-84661' })]);
    expect(result).toHaveLength(1);
  });
});
