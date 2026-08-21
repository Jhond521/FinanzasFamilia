const DB_NAME = 'finanzas-offline';
const DB_VERSION = 1;
const STORE = 'pendingQuickEntries';
const LOCAL_ID_INDEX = 'localId';

export type PendingQuickEntry = {
  localId: string;
  amount: string;
  description: string;
  typeOptionId: string;
  date: string;
  userId: string;
  createdAt: string;
  error: string | null;
};

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // Clave interna autoincremental (no localId): preserva el orden real de creacion en
        // getAll(), a diferencia de usar localId (uuid) como keyPath, que ordena alfabeticamente.
        const store = db.createObjectStore(STORE, { autoIncrement: true });
        store.createIndex(LOCAL_ID_INDEX, 'localId', { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const outcome = fn(tx.objectStore(STORE));
    const result = outcome instanceof IDBRequest ? await promisify(outcome) : await outcome;
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

export async function enqueuePendingQuickEntry(input: {
  amount: string;
  description: string;
  typeOptionId: string;
  date: string;
  userId: string;
}): Promise<PendingQuickEntry> {
  const entry: PendingQuickEntry = {
    ...input,
    localId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    error: null,
  };
  await withStore('readwrite', (store) => store.add(entry));
  return entry;
}

export async function listPendingQuickEntries(): Promise<PendingQuickEntry[]> {
  return withStore('readonly', (store) => store.getAll());
}

export async function removePendingQuickEntry(localId: string): Promise<void> {
  await withStore('readwrite', async (store) => {
    const key = await promisify(store.index(LOCAL_ID_INDEX).getKey(localId));
    if (key !== undefined) {
      await promisify(store.delete(key));
    }
  });
}

async function updateEntryByLocalId(
  store: IDBObjectStore,
  localId: string,
  updater: (entry: PendingQuickEntry) => PendingQuickEntry,
): Promise<void> {
  const index = store.index(LOCAL_ID_INDEX);
  const key = await promisify(index.getKey(localId));
  if (key === undefined) return;
  const entry = await promisify(index.get(localId) as IDBRequest<PendingQuickEntry | undefined>);
  if (entry) {
    await promisify(store.put(updater(entry), key));
  }
}

export async function setPendingQuickEntryError(localId: string, error: string | null): Promise<void> {
  await withStore('readwrite', (store) => updateEntryByLocalId(store, localId, (entry) => ({ ...entry, error })));
}

/** Edita un registro todavia sin sincronizar (##65 seguimiento: debe poder editarse/borrarse igual
 * que uno ya persistido). Limpia el error si lo tenia: si el usuario corrigio los datos, el proximo
 * intento de sincronizacion debe volver a intentarlo, no quedarse marcado con el error viejo. */
export async function updatePendingQuickEntry(
  localId: string,
  input: { amount: string; description: string; typeOptionId: string; date: string; userId: string },
): Promise<void> {
  await withStore('readwrite', (store) =>
    updateEntryByLocalId(store, localId, (entry) => ({ ...entry, ...input, error: null })),
  );
}
