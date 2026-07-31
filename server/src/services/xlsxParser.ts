import * as XLSX from 'xlsx';

export type BancolombiaRawRow = {
  Fecha: string | number | Date;
  Descripción: string;
  Referencia?: string;
  Valor: string | number;
};

export type ParsedTransactionRow = {
  date: string; // YYYY-MM-DD
  bankDescription: string;
  bankReference: string | null;
  amount: string; // string decimal, con el signo tal cual viene del banco
};

/** Lee el .xlsx (buffer subido) y devuelve las filas crudas de la primera hoja. */
export function readBancolombiaWorkbook(buffer: Buffer): BancolombiaRawRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<BancolombiaRawRow>(sheet, { raw: false, defval: '' });
}

/**
 * Normaliza una fila cruda del extracto Bancolombia (Fecha, Descripción, Referencia, Valor) al
 * formato interno. Tolerante a fechas "2026/06/01" y "2026/6/1" (o ya como Date si la celda vino
 * tipada como fecha), y a montos con "$" y comas de miles (docs/01-prd.md RF4).
 */
export function normalizeBancolombiaRow(row: BancolombiaRawRow): ParsedTransactionRow {
  return {
    date: normalizeDate(row.Fecha),
    bankDescription: String(row['Descripción'] ?? '').trim(),
    bankReference: row.Referencia ? String(row.Referencia).trim() : null,
    amount: normalizeAmount(row.Valor),
  };
}

function normalizeDate(value: string | number | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  const match = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) {
    throw new Error(`Fecha invalida en el extracto: "${str}"`);
  }
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeAmount(value: string | number): string {
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  // Se asume "," como separador de miles y "." como decimal (formato tipico de export de banco);
  // ajustar aqui si los archivos reales de junio usan otra convencion (ver criterio de aceptacion
  // del ticket #2 sobre probar contra los archivos reales).
  const cleaned = value.replace(/\$/g, '').replace(/\s/g, '').replace(/,/g, '').trim();
  if (cleaned === '' || Number.isNaN(Number(cleaned))) {
    throw new Error(`Monto invalido en el extracto: "${value}"`);
  }
  return cleaned;
}

/** Atajo: lee el buffer y normaliza todas las filas en un solo paso. */
export function parseBancolombiaFile(buffer: Buffer): ParsedTransactionRow[] {
  return readBancolombiaWorkbook(buffer).map(normalizeBancolombiaRow);
}
