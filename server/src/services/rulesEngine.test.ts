import { describe, expect, it } from 'vitest';
import { evaluateRules, type RuleCandidate, type RuleTarget } from './rulesEngine';

const JOHN = 'user-john';
const LINA = 'user-lina';

function tx(bankDescription: string, amount: string, extra: Partial<RuleTarget> = {}): RuleTarget {
  return { bankDescription, amount, bankReference: null, ownerUserId: JOHN, ...extra };
}

const NO_EXTRA_CONDITIONS = { referencePattern: null, amount: null, ownerUserId: null } as const;

const carulla: RuleCandidate = {
  id: 'r1',
  pattern: 'CARULLA',
  amountSign: 'any',
  ...NO_EXTRA_CONDITIONS,
  setType: 'joint',
  setCategoryId: 'cat-mercado',
  setDetail: null,
  mode: 'auto',
};

const restaurante: RuleCandidate = {
  id: 'r2',
  pattern: 'FRISBY',
  amountSign: 'any',
  ...NO_EXTRA_CONDITIONS,
  setType: 'joint',
  setCategoryId: 'cat-restaurante',
  setDetail: null,
  mode: 'suggest',
};

const intereses: RuleCandidate = {
  id: 'r3',
  pattern: 'ABONO INTERESES',
  amountSign: 'positive',
  ...NO_EXTRA_CONDITIONS,
  setType: 'personal',
  setCategoryId: 'cat-otros',
  setDetail: 'Intereses',
  mode: 'auto',
};

describe('evaluateRules', () => {
  it('sin coincidencias -> outcome none', () => {
    const result = evaluateRules(tx('PAGO DESCONOCIDO XYZ', '-50000'), [carulla, restaurante]);
    expect(result.outcome).toBe('none');
  });

  it('una sola coincidencia -> outcome matched con esa regla', () => {
    const result = evaluateRules(tx('CARULLA BOGOTA CL 80', '-132900'), [carulla, restaurante]);
    expect(result).toEqual({ outcome: 'matched', rule: carulla });
  });

  it('es case-insensitive', () => {
    const result = evaluateRules(tx('carulla bogota', '-1000'), [carulla]);
    expect(result.outcome).toBe('matched');
  });

  it('ignora acentos en la descripcion', () => {
    const conAcento: RuleCandidate = { ...carulla, pattern: 'CAFÉ' };
    const result = evaluateRules(tx('PAGO EN CAFE CENTRAL', '-1000'), [conAcento]);
    expect(result.outcome).toBe('matched');
  });

  it('respeta amount_sign: una regla "positive" no calza con un monto negativo', () => {
    const result = evaluateRules(tx('ABONO INTERESES AHORROS', '-500'), [intereses]);
    expect(result.outcome).toBe('none');
  });

  it('respeta amount_sign: una regla "positive" calza con un monto positivo', () => {
    const result = evaluateRules(tx('ABONO INTERESES AHORROS', '0.55'), [intereses]);
    expect(result).toEqual({ outcome: 'matched', rule: intereses });
  });

  it('dos o mas reglas activas calzan la misma descripcion -> outcome conflict, sin auto-asignar', () => {
    const otraMercado: RuleCandidate = { ...carulla, id: 'r4', pattern: 'BOGOTA' };
    const result = evaluateRules(tx('CARULLA BOGOTA CL 80', '-132900'), [carulla, otraMercado]);
    expect(result.outcome).toBe('conflict');
    if (result.outcome === 'conflict') {
      expect(result.candidates.map((c) => c.id).sort()).toEqual(['r1', 'r4']);
    }
  });

  it('evalua todas las reglas, no se detiene en la primera (necesario para detectar conflicto)', () => {
    const rules = [carulla, restaurante, intereses];
    const result = evaluateRules(tx('CARULLA BOGOTA', '-1000'), rules);
    expect(result).toEqual({ outcome: 'matched', rule: carulla });
  });
});

describe('evaluateRules — condiciones combinadas (##97)', () => {
  const nequiGenerica: RuleCandidate = {
    id: 'nequi',
    pattern: 'NEQUI',
    amountSign: 'any',
    ...NO_EXTRA_CONDITIONS,
    setType: 'joint',
    setCategoryId: null,
    setDetail: null,
    mode: 'auto',
  };
  const ayudaPapa: RuleCandidate = {
    ...nequiGenerica,
    id: 'ayuda-papa',
    referencePattern: '3206746644',
    amount: '500000',
    ownerUserId: JOHN,
    setType: 'personal',
    setDetail: 'Ayuda papá',
  };
  const transferenciaPapa = tx('NEQUI TRANSFERENCIA', '-500000', { bankReference: '3206746644' });

  it('calza cuando se cumplen descripcion + referencia + monto + dueño', () => {
    expect(evaluateRules(transferenciaPapa, [ayudaPapa])).toEqual({ outcome: 'matched', rule: ayudaPapa });
  });

  it('no calza con otro monto', () => {
    expect(evaluateRules({ ...transferenciaPapa, amount: '-300000' }, [ayudaPapa]).outcome).toBe('none');
  });

  it('el monto se compara en valor absoluto (igual calza si el extracto lo trae positivo)', () => {
    expect(evaluateRules({ ...transferenciaPapa, amount: '500000.00' }, [ayudaPapa]).outcome).toBe('matched');
  });

  it('no calza con otra referencia', () => {
    expect(evaluateRules({ ...transferenciaPapa, bankReference: '3001112233' }, [ayudaPapa]).outcome).toBe('none');
  });

  it('una transaccion sin referencia no calza una regla que exige referencia', () => {
    expect(evaluateRules({ ...transferenciaPapa, bankReference: null }, [ayudaPapa]).outcome).toBe('none');
  });

  it('la referencia se compara por "contiene", sin mayusculas ni acentos', () => {
    const porTexto: RuleCandidate = { ...nequiGenerica, id: 'txt', referencePattern: 'pápa' };
    expect(evaluateRules(tx('NEQUI', '-1', { bankReference: 'ENVIO A PAPA 01' }), [porTexto]).outcome).toBe('matched');
  });

  it('no calza en el extracto de otro dueño', () => {
    expect(evaluateRules({ ...transferenciaPapa, ownerUserId: LINA }, [ayudaPapa]).outcome).toBe('none');
  });

  it('la regla mas especifica le gana a la generica, sin conflicto', () => {
    expect(evaluateRules(transferenciaPapa, [nequiGenerica, ayudaPapa])).toEqual({ outcome: 'matched', rule: ayudaPapa });
  });

  it('si la especifica no calza, aplica la generica', () => {
    const otra = tx('NEQUI TRANSFERENCIA', '-80000', { bankReference: '3001112233' });
    expect(evaluateRules(otra, [nequiGenerica, ayudaPapa])).toEqual({ outcome: 'matched', rule: nequiGenerica });
  });

  it('empate en la especificidad maxima -> conflict solo entre las empatadas', () => {
    const otraConMonto: RuleCandidate = { ...nequiGenerica, id: 'monto', amount: '500000', setDetail: 'Otro' };
    const otraConDueno: RuleCandidate = { ...nequiGenerica, id: 'dueno', ownerUserId: JOHN };
    const result = evaluateRules(transferenciaPapa, [nequiGenerica, otraConMonto, otraConDueno]);
    expect(result.outcome).toBe('conflict');
    if (result.outcome === 'conflict') {
      expect(result.candidates.map((c) => c.id).sort()).toEqual(['dueno', 'monto']);
    }
  });
});
