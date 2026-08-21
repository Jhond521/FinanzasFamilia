import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { CurrencyInput } from './CurrencyInput';
import {
  createQuickEntry,
  deleteQuickEntry,
  fetchMonths,
  fetchQuickEntries,
  fetchQuickEntryTypes,
  fetchUsers,
  updateQuickEntry,
  type CurrentUser,
  type QuickEntry as QuickEntryRecord,
} from './lib/api';
import { formatCOP, MESES } from './lib/money';
import {
  enqueuePendingQuickEntry,
  listPendingQuickEntries,
  removePendingQuickEntry,
  setPendingQuickEntryError,
  updatePendingQuickEntry,
  type PendingQuickEntry,
} from './lib/offlineQueue';
import { syncPendingQuickEntries } from './lib/offlineSync';

type Props = {
  currentUser: CurrentUser;
};

function toDateOnlyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatEntryDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-').map(Number);
  return `${day} ${MESES[month - 1].slice(0, 3)}`;
}

export default function QuickEntry({ currentUser }: Props) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const tipoParam = searchParams.get('tipo');

  const today = useMemo(() => new Date(), []);
  const todayStr = toDateOnlyLocal(today);
  const yesterdayStr = toDateOnlyLocal(addDays(today, -1));

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [typeOptionId, setTypeOptionId] = useState('');
  const [dateMode, setDateMode] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(todayStr);
  const [userId, setUserId] = useState(currentUser.id);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingPendingId, setEditingPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [confirmingDiscardId, setConfirmingDiscardId] = useState<string | null>(null);
  const [pendingEntries, setPendingEntries] = useState<PendingQuickEntry[]>([]);

  const date = dateMode === 'today' ? todayStr : dateMode === 'yesterday' ? yesterdayStr : customDate;

  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const { data: months } = useQuery({ queryKey: ['months'], queryFn: fetchMonths });
  const { data: quickEntryTypes } = useQuery({ queryKey: ['quickEntryTypes'], queryFn: fetchQuickEntryTypes });
  const currentMonth = months?.find((m) => m.status === 'open');
  const activeTypes = useMemo(() => (quickEntryTypes ?? []).filter((t) => t.active), [quickEntryTypes]);

  const { data: recentEntries } = useQuery({
    queryKey: ['quickEntries', currentMonth?.id],
    queryFn: () => fetchQuickEntries(currentMonth!.id),
    enabled: Boolean(currentMonth),
  });

  // Deep link (`/r?tipo=<slug>`, PRD RF-acceso-rapido) o, si no aplica, el primer tipo activo
  // configurado (##73) — el slug es estable aunque el usuario renombre el tipo despues.
  const defaultTypeOptionId = useCallback((): string => {
    const preselected = tipoParam ? activeTypes.find((t) => t.slug === tipoParam) : undefined;
    return (preselected ?? activeTypes[0])?.id ?? '';
  }, [activeTypes, tipoParam]);

  useEffect(() => {
    if (!typeOptionId && activeTypes.length > 0) {
      setTypeOptionId(defaultTypeOptionId());
    }
  }, [activeTypes, typeOptionId, defaultTypeOptionId]);

  function typeName(id: string): string {
    return quickEntryTypes?.find((t) => t.id === id)?.name ?? '—';
  }

  function resetForm() {
    setAmount('');
    setDescription('');
    setTypeOptionId(defaultTypeOptionId());
    setDateMode('today');
    setCustomDate(todayStr);
    setUserId(currentUser.id);
    setEditingId(null);
    setEditingPendingId(null);
    setError(null);
  }

  async function invalidateAfterSave() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['quickEntries'] }),
      queryClient.invalidateQueries({ queryKey: ['months'] }),
    ]);
  }

  const refreshPending = useCallback(async () => {
    setPendingEntries(await listPendingQuickEntries());
  }, []);

  // Al montar y cada vez que vuelve la conexion, intenta vaciar la cola offline (##65).
  useEffect(() => {
    let cancelled = false;
    async function trySync() {
      const result = await syncPendingQuickEntries();
      if (cancelled) return;
      if (result.synced.length > 0) {
        await invalidateAfterSave();
      }
      if (result.synced.length > 0 || result.failed.length > 0) {
        await refreshPending();
      }
    }
    refreshPending();
    trySync();
    window.addEventListener('online', trySync);
    return () => {
      cancelled = true;
      window.removeEventListener('online', trySync);
    };
  }, [refreshPending]);

  async function retryPendingEntry(localId: string) {
    await setPendingQuickEntryError(localId, null);
    await refreshPending();
    const result = await syncPendingQuickEntries();
    if (result.synced.length > 0) {
      await invalidateAfterSave();
    }
    await refreshPending();
  }

  async function discardPendingEntry(localId: string) {
    await removePendingQuickEntry(localId);
    setConfirmingDiscardId(null);
    if (editingPendingId === localId) {
      resetForm();
    }
    await refreshPending();
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { amount, description, typeOptionId, date, userId };
      if (editingPendingId) {
        // Editar un registro todavia sin sincronizar es puramente local: no toca la red.
        await updatePendingQuickEntry(editingPendingId, payload);
        return null;
      }
      if (editingId) {
        return updateQuickEntry(editingId, payload);
      }
      try {
        return await createQuickEntry(payload);
      } catch (err) {
        // Sin red: fetch() rechaza con TypeError (no es un error del servidor). En vez de mostrar
        // error, se encola localmente y se sincroniza solo cuando vuelva la conexion.
        if (err instanceof TypeError) {
          await enqueuePendingQuickEntry(payload);
          return null;
        }
        throw err;
      }
    },
    onSuccess: async (result) => {
      if (result === null) {
        await refreshPending();
      } else {
        await invalidateAfterSave();
      }
      resetForm();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el registro');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteQuickEntry(id),
    onSuccess: async () => {
      setConfirmingDeleteId(null);
      await invalidateAfterSave();
      if (deleteMutation.variables === editingId) {
        resetForm();
      }
    },
  });

  function startEdit(entry: QuickEntryRecord) {
    setEditingId(entry.id);
    setEditingPendingId(null);
    setAmount(entry.amount);
    setDescription(entry.description);
    setTypeOptionId(entry.typeOptionId);
    setUserId(entry.userId);
    if (entry.date === todayStr) {
      setDateMode('today');
    } else if (entry.date === yesterdayStr) {
      setDateMode('yesterday');
    } else {
      setDateMode('custom');
      setCustomDate(entry.date);
    }
    setError(null);
  }

  function startEditPending(entry: PendingQuickEntry) {
    setEditingPendingId(entry.localId);
    setEditingId(null);
    setAmount(entry.amount);
    setDescription(entry.description);
    setTypeOptionId(entry.typeOptionId);
    setUserId(entry.userId);
    if (entry.date === todayStr) {
      setDateMode('today');
    } else if (entry.date === yesterdayStr) {
      setDateMode('yesterday');
    } else {
      setDateMode('custom');
      setCustomDate(entry.date);
    }
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amount || Number(amount) === 0) {
      setError('El monto no puede ser cero');
      return;
    }
    if (!description.trim()) {
      setError('La descripcion es obligatoria');
      return;
    }
    if (!typeOptionId) {
      setError('Selecciona un tipo de registro');
      return;
    }
    saveMutation.mutate();
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-4 pb-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            aria-label="Ir al Dashboard"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-soft transition hover:bg-cream-surface"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M3 11l9-8 9 8" />
              <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold text-ink">{editingId || editingPendingId ? 'Editar gasto' : 'Nuevo gasto'}</h1>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
          {currentUser.name.charAt(0)}
        </div>
      </header>

      {!currentMonth && (
        <p className="rounded-lg bg-warning-light p-3 text-sm text-warning">
          Todavia no hay un mes abierto — crea el mes actual desde el dashboard antes de registrar gastos.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-xl border border-line bg-white p-4">
        <div className="flex flex-col gap-1">
          <CurrencyInput
            variant="large"
            value={amount}
            onChange={setAmount}
            placeholder="0"
            ariaLabel="Monto"
            autoFocus
            allowNegative
          />
          <p className="text-center text-xs text-ink-muted">
            Escribe un monto negativo para registrar un ingreso (ej. una transferencia que te hicieron)
          </p>
        </div>

        {activeTypes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeOptionId(t.id)}
                className={`flex min-h-11 flex-1 basis-[30%] items-center justify-center rounded-lg px-2 py-2 text-sm font-semibold transition ${
                  typeOptionId === t.id ? 'border border-brand bg-brand-light text-brand' : 'border border-line text-ink-soft'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="rounded-lg bg-warning-light p-3 text-sm text-warning">
            No hay tipos de registro configurados — agrega al menos uno desde Configuración.
          </p>
        )}

        {/* text-base (16px) en los inputs de esta pantalla: por debajo de 16px, iOS Safari hace
            zoom automatico de toda la pagina al enfocar el campo. */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Descripcion</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Almuerzo con Camila"
            className="rounded-lg border border-line px-3 py-2 text-base text-ink"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Fecha</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDateMode('today')}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-lg py-2 text-xs font-semibold ${
                dateMode === 'today' ? 'bg-brand text-white' : 'border border-line text-ink-soft'
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setDateMode('yesterday')}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-lg py-2 text-xs font-semibold ${
                dateMode === 'yesterday' ? 'bg-brand text-white' : 'border border-line text-ink-soft'
              }`}
            >
              Ayer
            </button>
            <button
              type="button"
              onClick={() => setDateMode('custom')}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-lg py-2 text-xs font-semibold ${
                dateMode === 'custom' ? 'bg-brand text-white' : 'border border-line text-ink-soft'
              }`}
            >
              Otro dia…
            </button>
          </div>
          {dateMode === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="mt-2 rounded-lg border border-line px-3 py-2 text-base"
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">¿Quien?</span>
          <div className="flex gap-2">
            {users?.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setUserId(u.id)}
                className={`flex min-h-11 flex-1 items-center justify-center rounded-lg py-2 text-xs font-semibold ${
                  userId === u.id ? 'border border-brand bg-brand-light text-brand' : 'border border-line text-ink-soft'
                }`}
              >
                {u.name}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          {(editingId || editingPendingId) && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink-soft"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={saveMutation.isPending || !currentMonth || !typeOptionId}
            className="flex-1 rounded-xl bg-brand py-3 text-base font-extrabold text-white transition hover:bg-brand-hover disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>

      {pendingEntries.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
            Pendientes de sincronizar
          </h2>
          <div className="flex flex-col divide-y divide-line rounded-xl border border-warning bg-warning-light">
            {pendingEntries.map((entry) => {
              const owner = users?.find((u) => u.id === entry.userId);
              return (
                <div key={entry.localId} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={() => startEditPending(entry)} className="flex-1 text-left">
                      <div className="text-sm font-semibold text-ink">{entry.description}</div>
                      <div className="text-xs text-ink-muted">
                        {formatEntryDate(entry.date)} · {typeName(entry.typeOptionId)} · {owner?.name ?? '—'}
                      </div>
                    </button>
                    <span className="text-sm font-bold text-ink">{formatCOP(entry.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {entry.error ? (
                      <span className="text-xs text-danger">{entry.error}</span>
                    ) : (
                      <span className="text-xs font-semibold text-warning">Pendiente de sincronizar</span>
                    )}
                    {confirmingDiscardId === entry.localId ? (
                      <div className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold">
                        <span className="text-ink-muted">¿Seguro?</span>
                        <button type="button" onClick={() => discardPendingEntry(entry.localId)} className="text-danger">
                          Si, borrar
                        </button>
                        <button type="button" onClick={() => setConfirmingDiscardId(null)} className="text-ink-muted">
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-3 whitespace-nowrap text-xs font-semibold">
                        {entry.error && (
                          <button type="button" onClick={() => retryPendingEntry(entry.localId)} className="text-brand">
                            Reintentar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmingDiscardId(entry.localId)}
                          className="text-danger"
                          aria-label={`Borrar ${entry.description}`}
                        >
                          Borrar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {currentMonth && recentEntries && recentEntries.length === 0 && (
        <p className="text-center text-sm text-ink-muted">Todavia no hay registros este mes.</p>
      )}

      {recentEntries && recentEntries.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Ultimos registros</h2>
          <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-white">
            {recentEntries.slice(0, 10).map((entry) => {
              const owner = users?.find((u) => u.id === entry.userId);
              return (
                <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <button type="button" onClick={() => startEdit(entry)} className="flex-1 text-left">
                    <div className="text-sm font-semibold text-ink">{entry.description}</div>
                    <div className="text-xs text-ink-muted">
                      {formatEntryDate(entry.date)} · {entry.typeOption.name} · {owner?.name ?? '—'}
                    </div>
                  </button>
                  <span className="text-sm font-bold text-ink">{formatCOP(entry.amount)}</span>
                  {confirmingDeleteId === entry.id ? (
                    <div className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold">
                      <span className="text-ink-muted">¿Seguro?</span>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(entry.id)}
                        disabled={deleteMutation.isPending}
                        className="text-danger disabled:opacity-50"
                      >
                        Si, borrar
                      </button>
                      <button type="button" onClick={() => setConfirmingDeleteId(null)} className="text-ink-muted">
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(entry.id)}
                      className="text-xs font-semibold text-danger"
                      aria-label={`Borrar ${entry.description}`}
                    >
                      Borrar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
