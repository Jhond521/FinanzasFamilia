import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildMonthExportWorkbook } from './monthExport';

function sheetRows(workbook: XLSX.WorkBook, name: string): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1 });
}

describe('buildMonthExportWorkbook', () => {
  const input = {
    monthLabel: 'Julio 2026',
    totalIncome: '19184849',
    buckets: [
      {
        name: 'Ahorros Conjuntos',
        percentage: '36',
        budget: '6906545.64',
        spent: '0',
        available: '6906545.64',
        contributions: [
          { userName: 'John', amount: '4118076' },
          { userName: 'Lina', amount: '2788469.64' },
        ],
      },
      {
        name: 'Gastos del Mes',
        percentage: '48',
        budget: '9208727.52',
        spent: '11275695.47',
        available: '-2066967.95',
        contributions: [
          { userName: 'John', amount: '5490768' },
          { userName: 'Lina', amount: '3717959.52' },
        ],
      },
    ],
    // Regresion Julio 2026 (ticket #47): John gasto 8,162,194.78 de su presupuesto de 5,490,768
    // (se paso), Lina gasto 3,113,500.69 de 3,717,959.52 (le sobro) -- cada quien responde por su
    // propia bolsa, ya no se reparte el excedente del hogar proporcional al ingreso.
    sharedExpensesExcess: '2066967.95',
    perPersonClose: [
      { userName: 'John', realSavings: '1446649.22', leaveInAccount: '7025555.92' },
      { userName: 'Lina', realSavings: '3392928.47', leaveInAccount: '5252747.44' },
    ],
    transactions: [
      {
        date: '2026-07-15',
        ownerName: 'Lina',
        bankDescription: 'CARULLA BOGOTA',
        detail: 'Mercado semana',
        typeLabel: 'Conjunto',
        categoryName: 'Mercado',
        amount: '-132900',
      },
      {
        date: '2026-07-16',
        ownerName: 'Lina',
        bankDescription: 'ABONO INTERESES AHORROS',
        detail: null,
        typeLabel: 'Personal',
        categoryName: 'Otros',
        amount: '0.55',
      },
    ],
  };

  it('tiene las hojas Resumen y Transacciones', () => {
    const workbook = buildMonthExportWorkbook(input);
    expect(workbook.SheetNames).toEqual(['Resumen', 'Transacciones']);
  });

  it('escribe los montos como numero, no como string, preservando el valor exacto', () => {
    const workbook = buildMonthExportWorkbook(input);
    const rows = sheetRows(workbook, 'Resumen');
    const ahorrosRow = rows.find((r) => r[0] === 'Ahorros Conjuntos') as unknown[];
    expect(typeof ahorrosRow[2]).toBe('number');
    expect(ahorrosRow[2]).toBe(6906545.64);
    expect(ahorrosRow[5]).toBe(4118076);
    expect(ahorrosRow[6]).toBe(2788469.64);
  });

  it('preserva el disponible negativo cuando la bolsa se paso del presupuesto', () => {
    const workbook = buildMonthExportWorkbook(input);
    const rows = sheetRows(workbook, 'Resumen');
    const gastosRow = rows.find((r) => r[0] === 'Gastos del Mes') as unknown[];
    expect(gastosRow[4]).toBe(-2066967.95);
  });

  it('incluye el bloque de cierre con ahorro real y dejar en cuenta por persona', () => {
    const workbook = buildMonthExportWorkbook(input);
    const rows = sheetRows(workbook, 'Resumen');
    const johnRow = rows.find((r) => r[0] === 'John' && typeof r[1] === 'number' && r[1] === 1446649.22) as unknown[];
    expect(johnRow[2]).toBe(7025555.92);
  });

  it('la hoja de transacciones preserva el signo (gasto negativo, abono positivo) sin re-derivar', () => {
    const workbook = buildMonthExportWorkbook(input);
    const rows = sheetRows(workbook, 'Transacciones');
    const carulla = rows.find((r) => r[2] === 'CARULLA BOGOTA') as unknown[];
    expect(carulla[6]).toBe(-132900);
    const abono = rows.find((r) => r[2] === 'ABONO INTERESES AHORROS') as unknown[];
    expect(abono[6]).toBe(0.55);
  });
});
