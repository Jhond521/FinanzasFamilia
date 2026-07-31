const formatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const groupFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** Solo para mostrar en pantalla; los montos siempre viajan y se calculan como string/Decimal. */
export function formatCOP(amount: string): string {
  return formatter.format(Number(amount));
}

/**
 * Normaliza lo que el usuario escribio o pego a un string decimal canonico: punto como separador
 * decimal (igual que el resto de la API/Decimal), maximo 2 decimales, sin separadores de miles.
 * Acepta tanto "," como "." como separador decimal (el ultimo que aparezca en el texto se toma
 * como tal; cualquier otro se interpreta como separador de miles y se descarta).
 */
export function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  const lastSeparator = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));
  if (lastSeparator === -1) {
    return cleaned;
  }
  const integerDigits = cleaned.slice(0, lastSeparator).replace(/[.,]/g, '');
  const decimalDigits = cleaned.slice(lastSeparator + 1).replace(/[.,]/g, '').slice(0, 2);
  return `${integerDigits}.${decimalDigits}`;
}

/**
 * Formatea un string decimal canonico ("11439100.5") para mostrarlo mientras se escribe: miles
 * agrupados en la parte entera + coma decimal, preservando los decimales tal cual los escribio el
 * usuario (sin forzar a 2 digitos, porque interrumpiria la edicion en curso).
 */
export function formatAmountDisplay(value: string): string {
  if (!value) return '';
  const [integerPart, decimalPart] = value.split('.');
  const groupedInteger = integerPart
    ? groupFormatter.format(Number(integerPart))
    : decimalPart !== undefined
      ? '0'
      : '';
  return decimalPart !== undefined ? `${groupedInteger},${decimalPart}` : groupedInteger;
}

export const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
