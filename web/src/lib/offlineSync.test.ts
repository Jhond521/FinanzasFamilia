import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuickEntry } from './api';
import { enqueuePendingQuickEntry, listPendingQuickEntries, removePendingQuickEntry } from './offlineQueue';
import { syncPendingQuickEntries } from './offlineSync';

vi.mock('./api', () => ({ createQuickEntry: vi.fn() }));

const SAMPLE = { amount: '-15000.00', description: 'Almuerzo', type: 'personal' as const, date: '2026-08-19', userId: 'user-1' };

beforeEach(async () => {
  vi.mocked(createQuickEntry).mockReset();
  for (const entry of await listPendingQuickEntries()) {
    await removePendingQuickEntry(entry.localId);
  }
});

describe('syncPendingQuickEntries', () => {
  it('sends each pending entry to the server and empties the queue on success', async () => {
    vi.mocked(createQuickEntry).mockResolvedValue({
      id: 'server-1',
      monthId: 'month-1',
      userId: 'user-1',
      createdBy: 'user-1',
      amount: SAMPLE.amount,
      description: SAMPLE.description,
      type: SAMPLE.type,
      date: SAMPLE.date,
      status: 'pending',
    });
    await enqueuePendingQuickEntry(SAMPLE);

    const result = await syncPendingQuickEntries();

    expect(result.synced).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(await listPendingQuickEntries()).toHaveLength(0);
    expect(createQuickEntry).toHaveBeenCalledWith({
      amount: SAMPLE.amount,
      description: SAMPLE.description,
      type: SAMPLE.type,
      date: SAMPLE.date,
      userId: SAMPLE.userId,
    });
  });

  it('leaves entries queued and stops trying the rest when it is a network failure', async () => {
    vi.mocked(createQuickEntry).mockRejectedValue(new TypeError('Failed to fetch'));
    await enqueuePendingQuickEntry(SAMPLE);
    await enqueuePendingQuickEntry({ ...SAMPLE, description: 'Cafe' });

    const result = await syncPendingQuickEntries();

    expect(result.synced).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(createQuickEntry).toHaveBeenCalledTimes(1);
    const pending = await listPendingQuickEntries();
    expect(pending).toHaveLength(2);
    expect(pending.every((e) => e.error === null)).toBe(true);
  });

  it('marks a real validation failure with the server error instead of retrying it forever', async () => {
    vi.mocked(createQuickEntry).mockRejectedValue(new Error('El mes ya no existe'));
    await enqueuePendingQuickEntry(SAMPLE);

    const result = await syncPendingQuickEntries();

    expect(result.synced).toHaveLength(0);
    expect(result.failed).toEqual([{ localId: expect.any(String), error: 'El mes ya no existe' }]);
    const pending = await listPendingQuickEntries();
    expect(pending[0].error).toBe('El mes ya no existe');

    vi.mocked(createQuickEntry).mockClear();
    await syncPendingQuickEntries();
    expect(createQuickEntry).not.toHaveBeenCalled();
  });

  it('does not double-send an entry when two syncs overlap (React StrictMode double-effect)', async () => {
    let resolveCreate: (() => void) | undefined;
    vi.mocked(createQuickEntry).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = () =>
            resolve({
              id: 'server-1',
              monthId: 'month-1',
              userId: SAMPLE.userId,
              createdBy: SAMPLE.userId,
              amount: SAMPLE.amount,
              description: SAMPLE.description,
              type: SAMPLE.type,
              date: SAMPLE.date,
              status: 'pending',
            });
        }),
    );
    await enqueuePendingQuickEntry(SAMPLE);

    // Dos llamadas sin esperar la primera, como pasa cuando StrictMode monta el efecto de
    // sincronizacion dos veces seguidas: la segunda debe reusar la sincronizacion en curso en vez
    // de leer la cola de nuevo (todavia con la entrada sin borrar) y reenviarla.
    const first = syncPendingQuickEntries();
    const second = syncPendingQuickEntries();
    await vi.waitFor(() => expect(createQuickEntry).toHaveBeenCalled());
    resolveCreate?.();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(createQuickEntry).toHaveBeenCalledTimes(1);
    expect(firstResult).toBe(secondResult);
    expect(await listPendingQuickEntries()).toHaveLength(0);
  });
});
