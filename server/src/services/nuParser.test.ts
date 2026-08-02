import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { normalizeNuRow, parseNuFile } from './nuParser';

describe('normalizeNuRow', () => {
  it('normaliza fecha y descripcion igual que el parser de Bancolombia', () => {
    const row = normalizeNuRow({ Fecha: '2026/06/15', Descripción: '  RAPPI DELIVERY  ', Valor: '45000' });
    expect(row.date).toBe('2026-06-15');
    expect(row.description).toBe('RAPPI DELIVERY');
  });

  it('acepta fecha con mes primero "7/31/26"', () => {
    const row = normalizeNuRow({ Fecha: '7/31/26', Descripción: 'NETFLIX', Valor: '29900' });
    expect(row.date).toBe('2026-07-31');
  });

  it('limpia "$" y comas de miles del monto', () => {
    const row = normalizeNuRow({ Fecha: '2026/06/15', Descripción: 'RAPPI', Valor: '$45,000.00' });
    expect(row.amount).toBe('45000.00');
  });

  it('conserva el signo negativo del archivo (devoluciones, cancelaciones o ajustes que restan)', () => {
    const row = normalizeNuRow({ Fecha: '2026/06/15', Descripción: 'DEVOLUCION COMPRA', Valor: '-32000' });
    expect(row.amount).toBe('-32000');
  });
});

describe('parseNuFile', () => {
  it('lee un .xlsx real (buffer)', () => {
    const worksheet = XLSX.utils.json_to_sheet([
      { Fecha: '2026/06/15', Descripción: 'RAPPI DELIVERY', Valor: '45000' },
      { Fecha: '2026/06/16', Descripción: 'NETFLIX', Valor: '29900' },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimientos');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const rows = parseNuFile(buffer);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ date: '2026-06-15', description: 'RAPPI DELIVERY', amount: '45000' });
  });

  it('lee un .csv real (buffer) — mismo parser, SheetJS detecta el formato', () => {
    const csv = 'Fecha,Descripción,Valor\n2026/06/17,SMARTFIT,89900\n';
    const buffer = Buffer.from(csv, 'utf8');

    const rows = parseNuFile(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ date: '2026-06-17', description: 'SMARTFIT', amount: '89900' });
  });
});
