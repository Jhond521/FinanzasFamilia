import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type DecimalInput = InstanceType<typeof Prisma.Decimal> | string | number;

/**
 * Clave de deduplicacion: hash de (dueño, fecha, descripcion original del banco, valor).
 * docs/02-modelo-de-datos.md: "hash(owner, date, bank_description, amount)".
 */
export function dedupeKey(ownerUserId: string, date: string, bankDescription: string, amount: DecimalInput): string {
  const normalizedAmount = new Decimal(amount).toFixed(2);
  const normalizedDescription = bankDescription.trim().toUpperCase();
  const raw = `${ownerUserId}|${date}|${normalizedDescription}|${normalizedAmount}`;
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Reparte las filas de un archivo entre "importar" y "omitir por duplicado", agrupando por
 * dedupeKey: si el archivo trae N filas de una key y ya hay M en BD (mismo mes+dueño, batches no
 * deshechos), se importan max(0, N-M) y el resto queda para revision (docs/02, "Deduplicacion").
 */
export function planImport<T extends { dedupeKey: string }>(
  rows: T[],
  existingCounts: Map<string, number>,
): { toImport: T[]; toSkip: T[] } {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.dedupeKey);
    if (list) {
      list.push(row);
    } else {
      grouped.set(row.dedupeKey, [row]);
    }
  }

  const toImport: T[] = [];
  const toSkip: T[] = [];
  for (const group of grouped.values()) {
    const existing = existingCounts.get(group[0].dedupeKey) ?? 0;
    const importCount = Math.max(0, group.length - existing);
    toImport.push(...group.slice(0, importCount));
    toSkip.push(...group.slice(importCount));
  }
  return { toImport, toSkip };
}
