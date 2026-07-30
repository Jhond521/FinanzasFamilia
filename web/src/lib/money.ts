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
 * Extrae los pesos enteros de un string decimal ("11439100.00" -> "11439100").
 * Los ingresos de esta app nunca tienen centavos reales (ver formatCOP, que igual siempre
 * muestra ",00"), asi que se descarta la parte decimal en vez de arrastrarla como mas digitos.
 */
export function toIntegerDigits(value: string): string {
  const [integerPart] = value.split('.');
  return integerPart.replace(/\D/g, '');
}

/**
 * Formatea digitos enteros con separador de miles, mientras se escribe. Los dos decimales se
 * muestran aparte como sufijo fijo (ver CurrencyInput) — no van en el valor editable, porque el
 * cursor terminaria cayendo despues de la coma y los digitos escritos ahi se perderian.
 */
export function formatThousands(digits: string): string {
  if (!digits) return '';
  return groupFormatter.format(Number(digits));
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
