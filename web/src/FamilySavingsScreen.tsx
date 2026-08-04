import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFamilySavingsEntry,
  fetchFamilySavingsEntries,
  fetchFamilySavingsSummary,
  fetchUsers,
  type FamilySavingsEntryType,
} from './lib/api';
import { CurrencyInput } from './CurrencyInput';
import { formatCOP } from './lib/money';
import NavBar from './NavBar';

const TYPE_LABEL: Record<FamilySavingsEntryType, string> = {
  initial: 'Saldo inicial',
  monthly_savings: 'Ahorro del mes',
  adjustment: 'Ajuste de cierre',
  yield: 'Rendimientos',
  manual: 'Manual',
};

function pillClass(active: boolean): string {
  return `rounded-full px-3 py-1.5 ${active ? 'bg-brand-light text-brand' : 'border border-line text-ink-muted'}`;
}

export default function FamilySavingsScreen() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const { data: summary } = useQuery({
    queryKey: ['family-savings', 'summary'],
    queryFn: fetchFamilySavingsSummary,
  });

  const [ownerFilter, setOwnerFilter] = useState<string | 'all'>('all');
  const { data: entries } = useQuery({
    queryKey: ['family-savings', 'entries', ownerFilter],
    queryFn: () => fetchFamilySavingsEntries(ownerFilter === 'all' ? undefined : { userId: ownerFilter }),
  });

  const [showForm, setShowForm] = useState(false);
  const [formUserId, setFormUserId] = useState('');
  const [formType, setFormType] = useState<FamilySavingsEntryType>('manual');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      createFamilySavingsEntry({
        userId: formUserId,
        type: formType,
        amount: formAmount,
        description: formDescription,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['family-savings'] });
      setShowForm(false);
      setFormAmount('');
      setFormDescription('');
      setFormType('manual');
    },
  });

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4">
        <h1 className="text-xl font-extrabold text-ink">Ahorros Familiares</h1>

        {summary && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {summary.balances.map((b) => (
              <div key={b.userId} className="rounded-xl border border-line bg-white p-4 shadow-sm">
                <div className="text-xs font-bold uppercase tracking-wide text-ink-muted">{b.name}</div>
                <div className="mt-1 text-2xl font-extrabold text-ink">{formatCOP(b.balance)}</div>
              </div>
            ))}
            <div className="rounded-xl bg-ink p-4 text-white shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wide text-white/60">Total familia</div>
              <div className="mt-1 text-2xl font-extrabold">{formatCOP(summary.total)}</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2 text-xs font-semibold">
            <button type="button" onClick={() => setOwnerFilter('all')} className={pillClass(ownerFilter === 'all')}>
              Ambos
            </button>
            {users?.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setOwnerFilter(u.id)}
                className={pillClass(ownerFilter === u.id)}
              >
                {u.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            {showForm ? 'Cancelar' : '+ Agregar movimiento'}
          </button>
        </div>

        {showForm && (
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-1 min-w-[140px] flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Persona</span>
                <select
                  value={formUserId}
                  onChange={(e) => setFormUserId(e.target.value)}
                  className="rounded-lg border border-line px-3 py-2 text-sm"
                >
                  <option value="">Selecciona…</option>
                  {users?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 min-w-[140px] flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Tipo</span>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as FamilySavingsEntryType)}
                  className="rounded-lg border border-line px-3 py-2 text-sm"
                >
                  {Object.entries(TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 min-w-[140px] flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Monto (negativo resta)</span>
                <CurrencyInput value={formAmount} onChange={setFormAmount} allowNegative />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Descripción</span>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Ej. Saldo inicial en Nu, retiro para vacaciones…"
                className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
              />
            </label>
            {createMutation.isError && (
              <p className="text-sm text-danger">
                {createMutation.error instanceof Error ? createMutation.error.message : 'No se pudo guardar'}
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={!formUserId || !formAmount || !formDescription || createMutation.isPending}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {createMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="bg-cream text-left text-xs font-bold uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Persona</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {entries?.map((entry) => (
                <tr key={entry.id} className="border-t border-line align-top">
                  <td className="px-4 py-3 text-ink-muted">{new Date(entry.createdAt).toLocaleDateString('es-CO')}</td>
                  <td className="px-4 py-3">{users?.find((u) => u.id === entry.userId)?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-muted">{TYPE_LABEL[entry.type]}</td>
                  <td className="px-4 py-3">{entry.description}</td>
                  <td className={`px-4 py-3 text-right font-bold ${Number(entry.amount) < 0 ? 'text-danger' : 'text-ink'}`}>
                    {formatCOP(entry.amount)}
                  </td>
                </tr>
              ))}
              {entries?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                    Todavía no hay movimientos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
