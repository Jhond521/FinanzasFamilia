import * as XLSX from 'xlsx';
import * as cpexcel from 'xlsx/dist/cpexcel';
import { parseStatementAmount, parseStatementDate } from './statementParsing';

// Tabla completa de codepages: sin esto, SheetJS solo reconoce UTF-8 (65001) de verdad y avisa
// "Codepage tables are not loaded" — un .csv real exportado desde Excel en Colombia bien podria
// venir en Windows-1252 (1252) en vez de UTF-8.
XLSX.set_cptable(cpexcel);

export type NuRawRow = {
  Fecha: string | number | Date;
  Descripción: string;
  Valor: string | number;
};

export type ParsedCardItemRow = {
  date: string; // YYYY-MM-DD
  description: string;
  amount: string; // string decimal, siempre positivo (docs/02-modelo-de-datos.md)
};

/** Lee el extracto Nu (buffer .xlsx o .csv — SheetJS detecta el formato) de la primera hoja. */
export function readNuWorkbook(buffer: Buffer): NuRawRow[] {
  // codepage 65001 (UTF-8): sin esto, SheetJS decodifica mal los acentos al leer un .csv
  // (ej. "Descripción" llega como "DescripciÃ³n" y la columna no se reconoce).
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, codepage: 65001 });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<NuRawRow>(sheet, { raw: false, defval: '' });
}

/**
 * Normaliza una fila cruda del extracto Nu (Fecha, Descripción, Valor) al formato interno.
 * Formato de columnas asumido — Nu no publica un layout de export oficial (a diferencia de
 * Bancolombia); ajustar cuando se tenga un archivo real (decision confirmada del ticket #3).
 * El monto siempre se guarda positivo (docs/02), sin importar el signo del archivo.
 */
export function normalizeNuRow(row: NuRawRow): ParsedCardItemRow {
  const rawAmount = parseStatementAmount(row.Valor);
  const amount = rawAmount.startsWith('-') ? rawAmount.slice(1) : rawAmount;
  return {
    date: parseStatementDate(row.Fecha),
    description: String(row['Descripción'] ?? '').trim(),
    amount,
  };
}

/** Atajo: lee el buffer y normaliza todas las filas en un solo paso. */
export function parseNuFile(buffer: Buffer): ParsedCardItemRow[] {
  return readNuWorkbook(buffer).map(normalizeNuRow);
}
