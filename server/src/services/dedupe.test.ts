import { describe, expect, it } from 'vitest';
import { dedupeKey, planImport } from './dedupe';

describe('dedupeKey', () => {
  it('es estable para los mismos datos', () => {
    const a = dedupeKey('john', '2026-06-15', 'CARULLA BOGOTA', '-132900');
    const b = dedupeKey('john', '2026-06-15', 'CARULLA BOGOTA', '-132900.00');
    expect(a).toBe(b);
  });

  it('ignora mayusculas/espacios extra en la descripcion', () => {
    const a = dedupeKey('john', '2026-06-15', 'carulla bogota', '-132900');
    const b = dedupeKey('john', '2026-06-15', '  CARULLA BOGOTA  ', '-132900');
    expect(a).toBe(b);
  });

  it('cambia si cambia el dueño, la fecha, la descripcion o el monto', () => {
    const base = dedupeKey('john', '2026-06-15', 'CARULLA BOGOTA', '-132900');
    expect(dedupeKey('lina', '2026-06-15', 'CARULLA BOGOTA', '-132900')).not.toBe(base);
    expect(dedupeKey('john', '2026-06-16', 'CARULLA BOGOTA', '-132900')).not.toBe(base);
    expect(dedupeKey('john', '2026-06-15', 'CARULLA MEDELLIN', '-132900')).not.toBe(base);
    expect(dedupeKey('john', '2026-06-15', 'CARULLA BOGOTA', '-132901')).not.toBe(base);
  });
});

type Row = { dedupeKey: string; label: string };

describe('planImport', () => {
  it('importa todo cuando no hay nada en BD', () => {
    const rows: Row[] = [
      { dedupeKey: 'a', label: '1' },
      { dedupeKey: 'a', label: '2' },
    ];
    const { toImport, toSkip } = planImport(rows, new Map());
    expect(toImport).toHaveLength(2);
    expect(toSkip).toHaveLength(0);
  });

  it('importa max(0, N-M): archivo solapado con lo ya cargado', () => {
    // Caso del PRD: 1-15 jun ya cargado (3 filas de esa key), reimporto 1-20 jun con 5 filas de
    // la misma key -> deben entrar solo 2, las otras 3 quedan para revision de duplicados.
    const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({ dedupeKey: 'k', label: `${i}` }));
    const { toImport, toSkip } = planImport(rows, new Map([['k', 3]]));
    expect(toImport).toHaveLength(2);
    expect(toSkip).toHaveLength(3);
  });

  it('no importa nada si M >= N (nunca resta bajo cero)', () => {
    const rows: Row[] = [{ dedupeKey: 'k', label: '1' }];
    const { toImport, toSkip } = planImport(rows, new Map([['k', 5]]));
    expect(toImport).toHaveLength(0);
    expect(toSkip).toHaveLength(1);
  });

  it('mantiene grupos por key independientes entre si', () => {
    const rows: Row[] = [
      { dedupeKey: 'a', label: 'a1' },
      { dedupeKey: 'b', label: 'b1' },
      { dedupeKey: 'b', label: 'b2' },
    ];
    const { toImport, toSkip } = planImport(rows, new Map([['b', 1]]));
    expect(toImport.map((r) => r.label).sort()).toEqual(['a1', 'b1'].sort());
    expect(toSkip.map((r) => r.label)).toEqual(['b2']);
  });
});
