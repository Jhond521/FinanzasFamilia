import { createQuickEntry } from './api';
import { listPendingQuickEntries, removePendingQuickEntry, setPendingQuickEntryError } from './offlineQueue';

export type SyncResult = { synced: string[]; failed: { localId: string; error: string }[] };

/** fetch() rechaza con TypeError cuando no hay red (a diferencia de una respuesta 4xx/5xx del
 * servidor, que lib/api.ts convierte en un Error normal con el mensaje del backend). */
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

let inFlight: Promise<SyncResult> | null = null;

/** Sincroniza los registros rapidos pendientes de la cola offline (##65). Solo reintenta los que
 * todavia no tienen un error real guardado — un fallo de validacion del servidor no se reintenta
 * en silencio, se deja ahi hasta que el usuario lo descarte o pida reintentar.
 *
 * Si ya hay una sincronizacion en curso, devuelve esa misma promesa en vez de arrancar otra: dos
 * llamadas concurrentes (StrictMode monta el efecto dos veces en desarrollo, o el evento 'online'
 * puede dispararse mas de una vez seguida) verian la misma entrada pendiente todavia sin borrar y
 * la mandarian dos veces al servidor. */
export function syncPendingQuickEntries(): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = runSync().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runSync(): Promise<SyncResult> {
  const pending = (await listPendingQuickEntries()).filter((entry) => !entry.error);
  const synced: string[] = [];
  const failed: { localId: string; error: string }[] = [];

  for (const entry of pending) {
    try {
      await createQuickEntry({
        amount: entry.amount,
        description: entry.description,
        type: entry.type,
        date: entry.date,
        userId: entry.userId,
      });
      await removePendingQuickEntry(entry.localId);
      synced.push(entry.localId);
    } catch (err) {
      if (isNetworkError(err)) {
        // Sigue sin red: no tiene sentido intentar los demas ahora, se quedan en la cola.
        break;
      }
      const message = err instanceof Error ? err.message : 'No se pudo sincronizar';
      await setPendingQuickEntryError(entry.localId, message);
      failed.push({ localId: entry.localId, error: message });
    }
  }

  return { synced, failed };
}
