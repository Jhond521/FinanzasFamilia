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
 *
 * La coma es siempre el separador decimal: nuestro propio formateo (ver formatAmountDisplay)
 * nunca agrega una coma salvo para marcar los decimales, asi que no es ambigua.
 *
 * El punto si es ambiguo: puede ser un separador de miles que quedo "colado" en el valor nativo
 * del input porque ya lo habiamos agregado nosotros al formatear el keystroke anterior (ej. el
 * usuario tenia "1.234" en pantalla y escribio otro digito -> el input llega con "1.2345"), o
 * puede ser un separador decimal real que el usuario pego (ej. "50000.5"). Un separador de miles
 * siempre deja exactamente 3 digitos en el grupo que le sigue (asi agrupa Intl.NumberFormat);
 * un separador decimal real, al tener maximo 2 decimales, nunca deja 3 o mas. Con eso se
 * distinguen sin ambiguedad.
 */
export function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, '');

  const commaIndex = cleaned.lastIndexOf(',');
  if (commaIndex !== -1) {
    const integerDigits = cleaned.slice(0, commaIndex).replace(/[.,]/g, '');
    const decimalDigits = cleaned.slice(commaIndex + 1).replace(/[.,]/g, '').slice(0, 2);
    return `${integerDigits}.${decimalDigits}`;
  }

  const dotIndex = cleaned.lastIndexOf('.');
  if (dotIndex === -1) {
    return cleaned;
  }
  const tail = cleaned.slice(dotIndex + 1).replace(/\./g, '');
  if (tail.length >= 3) {
    return cleaned.replace(/\./g, '');
  }
  const integerDigits = cleaned.slice(0, dotIndex).replace(/\./g, '');
  return `${integerDigits}.${tail}`;
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
