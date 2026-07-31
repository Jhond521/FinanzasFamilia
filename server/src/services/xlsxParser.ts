import * as XLSX from 'xlsx';
import { parseStatementAmount, parseStatementDate } from './statementParsing';

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
 * formato interno. Tolerante a fechas "2026/06/01" y "2026/6/1" (año primero) y a "7/31/26" o
 * "07/31/2026" (mes primero, como exportan los archivos reales de Bancolombia — el mes va
 * primero, MM/DD/AA(AA), no DD/MM como el uso hablado en Colombia), o ya como Date si la celda
 * vino tipada como fecha. Tambien tolerante a montos con "$" y comas de miles (docs/01-prd.md RF4).
 */
export function normalizeBancolombiaRow(row: BancolombiaRawRow): ParsedTransactionRow {
  return {
    date: parseStatementDate(row.Fecha),
    bankDescription: String(row['Descripción'] ?? '').trim(),
    bankReference: row.Referencia ? String(row.Referencia).trim() : null,
    amount: parseStatementAmount(row.Valor),
  };
}

/** Atajo: lee el buffer y normaliza todas las filas en un solo paso. */
export function parseBancolombiaFile(buffer: Buffer): ParsedTransactionRow[] {
  return readBancolombiaWorkbook(buffer).map(normalizeBancolombiaRow);
}
