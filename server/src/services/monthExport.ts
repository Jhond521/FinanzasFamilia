import * as XLSX from 'xlsx';

export type ExportBucketRow = {
  name: string;
  percentage: string;
  budget: string;
  spent: string;
  available: string;
  contributions: { userName: string; amount: string }[];
};

export type ExportPersonClose = {
  userName: string;
  realSavings: string;
  leaveInAccount: string;
};

export type ExportTransactionRow = {
  date: string;
  ownerName: string;
  bankDescription: string;
  detail: string | null;
  typeLabel: string;
  categoryName: string | null;
  amount: string;
};

export type MonthExportInput = {
  monthLabel: string;
  totalIncome: string;
  buckets: ExportBucketRow[];
  sharedExpensesExcess: string;
  perPersonClose: ExportPersonClose[];
  transactions: ExportTransactionRow[];
};

/**
 * Arma el workbook del mes (hoja Resumen + hoja Transacciones) para RF7/Fase 6. Los montos llegan
 * como string decimal (igual que el resto de la API/BD, nunca float) y solo se convierten a
 * `number` aqui, al escribir la celda -- es el unico punto de conversion permitido (CLAUDE.md).
 */
export function buildMonthExportWorkbook(input: MonthExportInput): XLSX.WorkBook {
  const personNames = input.perPersonClose.map((p) => p.userName);

  const resumenRows: (string | number)[][] = [
    ['Mes', input.monthLabel],
    ['Ingresos totales', Number(input.totalIncome)],
    [],
    ['Bolsa', '%', 'Presupuesto', 'Gastado', 'Disponible', ...personNames.map((name) => `Aporte ${name}`)],
    ...input.buckets.map((bucket) => [
      bucket.name,
      Number(bucket.percentage),
      Number(bucket.budget),
      Number(bucket.spent),
      Number(bucket.available),
      ...personNames.map((name) => {
        const contribution = bucket.contributions.find((c) => c.userName === name);
        return contribution ? Number(contribution.amount) : '';
      }),
    ]),
    [],
    ['Cierre del mes · ahorro real'],
    ['Exceso Gastos del Mes', Number(input.sharedExpensesExcess)],
    ['Persona', 'Mueve a ahorros', 'Deja en cuenta'],
    ...input.perPersonClose.map((p) => [p.userName, Number(p.realSavings), Number(p.leaveInAccount)]),
  ];

  const transaccionesRows: (string | number | null)[][] = [
    ['Fecha', 'Dueño', 'Descripción banco', 'Detalle', 'Tipo', 'Categoría', 'Valor'],
    ...input.transactions.map((tx) => [
      tx.date,
      tx.ownerName,
      tx.bankDescription,
      tx.detail,
      tx.typeLabel,
      tx.categoryName,
      Number(tx.amount),
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(resumenRows), 'Resumen');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(transaccionesRows), 'Transacciones');
  return workbook;
}
