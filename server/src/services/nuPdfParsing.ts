import type { ParsedCardItemRow } from './nuParser';

/**
 * Convierte el texto crudo de OCR (Tesseract, `--psm 6`, `spa+eng`) de un extracto Nu en PDF a
 * filas de item de tarjeta. Ver ##61 — el spike de ##59 confirmó que la lectura de fecha/
 * descripción/monto es casi perfecta, pero el layout de la tabla (columnas angostas) hace que
 * Tesseract reparta una misma fila en 2-3 líneas de texto (fecha o descripción envueltas). Esta
 * función es un parser heurístico de ese texto — no perfecto, pero el resultado siempre pasa por
 * la pantalla de revisión antes de guardarse (ver `CardsScreen.tsx`), así que el objetivo es "buen
 * punto de partida", no exactitud garantizada.
 *
 * Se usa siempre `Total a pagar este mes` como monto (no `Valor`): para compras en cuotas es el
 * cobro de este ciclo, y para compras de contado ambos valores coinciden (verificado en las
 * páginas de ejemplo). Las filas con `Valor del mes = $0,00` pero `Total a pagar este mes > 0` son
 * intereses/mora de una compra ya importada en un mes anterior — no una compra nueva. Se marcan con
 * el sufijo " (interés)" en vez de descartarlas, para que el total del extracto siga cuadrando y a
 * la vez quede claro en la revisión que no es una compra duplicada.
 */

const MONTHS: Record<string, string> = {
  ENE: '01',
  FEB: '02',
  MAR: '03',
  ABR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AGO: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DIC: '12',
};

const ROW_START_RE = new RegExp(`^(\\d{2})\\s*(${Object.keys(MONTHS).join('|')})\\s*(\\d{4})?\\s+(.*)$`, 'i');
const BARE_YEAR_RE = /^(\d{4})\s*(.*)$/;
// Tolera "1de1" (espacios comidos por el OCR) y "1 de 24".
const NUMERIC_TAIL_RE =
  /^(.*?)\s*\$([\d.,]+)\s+\d+\s*de\s*\d+\s+\$([\d.,]+)\s+[\d.,]+%\s+\$([\d.,]+)\s+\$([\d.,]+)\s+\$([\d.,]+)\s*$/i;
const COMMISSION_RE = /^[>~%-]*\s*Comisi[oó]n por cambio de moneda/i;
const MORA_RE = /^Intereses en\b/i;
const MORA_CONTINUATION_RE = /^mora$/i;
const PAYMENT_MARKER_RE = /gracias por tu/i;
const PAYMENT_CONTINUATION_RE = /^(pago\b|\+\s*A\s)/i;

/** "$1.499.603,00" (miles con ".", decimales con ",", formato colombiano) -> "1499603.00". */
export function parseNuPdfAmount(raw: string): string {
  const cleaned = raw.replace(/\$/g, '').trim();
  const negative = cleaned.startsWith('-');
  const normalized = cleaned.replace(/^-/, '').replace(/\./g, '').replace(',', '.');
  const num = Number(normalized);
  if (normalized === '' || Number.isNaN(num)) {
    throw new Error(`Monto invalido en el extracto Nu (PDF): "${raw}"`);
  }
  return (negative ? -num : num).toFixed(2);
}

type PendingRow = { day: string; month: string; year: string | null; description: string; amount: string };

function isRowStart(line: string): boolean {
  return ROW_START_RE.test(line);
}

function isSkippableAnnotation(line: string): boolean {
  return COMMISSION_RE.test(line) || MORA_RE.test(line) || MORA_CONTINUATION_RE.test(line);
}

function finalizeRow(row: PendingRow): ParsedCardItemRow {
  const year = row.year ?? new Date().getFullYear().toString();
  const date = `${year}-${MONTHS[row.month.toUpperCase()]}-${row.day}`;
  return { date, description: row.description.trim(), amount: row.amount };
}

export function parseNuPdfText(pageTexts: string[]): ParsedCardItemRow[] {
  const lines = pageTexts
    .join('\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows: ParsedCardItemRow[] = [];
  let skippingPayment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!isRowStart(line)) {
      if (skippingPayment && PAYMENT_CONTINUATION_RE.test(line)) continue;
      skippingPayment = false;
      continue; // header, footer, o continuacion ya consumida por lookahead — se ignora
    }
    skippingPayment = false;

    const match = line.match(ROW_START_RE)!;
    const [, day, month, yearInline, rest] = match;

    if (PAYMENT_MARKER_RE.test(rest)) {
      skippingPayment = true; // "Gracias por tu pago...": no es una compra, se descarta
      continue;
    }

    const numeric = rest.match(NUMERIC_TAIL_RE);
    if (!numeric) continue; // forma de fila no reconocida — mejor omitir que inventar datos

    const [, descHead, , valorDelMes, interesDelMes, totalAPagar] = numeric;
    const row: PendingRow = {
      day,
      month,
      year: yearInline ?? null,
      description: descHead.trim(),
      amount: parseNuPdfAmount(totalAPagar),
    };

    const isInterestOnly = parseNuPdfAmount(valorDelMes) === '0.00' && parseNuPdfAmount(interesDelMes) !== '0.00';
    if (isInterestOnly) row.description += ' (interés)';

    // Lookahead acotado: a lo sumo una linea de continuacion (año envuelto y/o resto de la
    // descripcion), luego a lo sumo una anotacion de comision/mora a saltar.
    const next = lines[i + 1];
    if (next !== undefined && !isRowStart(next) && !isSkippableAnnotation(next) && !PAYMENT_MARKER_RE.test(next)) {
      const bareYear = next.match(BARE_YEAR_RE);
      if (bareYear && row.year === null) {
        row.year = bareYear[1];
        if (bareYear[2]) row.description += ` ${bareYear[2]}`.trimEnd();
        i++;
      } else if (!BARE_YEAR_RE.test(next)) {
        row.description += ` ${next}`;
        i++;
      }
    }
    const afterNext = lines[i + 1];
    if (afterNext !== undefined && isSkippableAnnotation(afterNext)) {
      i++;
      if (MORA_RE.test(afterNext) && lines[i + 1] !== undefined && MORA_CONTINUATION_RE.test(lines[i + 1])) {
        i++;
      }
    }

    rows.push(finalizeRow(row));
  }

  return rows;
}
