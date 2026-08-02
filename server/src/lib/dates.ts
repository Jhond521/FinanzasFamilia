/** DateTime en Prisma (medianoche UTC) -> string YYYY-MM-DD para la API (docs/03-api.md). */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
