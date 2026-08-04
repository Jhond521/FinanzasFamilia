import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCategories,
  fetchCurrentUser,
  fetchMonths,
  fetchTransactions,
  fetchUsers,
  updateSheetExport,
  updateTransaction,
  type TransactionType,
} from './lib/api';
import { formatCOP, MESES } from './lib/money';
import NavBar from './NavBar';

const TYPE_FILTERS: { value: TransactionType | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'joint', label: 'Conjunto' },
  { value: 'personal', label: 'Personal' },
  { value: 'movement', label: 'Movimiento' },
];

const TYPE_LABEL: Record<TransactionType, string> = {
  personal: 'Personal',
  joint: 'Conjunto',
  movement: 'Movimiento',
  unclassified: 'Sin clasificar',
};

// Colores por tipo, igual a typePill() de design_specs/Finanzas en Pareja.dc.html.
const TYPE_PILL_CLASS: Record<TransactionType, string> = {
  joint: 'bg-brand-light text-brand',
  personal: 'bg-cream-surface text-ink-soft',
  movement: 'bg-warning-light text-warning',
  unclassified: 'bg-danger-light text-danger',
};

export default function TransactionsScreen() {
  const queryClient = useQueryClient();
  const { data: months } = useQuery({ queryKey: ['months'], queryFn: fetchMonths });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const { data: currentUser } = useQuery({ queryKey: ['auth', 'me'], queryFn: fetchCurrentUser });

  const openMonth = months?.find((m) => m.status === 'open') ?? months?.[0];
  const [monthId, setMonthId] = useState<string | undefined>(undefined);
  const selectedMonthId = monthId ?? openMonth?.id;

  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all');
  const [search, setSearch] = useState('');

  const otherUser = users?.find((u) => u.id !== currentUser?.id);
  const [ownerFilter, setOwnerFilter] = useState<string | undefined>(undefined);
  const selectedOwnerFilter = ownerFilter ?? currentUser?.id;
  const ownerUserId = selectedOwnerFilter === 'all' ? undefined : selectedOwnerFilter;

  const { data: transactions } = useQuery({
    queryKey: ['transactions', selectedMonthId, { type: typeFilter, q: search, ownerUserId }],
    queryFn: () =>
      fetchTransactions({
        monthId: selectedMonthId!,
        type: typeFilter === 'all' ? undefined : typeFilter,
        q: search || undefined,
        ownerUserId,
      }),
    enabled: Boolean(selectedMonthId),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; type?: TransactionType; categoryId?: string | null; detail?: string | null }) =>
      updateTransaction(input.id, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['months'] }),
      ]);
    },
  });

  // Boton "Actualizar Sheet" (ticket ##51): reusa el mismo filtro Yo/Lina/Ambos de arriba para
  // decidir a quien exportar. Se habilita solo si esas personas no tienen nada sin verificar.
  const { data: pendingForSheetExport } = useQuery({
    queryKey: ['transactions', selectedMonthId, { needsReview: true, ownerUserId }],
    queryFn: () => fetchTransactions({ monthId: selectedMonthId!, ownerUserId, needsReview: true }),
    enabled: Boolean(selectedMonthId),
  });

  const sheetExportMutation = useMutation({
    mutationFn: () => {
      const exportOwnerIds = ownerUserId ? [ownerUserId] : (users?.map((u) => u.id) ?? []);
      return updateSheetExport(selectedMonthId!, exportOwnerIds);
    },
  });

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold text-ink">Transacciones del mes</h1>
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
            value={selectedMonthId ?? ''}
            onChange={(e) => setMonthId(e.target.value)}
          >
            {months?.map((m) => (
              <option key={m.id} value={m.id}>
                {MESES[m.month - 1]} {m.year}
              </option>
            ))}
          </select>
        </div>

        {months && months.length === 0 && (
          <p className="rounded-2xl border border-line bg-white p-6 text-center text-sm text-ink-muted">
            Todavia no hay meses creados — crea uno desde el Dashboard.
          </p>
        )}

        {Boolean(months?.length) && (
        <>
        <div className="flex flex-wrap items-center gap-2">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                typeFilter === f.value ? 'bg-ink text-white' : 'border border-line text-ink-soft'
              }`}
            >
              {f.label}
            </button>
          ))}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar descripcion…"
            className="ml-auto rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
        </div>

        {currentUser && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setOwnerFilter(currentUser.id)}
                className={`rounded-full px-3 py-1.5 ${
                  selectedOwnerFilter === currentUser.id ? 'bg-brand-light text-brand' : 'border border-line text-ink-muted'
                }`}
              >
                Yo
              </button>
              {otherUser && (
                <button
                  type="button"
                  onClick={() => setOwnerFilter(otherUser.id)}
                  className={`rounded-full px-3 py-1.5 ${
                    selectedOwnerFilter === otherUser.id ? 'bg-brand-light text-brand' : 'border border-line text-ink-muted'
                  }`}
                >
                  {otherUser.name}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOwnerFilter('all')}
                className={`rounded-full px-3 py-1.5 ${
                  selectedOwnerFilter === 'all' ? 'bg-brand-light text-brand' : 'border border-line text-ink-muted'
                }`}
              >
                Ambos
              </button>
            </div>
            <button
              type="button"
              onClick={() => sheetExportMutation.mutate()}
              disabled={Boolean(pendingForSheetExport?.length) || sheetExportMutation.isPending}
              title={
                pendingForSheetExport?.length
                  ? 'Hay transacciones sin verificar para esta selección'
                  : 'Sube las transacciones verificadas al Google Sheet'
              }
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sheetExportMutation.isPending ? 'Actualizando…' : 'Actualizar Sheet'}
            </button>
          </div>
        )}

        {sheetExportMutation.isSuccess && (
          <p className="text-sm text-success">
            {sheetExportMutation.data.transactionsWritten} transacción(es) agregadas a "{sheetExportMutation.data.tabName}
            "{sheetExportMutation.data.tabCreated ? ' (tab creado)' : ''}.
          </p>
        )}
        {sheetExportMutation.isError && (
          <p className="text-sm text-danger">
            {sheetExportMutation.error instanceof Error ? sheetExportMutation.error.message : 'No se pudo actualizar el Sheet'}
          </p>
        )}

        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-cream text-left text-xs font-bold uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Descripcion / Detalle</th>
                <th className="px-4 py-3">Dueño</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {transactions?.map((tx) => (
                <tr key={tx.id} className="border-t border-line align-top">
                  <td className="px-4 py-3 text-ink-muted">{tx.date}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{tx.bankDescription}</div>
                    <input
                      type="text"
                      defaultValue={tx.detail ?? ''}
                      placeholder="Detalle…"
                      onBlur={(e) => {
                        if (e.target.value !== (tx.detail ?? '')) {
                          updateMutation.mutate({ id: tx.id, detail: e.target.value || null });
                        }
                      }}
                      className="mt-1 w-full border-b border-dashed border-line text-xs text-ink-muted focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">{users?.find((u) => u.id === tx.ownerUserId)?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={tx.type}
                      onChange={(e) => updateMutation.mutate({ id: tx.id, type: e.target.value as TransactionType })}
                      className={`rounded-full border-none px-3 py-1 text-xs font-semibold ${TYPE_PILL_CLASS[tx.type]}`}
                    >
                      {Object.entries(TYPE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={tx.categoryId ?? ''}
                      onChange={(e) => updateMutation.mutate({ id: tx.id, categoryId: e.target.value || null })}
                      className="rounded border border-line bg-white px-2 py-1 text-xs"
                    >
                      <option value="">—</option>
                      {categories?.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-ink">{formatCOP(tx.amount)}</td>
                </tr>
              ))}
              {transactions?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                    No hay transacciones para este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
