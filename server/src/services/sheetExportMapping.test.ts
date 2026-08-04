import { describe, expect, it } from 'vitest';
import { findLabelRowIndex, mapTransactionToSheetRow } from './sheetExportMapping';

describe('mapTransactionToSheetRow', () => {
  it('mapea una transaccion personal al orden de columnas del Sheet', () => {
    const row = mapTransactionToSheetRow({
      date: '2026-07-15',
      detail: 'Mercado semana',
      bankDescription: 'CARULLA BOGOTA',
      bankReference: '123456',
      amount: '-132900',
      type: 'joint',
      ownerName: 'Lina',
    });
    expect(row).toEqual(['2026-07-15', 'Mercado semana', '', 'CARULLA BOGOTA', '123456', -132900, 'Conjunto', 'Lina']);
  });

  it('mapea los 3 tipos a las etiquetas exactas del dropdown del Sheet', () => {
    const base = { date: '2026-07-01', detail: null, bankDescription: 'X', bankReference: null, amount: '100', ownerName: 'John' } as const;
    expect(mapTransactionToSheetRow({ ...base, type: 'personal' })[6]).toBe('Personal');
    expect(mapTransactionToSheetRow({ ...base, type: 'joint' })[6]).toBe('Conjunto');
    expect(mapTransactionToSheetRow({ ...base, type: 'movement' })[6]).toBe('Movimientos');
  });

  it('Oficina siempre queda vacia (sin equivalente en nuestros datos)', () => {
    const row = mapTransactionToSheetRow({
      date: '2026-07-01',
      detail: null,
      bankDescription: 'X',
      bankReference: null,
      amount: '100',
      type: 'personal',
      ownerName: 'John',
    });
    expect(row[2]).toBe('');
  });

  it('Detalles y Referencia vacios (null) se escriben como string vacio, no "null"', () => {
    const row = mapTransactionToSheetRow({
      date: '2026-07-01',
      detail: null,
      bankDescription: 'X',
      bankReference: null,
      amount: '100',
      type: 'personal',
      ownerName: 'John',
    });
    expect(row[1]).toBe('');
    expect(row[4]).toBe('');
  });

  it('el monto se escribe como numero, preservando el signo (gastos negativos)', () => {
    const row = mapTransactionToSheetRow({
      date: '2026-07-01',
      detail: null,
      bankDescription: 'X',
      bankReference: null,
      amount: '-50000.55',
      type: 'personal',
      ownerName: 'John',
    });
    expect(row[5]).toBe(-50000.55);
    expect(typeof row[5]).toBe('number');
  });
});

describe('findLabelRowIndex', () => {
  it('encuentra el indice de una celda que empieza exactamente con el label', () => {
    const column = ['[Mes] 2026', 'Ingreso Mes John (Despues Deducciones)', 'Ingreso Mes Lina (Despues Deducciones)'];
    expect(findLabelRowIndex(column, 'Ingreso Mes John')).toBe(1);
    expect(findLabelRowIndex(column, 'Ingreso Mes Lina')).toBe(2);
  });

  it('encuentra el header "Fecha" de la tabla de transacciones', () => {
    const column = ['Entra a la Cuenta', 'Sale de la Cuenta', 'Fecha', '', ''];
    expect(findLabelRowIndex(column, 'Fecha')).toBe(2);
  });

  it('devuelve null si el label no aparece', () => {
    expect(findLabelRowIndex(['a', 'b', 'c'], 'Ingreso Mes John')).toBeNull();
  });

  it('ignora celdas vacias/undefined/null sin lanzar', () => {
    const column = ['', undefined, null, 'Ingreso Mes John (Despues Deducciones)'];
    expect(findLabelRowIndex(column, 'Ingreso Mes John')).toBe(3);
  });

  it('no matchea una coincidencia parcial en medio del texto (solo al inicio)', () => {
    expect(findLabelRowIndex(['Total Ingreso Mes John'], 'Ingreso Mes John')).toBeNull();
  });
});
