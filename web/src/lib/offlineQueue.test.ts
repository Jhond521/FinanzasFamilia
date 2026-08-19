import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  enqueuePendingQuickEntry,
  listPendingQuickEntries,
  removePendingQuickEntry,
  setPendingQuickEntryError,
  updatePendingQuickEntry,
} from './offlineQueue';

const SAMPLE = { amount: '-15000.00', description: 'Almuerzo', type: 'personal' as const, date: '2026-08-19', userId: 'user-1' };

beforeEach(async () => {
  // Reset entre tests: la instancia de fake-indexeddb persiste en memoria durante todo el archivo.
  for (const entry of await listPendingQuickEntries()) {
    await removePendingQuickEntry(entry.localId);
  }
});

describe('offlineQueue', () => {
  it('enqueues an entry and lists it back with no error', async () => {
    const entry = await enqueuePendingQuickEntry(SAMPLE);
    expect(entry.localId).toBeTruthy();
    expect(entry.error).toBeNull();

    const pending = await listPendingQuickEntries();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject(SAMPLE);
  });

  it('lists multiple entries ordered by creation time', async () => {
    const first = await enqueuePendingQuickEntry(SAMPLE);
    const second = await enqueuePendingQuickEntry({ ...SAMPLE, description: 'Cafe' });

    const pending = await listPendingQuickEntries();
    expect(pending.map((e) => e.localId)).toEqual([first.localId, second.localId]);
  });

  it('removes an entry from the queue', async () => {
    const entry = await enqueuePendingQuickEntry(SAMPLE);
    await removePendingQuickEntry(entry.localId);
    expect(await listPendingQuickEntries()).toHaveLength(0);
  });

  it('sets and clears an error on an entry without touching the rest of its fields', async () => {
    const entry = await enqueuePendingQuickEntry(SAMPLE);
    await setPendingQuickEntryError(entry.localId, 'El mes ya no existe');

    let pending = await listPendingQuickEntries();
    expect(pending[0].error).toBe('El mes ya no existe');
    expect(pending[0]).toMatchObject(SAMPLE);

    await setPendingQuickEntryError(entry.localId, null);
    pending = await listPendingQuickEntries();
    expect(pending[0].error).toBeNull();
  });

  it('edits an entry in place, keeping its localId and clearing a previous error', async () => {
    const entry = await enqueuePendingQuickEntry(SAMPLE);
    await setPendingQuickEntryError(entry.localId, 'El mes ya no existe');

    await updatePendingQuickEntry(entry.localId, { ...SAMPLE, amount: '-20000.00', description: 'Cena' });

    const pending = await listPendingQuickEntries();
    expect(pending).toHaveLength(1);
    expect(pending[0].localId).toBe(entry.localId);
    expect(pending[0].amount).toBe('-20000.00');
    expect(pending[0].description).toBe('Cena');
    expect(pending[0].error).toBeNull();
  });

  it('does nothing when editing an entry that no longer exists (already synced)', async () => {
    await expect(updatePendingQuickEntry('missing-id', SAMPLE)).resolves.toBeUndefined();
    expect(await listPendingQuickEntries()).toHaveLength(0);
  });
});
