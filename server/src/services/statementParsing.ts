/**
 * Normalizacion de fecha/monto compartida entre parsers de extractos (Bancolombia, Nu Bank).
 * Tolerante a fechas "2026/06/01" (año primero) y "7/31/26" / "07/31/2026" (mes primero, formato
 * real de Bancolombia — ver ticket #2), o ya como Date si la celda vino tipada como fecha.
 * Tolerante a montos con "$" y comas de miles (docs/01-prd.md RF4).
 */
export function parseStatementDate(value: string | number | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const str = String(value).trim();

  // Año primero: "2026/06/01" o "2026-6-1".
  const yearFirst = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (yearFirst) {
    const [, year, month, day] = yearFirst;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Mes primero: "7/31/26" o "07/31/2026" (MM/DD/AA(AA)).
  const monthFirst = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (monthFirst) {
    const [, month, day, yearRaw] = monthFirst;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  throw new Error(`Fecha invalida en el extracto: "${str}"`);
}

export function parseStatementAmount(value: string | number): string {
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  // Se asume "," como separador de miles y "." como decimal (formato tipico de export de banco);
  // ajustar aqui si un archivo real usa otra convencion.
  const cleaned = value.replace(/\$/g, '').replace(/\s/g, '').replace(/,/g, '').trim();
  if (cleaned === '' || Number.isNaN(Number(cleaned))) {
    throw new Error(`Monto invalido en el extracto: "${value}"`);
  }
  return cleaned;
}
