import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { normalizeBancolombiaRow, parseBancolombiaFile } from './xlsxParser';

describe('normalizeBancolombiaRow', () => {
  it('acepta fecha con guiones de 2 digitos "2026/06/01"', () => {
    const row = normalizeBancolombiaRow({ Fecha: '2026/06/01', Descripción: 'CARULLA BOGOTA', Valor: '-132900' });
    expect(row.date).toBe('2026-06-01');
  });

  it('acepta fecha sin ceros a la izquierda "2026/6/1"', () => {
    const row = normalizeBancolombiaRow({ Fecha: '2026/6/1', Descripción: 'CARULLA BOGOTA', Valor: '-132900' });
    expect(row.date).toBe('2026-06-01');
  });

  it('acepta la fecha ya como Date (celda tipada como fecha en el xlsx)', () => {
    const row = normalizeBancolombiaRow({
      Fecha: new Date('2026-06-15T00:00:00.000Z'),
      Descripción: 'CARULLA BOGOTA',
      Valor: '-132900',
    });
    expect(row.date).toBe('2026-06-15');
  });

  it('rechaza una fecha con formato irreconocible', () => {
    expect(() => normalizeBancolombiaRow({ Fecha: '15 de junio', Descripción: 'X', Valor: '1' })).toThrow();
  });

  it('limpia "$" y comas de miles del monto, preservando el signo', () => {
    const row = normalizeBancolombiaRow({ Fecha: '2026/06/15', Descripción: 'CARULLA BOGOTA', Valor: '-$132,900.00' });
    expect(row.amount).toBe('-132900.00');
  });

  it('acepta el monto ya como numero', () => {
    const row = normalizeBancolombiaRow({ Fecha: '2026/06/16', Descripción: 'ABONO INTERESES AHORROS', Valor: 0.55 });
    expect(row.amount).toBe('0.55');
  });

  it('conserva la descripcion y referencia tal cual, sin recortar mayusculas', () => {
    const row = normalizeBancolombiaRow({
      Fecha: '2026/06/15',
      Descripción: '  CARULLA BOGOTA  ',
      Referencia: ' REF123 ',
      Valor: '-132900',
    });
    expect(row.bankDescription).toBe('CARULLA BOGOTA');
    expect(row.bankReference).toBe('REF123');
  });

  it('referencia vacia queda null, no string vacio', () => {
    const row = normalizeBancolombiaRow({ Fecha: '2026/06/15', Descripción: 'X', Valor: '1' });
    expect(row.bankReference).toBeNull();
  });
});

describe('parseBancolombiaFile', () => {
  it('lee un .xlsx real (buffer) con las columnas del banco', () => {
    const worksheet = XLSX.utils.json_to_sheet([
      { Fecha: '2026/06/15', Descripción: 'CARULLA BOGOTA', Referencia: 'REF1', Valor: '-132900' },
      { Fecha: '2026/06/16', Descripción: 'ABONO INTERESES AHORROS', Referencia: 'REF2', Valor: 0.55 },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimientos');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const rows = parseBancolombiaFile(buffer);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      date: '2026-06-15',
      bankDescription: 'CARULLA BOGOTA',
      bankReference: 'REF1',
      amount: '-132900',
    });
    expect(rows[1].amount).toBe('0.55');
  });
});
