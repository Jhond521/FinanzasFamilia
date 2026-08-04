import { Prisma } from '@prisma/client';

type DecimalInput = InstanceType<typeof Prisma.Decimal> | string | number;

export type SheetTransactionType = 'personal' | 'joint' | 'movement';

/** Valores exactos del dropdown "Tipo" en el tab "Plantilla 26" del Sheet real (ticket ##51). */
const TYPE_LABEL: Record<SheetTransactionType, string> = {
  personal: 'Personal',
  joint: 'Conjunto',
  movement: 'Movimientos',
};

export type SheetTransactionInput = {
  date: string; // YYYY-MM-DD
  detail: string | null;
  bankDescription: string;
  bankReference: string | null;
  amount: DecimalInput;
  type: SheetTransactionType;
  ownerName: string; // 'John' | 'Lina', igual al dropdown "Quien" del Sheet
};

/** Orden de columnas de la tabla de transacciones en "Plantilla 26": Fecha, Detalles, Oficina,
 * Descripcion, Referencia, Valor, Tipo, Quien. "Oficina" siempre queda vacia -- no existe un campo
 * equivalente en los datos que capturamos del extracto (confirmado con John en el ticket ##51). */
export type SheetTransactionRow = [string, string, string, string, string, number, string, string];

export function mapTransactionToSheetRow(tx: SheetTransactionInput): SheetTransactionRow {
  return [tx.date, tx.detail ?? '', '', tx.bankDescription, tx.bankReference ?? '', Number(tx.amount), TYPE_LABEL[tx.type], tx.ownerName];
}

/**
 * Indice (0-based) de la primera celda de una columna (ya leida del Sheet, ej. B1:B60) cuyo texto
 * EMPIEZA con `label` -- se usa `startsWith` y no igualdad exacta porque el layout real de
 * "Plantilla 26" trunca visualmente el texto de los labels (ej. "Ingreso Mes John (Despues Ded...")
 * y no sabemos con certeza el texto completo. null si no aparece.
 */
export function findLabelRowIndex(columnValues: unknown[], label: string): number | null {
  const idx = columnValues.findIndex((cell) => typeof cell === 'string' && cell.trim().startsWith(label));
  return idx === -1 ? null : idx;
}
