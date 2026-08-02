import { describe, expect, it } from 'vitest';
import { evaluateRules, type RuleCandidate } from './rulesEngine';

const carulla: RuleCandidate = {
  id: 'r1',
  pattern: 'CARULLA',
  amountSign: 'any',
  setType: 'joint',
  setCategoryId: 'cat-mercado',
  setDetail: null,
  mode: 'auto',
};

const restaurante: RuleCandidate = {
  id: 'r2',
  pattern: 'FRISBY',
  amountSign: 'any',
  setType: 'joint',
  setCategoryId: 'cat-restaurante',
  setDetail: null,
  mode: 'suggest',
};

const intereses: RuleCandidate = {
  id: 'r3',
  pattern: 'ABONO INTERESES',
  amountSign: 'positive',
  setType: 'personal',
  setCategoryId: 'cat-otros',
  setDetail: 'Intereses',
  mode: 'auto',
};

describe('evaluateRules', () => {
  it('sin coincidencias -> outcome none', () => {
    const result = evaluateRules('PAGO DESCONOCIDO XYZ', '-50000', [carulla, restaurante]);
    expect(result.outcome).toBe('none');
  });

  it('una sola coincidencia -> outcome matched con esa regla', () => {
    const result = evaluateRules('CARULLA BOGOTA CL 80', '-132900', [carulla, restaurante]);
    expect(result).toEqual({ outcome: 'matched', rule: carulla });
  });

  it('es case-insensitive', () => {
    const result = evaluateRules('carulla bogota', '-1000', [carulla]);
    expect(result.outcome).toBe('matched');
  });

  it('ignora acentos en la descripcion', () => {
    const conAcento: RuleCandidate = { ...carulla, pattern: 'CAFÉ' };
    const result = evaluateRules('PAGO EN CAFE CENTRAL', '-1000', [conAcento]);
    expect(result.outcome).toBe('matched');
  });

  it('respeta amount_sign: una regla "positive" no calza con un monto negativo', () => {
    const result = evaluateRules('ABONO INTERESES AHORROS', '-500', [intereses]);
    expect(result.outcome).toBe('none');
  });

  it('respeta amount_sign: una regla "positive" calza con un monto positivo', () => {
    const result = evaluateRules('ABONO INTERESES AHORROS', '0.55', [intereses]);
    expect(result).toEqual({ outcome: 'matched', rule: intereses });
  });

  it('dos o mas reglas activas calzan la misma descripcion -> outcome conflict, sin auto-asignar', () => {
    const otraMercado: RuleCandidate = { ...carulla, id: 'r4', pattern: 'BOGOTA' };
    const result = evaluateRules('CARULLA BOGOTA CL 80', '-132900', [carulla, otraMercado]);
    expect(result.outcome).toBe('conflict');
    if (result.outcome === 'conflict') {
      expect(result.candidates.map((c) => c.id).sort()).toEqual(['r1', 'r4']);
    }
  });

  it('evalua todas las reglas, no se detiene en la primera (necesario para detectar conflicto)', () => {
    const rules = [carulla, restaurante, intereses];
    const result = evaluateRules('CARULLA BOGOTA', '-1000', rules);
    expect(result).toEqual({ outcome: 'matched', rule: carulla });
  });
});
