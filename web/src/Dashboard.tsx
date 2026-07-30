import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createMonth,
  fetchMonthDetail,
  fetchMonthSummary,
  fetchMonths,
  fetchUsers,
  replaceMonthIncomes,
} from './lib/api';
import { formatCOP, MESES } from './lib/money';

const BUCKET_KIND_LABEL: Record<string, string> = {
  savings: 'Ahorro',
  personal: 'Personal',
  shared_expenses: 'Gasto conjunto',
  other: 'Otro',
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const now = new Date();

  const { data: months, isLoading: loadingMonths } = useQuery({ queryKey: ['months'], queryFn: fetchMonths });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  const [selectedMonthId, setSelectedMonthId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedMonthId && months && months.length > 0) {
      setSelectedMonthId(months[0].id);
    }
  }, [months, selectedMonthId]);

  const createMonthMutation = useMutation({
    mutationFn: () => createMonth(now.getFullYear(), now.getMonth() + 1),
    onSuccess: async (month) => {
      await queryClient.invalidateQueries({ queryKey: ['months'] });
      setSelectedMonthId(month.id);
    },
  });

  const currentMonthExists = months?.some((m) => m.year === now.getFullYear() && m.month === now.getMonth() + 1);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Finanzas en Pareja</h1>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            value={selectedMonthId ?? ''}
            onChange={(e) => setSelectedMonthId(e.target.value)}
            disabled={loadingMonths || !months || months.length === 0}
          >
            {months?.map((m) => (
              <option key={m.id} value={m.id}>
                {MESES[m.month - 1]} {m.year}
              </option>
            ))}
          </select>
          {!currentMonthExists && (
            <button
              type="button"
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50"
              onClick={() => createMonthMutation.mutate()}
              disabled={createMonthMutation.isPending}
            >
              + Crear {MESES[now.getMonth()]}
            </button>
          )}
        </div>
      </header>

      {!selectedMonthId && !loadingMonths && (
        <p className="text-center text-slate-500">Todavia no hay meses creados.</p>
      )}

      {selectedMonthId && users && <MonthPanel monthId={selectedMonthId} users={users} />}
    </div>
  );
}

function MonthPanel({ monthId, users }: { monthId: string; users: { id: string; name: string }[] }) {
  const queryClient = useQueryClient();

  const { data: detail } = useQuery({
    queryKey: ['months', monthId, 'detail'],
    queryFn: () => fetchMonthDetail(monthId),
  });
  const { data: summary } = useQuery({
    queryKey: ['months', monthId, 'summary'],
    queryFn: () => fetchMonthSummary(monthId),
  });

  const [amounts, setAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!detail) return;
    const next: Record<string, string> = {};
    for (const user of users) {
      const income = detail.incomes.find((i) => i.userId === user.id);
      next[user.id] = income?.amount ?? '';
    }
    setAmounts(next);
  }, [detail, users]);

  const saveIncomesMutation = useMutation({
    mutationFn: () =>
      replaceMonthIncomes(
        monthId,
        users
          .filter((user) => amounts[user.id])
          .map((user) => ({ userId: user.id, label: 'Salario', amount: amounts[user.id] })),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['months', monthId, 'detail'] }),
        queryClient.invalidateQueries({ queryKey: ['months', monthId, 'summary'] }),
        queryClient.invalidateQueries({ queryKey: ['months'] }),
      ]);
    },
  });

  const isClosed = detail?.month.status === 'closed';

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-medium text-slate-500">Ingresos del mes</h2>
        <div className="flex flex-col gap-3">
          {users.map((user) => (
            <label key={user.id} className="flex items-center justify-between gap-3">
              <span className="text-slate-700">{user.name}</span>
              <input
                type="number"
                inputMode="decimal"
                className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-right"
                value={amounts[user.id] ?? ''}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [user.id]: e.target.value }))}
                disabled={isClosed}
                placeholder="0"
              />
            </label>
          ))}
          <button
            type="button"
            className="mt-1 self-end rounded-lg bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50"
            onClick={() => saveIncomesMutation.mutate()}
            disabled={isClosed || saveIncomesMutation.isPending}
          >
            Guardar ingresos
          </button>
        </div>
      </section>

      {summary && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-slate-500">
            Presupuesto por bolsa · total {formatCOP(summary.totalIncome)}
          </h2>
          {summary.buckets.map((bucket) => (
            <div key={bucket.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{bucket.name}</span>
                <span className="text-xs text-slate-400">
                  {bucket.percentage}% · {BUCKET_KIND_LABEL[bucket.kind] ?? bucket.kind}
                </span>
              </div>
              <p className="mt-1 text-lg font-semibold text-slate-800">{formatCOP(bucket.budget)}</p>
              <div className="mt-2 flex flex-col gap-1 text-sm text-slate-500">
                {bucket.contributions.map((c) => (
                  <div key={c.userId} className="flex justify-between">
                    <span>{users.find((u) => u.id === c.userId)?.name ?? c.userId}</span>
                    <span>{formatCOP(c.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
