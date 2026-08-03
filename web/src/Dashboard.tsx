import { useEffect, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  closeMine,
  confirmOpeningReconciliation,
  createMonth,
  downloadMonthExport,
  fetchCurrentUser,
  fetchLatestClosure,
  fetchLatestOpeningReconciliation,
  fetchMonthComparison,
  fetchMonthDetail,
  fetchMonthSummary,
  fetchMonths,
  fetchOpeningReconciliationPreview,
  fetchQuickEntries,
  fetchTransactions,
  fetchUsers,
  reopenMine,
  replaceMonthBuckets,
  replaceMonthIncomes,
  type CurrentUser,
  type MonthDetail,
} from './lib/api';
import { CurrencyInput } from './CurrencyInput';
import { formatCOP, MESES } from './lib/money';
import NavBar from './NavBar';

const BUCKET_KIND_LABEL: Record<string, string> = {
  savings: 'Ahorro',
  personal: 'Personal',
  shared_expenses: 'Gasto conjunto',
  other: 'Otro',
};

/** True si el mes calendario (year/month, 1-indexado) ya termino -- hoy cayo en el primer dia del
 * mes siguiente o despues (ticket #33: no se debe poder cerrar un mes que sigue en curso). */
function monthHasEnded(year: number, month: number): boolean {
  const firstDayNextMonth = new Date(year, month, 1);
  return new Date() >= firstDayNextMonth;
}

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

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createYear, setCreateYear] = useState(now.getFullYear());
  const [createMonthNum, setCreateMonthNum] = useState(now.getMonth() + 1);

  const createMonthMutation = useMutation({
    mutationFn: () => createMonth(createYear, createMonthNum),
    onSuccess: async (month) => {
      await queryClient.invalidateQueries({ queryKey: ['months'] });
      setSelectedMonthId(month.id);
      setShowCreateForm(false);
    },
  });

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            to="/r"
            className="rounded-lg bg-brand hover:bg-brand-hover px-3 py-2 text-sm font-semibold text-white"
          >
            + Registrar gasto
          </Link>
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
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
          <button
            type="button"
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand"
            onClick={() => setShowCreateForm((v) => !v)}
          >
            + Crear mes
          </button>
        </div>

        {showCreateForm && (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-white p-4 shadow-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Mes</span>
              <select
                className="rounded-lg border border-line px-3 py-2 text-sm"
                value={createMonthNum}
                onChange={(e) => setCreateMonthNum(Number(e.target.value))}
              >
                {MESES.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Año</span>
              <input
                type="number"
                className="w-24 rounded-lg border border-line px-3 py-2 text-sm"
                value={createYear}
                onChange={(e) => setCreateYear(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              onClick={() => createMonthMutation.mutate()}
              disabled={createMonthMutation.isPending}
            >
              Crear
            </button>
            {createMonthMutation.isError && (
              <p className="w-full text-sm text-danger">
                {createMonthMutation.error instanceof Error ? createMonthMutation.error.message : 'No se pudo crear el mes'}
              </p>
            )}
          </div>
        )}

        {!selectedMonthId && !loadingMonths && (
          <p className="text-center text-ink-muted">Todavia no hay meses creados.</p>
        )}

        {selectedMonthId && users && <MonthPanel monthId={selectedMonthId} users={users} />}

        <MonthComparisonSection />
      </div>
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
  const { data: currentUser } = useQuery({ queryKey: ['auth', 'me'], queryFn: fetchCurrentUser });

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

  const invalidateMonth = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['months'] }),
      queryClient.invalidateQueries({ queryKey: ['months', monthId, 'detail'] }),
      queryClient.invalidateQueries({ queryKey: ['months', monthId, 'summary'] }),
      queryClient.invalidateQueries({ queryKey: ['months', 'comparison'] }),
    ]);

  const exportMutation = useMutation({
    mutationFn: () => {
      const m = detail!.month;
      return downloadMonthExport(monthId, `finanzas-${m.year}-${String(m.month).padStart(2, '0')}.xlsx`);
    },
  });

  const { data: needsReview } = useQuery({
    queryKey: ['transactions', monthId, { needsReview: true }],
    queryFn: () => fetchTransactions({ monthId, needsReview: true }),
  });
  const { data: pendingQuickEntries } = useQuery({
    queryKey: ['quickEntries', monthId, 'pending'],
    queryFn: () => fetchQuickEntries(monthId, 'pending'),
  });

  return (
    <div className="flex flex-col gap-6">
      {detail && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {exportMutation.isPending ? 'Exportando…' : 'Exportar a Excel'}
          </button>
        </div>
      )}

      {(Boolean(needsReview?.length) || Boolean(pendingQuickEntries?.length)) && (
        <div className="flex flex-wrap gap-4 text-sm">
          {Boolean(needsReview?.length) && (
            <span>
              <b className="text-danger">{needsReview!.length}</b> sin clasificar →{' '}
              <Link to="/revisar" className="font-semibold text-brand">
                revisar
              </Link>
            </span>
          )}
          {Boolean(pendingQuickEntries?.length) && (
            <span className="text-ink-muted">
              <b>{pendingQuickEntries!.length}</b> registros sin match
            </span>
          )}
        </div>
      )}

      <section className="rounded-xl border border-line bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-medium text-ink-muted">Ingresos del mes</h2>
        <div className="flex flex-col gap-3">
          {users.map((user) => (
            <label key={user.id} className="flex items-center justify-between gap-3">
              <span className="text-ink-soft">{user.name}</span>
              <CurrencyInput
                className="w-40"
                value={amounts[user.id] ?? ''}
                onChange={(rawValue) => setAmounts((prev) => ({ ...prev, [user.id]: rawValue }))}
                disabled={isClosed}
              />
            </label>
          ))}
          <button
            type="button"
            className="mt-1 self-end rounded-lg bg-brand hover:bg-brand-hover px-4 py-2 text-sm text-white disabled:opacity-50"
            onClick={() => saveIncomesMutation.mutate()}
            disabled={isClosed || saveIncomesMutation.isPending}
          >
            Guardar ingresos
          </button>
        </div>
      </section>

      {currentUser && <OpeningReconciliationSection monthId={monthId} currentUser={currentUser} users={users} />}

      {detail && (
        <MonthBucketsPanel
          monthId={monthId}
          monthBuckets={detail.monthBuckets}
          isClosed={isClosed}
          onSaved={invalidateMonth}
        />
      )}

      {summary && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-ink-muted">
            Presupuesto por bolsa · total {formatCOP(summary.totalIncome)}
          </h2>
          {summary.buckets.map((bucket) => {
            const tracksSpending = bucket.kind === 'shared_expenses' || bucket.kind === 'personal';
            const isOverspent = tracksSpending && Number(bucket.available) < 0;
            return (
              <div key={bucket.id} className="rounded-xl border border-line bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{bucket.name}</span>
                  <span className="text-xs text-ink-faint">
                    {bucket.percentage}% · {BUCKET_KIND_LABEL[bucket.kind] ?? bucket.kind}
                  </span>
                </div>
                <p className="mt-1 text-lg font-semibold text-ink">{formatCOP(bucket.budget)}</p>
                {tracksSpending && (
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="text-ink-muted">Gastado {formatCOP(bucket.spent)}</span>
                    <span className={`font-semibold ${isOverspent ? 'text-danger' : 'text-success'}`}>
                      Disponible {formatCOP(bucket.available)}
                    </span>
                  </div>
                )}
                <div className="mt-2 flex flex-col gap-1 text-sm text-ink-muted">
                  {bucket.contributions.map((c) => (
                    <div key={c.userId} className="flex justify-between">
                      <span>{users.find((u) => u.id === c.userId)?.name ?? c.userId}</span>
                      <span>
                        {formatCOP(c.amount)}
                        {c.spent !== undefined && (
                          <span className="ml-2 text-xs text-ink-faint">gastado {formatCOP(c.spent)}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {summary && (
        <section className="rounded-xl bg-ink p-5 text-white shadow-sm">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">
            Cierre del mes · ahorro real
          </h2>
          <p className="mb-4 max-w-xl text-sm leading-relaxed text-white/85">
            {Number(summary.close.sharedExpensesExcess) > 0
              ? `Gastos del Mes se pasó ${formatCOP(summary.close.sharedExpensesExcess)}. El exceso se descuenta de lo que se mueve a ahorros, proporcional al ingreso de cada uno.`
              : 'Gastos del Mes no se paso del presupuesto: el ahorro real es igual al aporte calculado a Ahorros Conjuntos.'}
          </p>
          <div className="flex flex-wrap gap-8">
            {summary.close.perPerson.map((p) => (
              <div key={p.userId}>
                <div className="text-xs text-white/60">
                  {users.find((u) => u.id === p.userId)?.name ?? p.userId} mueve a ahorros
                </div>
                <div className="text-lg font-extrabold">{formatCOP(p.realSavings)}</div>
                <div className="mt-2 text-xs text-white/60">Deja en cuenta</div>
                <div className="text-sm font-bold">{formatCOP(p.leaveInAccount)}</div>
              </div>
            ))}
          </div>
          {currentUser && (
            <MonthClosureSection
              monthId={monthId}
              currentUser={currentUser}
              users={users}
              isClosed={isClosed}
              monthYear={summary.month.year}
              monthNumber={summary.month.month}
              onChanged={invalidateMonth}
            />
          )}
        </section>
      )}
    </div>
  );
}

// ---- Cierre de mes individual por persona (ticket #34) ----

function MonthClosureSection({
  monthId,
  currentUser,
  users,
  isClosed,
  monthYear,
  monthNumber,
  onChanged,
}: {
  monthId: string;
  currentUser: CurrentUser;
  users: { id: string; name: string }[];
  isClosed: boolean;
  monthYear: number;
  monthNumber: number;
  onChanged: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();

  const closureQueries = useQueries({
    queries: users.map((user) => ({
      queryKey: ['months', monthId, 'closures', 'latest', user.id],
      queryFn: () => fetchLatestClosure(monthId, user.id),
    })),
  });

  const currentUserRecord = closureQueries[users.findIndex((u) => u.id === currentUser.id)]?.data;
  const currentUserClosed = currentUserRecord?.action === 'closed';
  const monthEnded = monthHasEnded(monthYear, monthNumber);

  async function handleChange() {
    await Promise.all(users.map((user) => queryClient.invalidateQueries({ queryKey: ['months', monthId, 'closures', 'latest', user.id] })));
    await onChanged();
  }

  const closeMineMutation = useMutation({
    mutationFn: () => closeMine(monthId, currentUser.id),
    onSuccess: handleChange,
  });
  const reopenMineMutation = useMutation({
    mutationFn: () => reopenMine(monthId, currentUser.id),
    onSuccess: handleChange,
  });

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        {users.map((user, i) => {
          const record = closureQueries[i]?.data;
          const closed = record?.action === 'closed';
          return (
            <span key={user.id} className={`flex items-center gap-1 ${closed ? 'text-success' : 'text-white/50'}`}>
              <span aria-hidden="true">{closed ? '✓' : '○'}</span>
              <span>
                {user.name}
                {closed ? ` · ${new Date(record!.createdAt).toLocaleDateString('es-CO')}` : ' · pendiente'}
              </span>
            </span>
          );
        })}
        {isClosed && <span className="font-semibold text-success">Mes cerrado</span>}
      </div>

      <div className="mt-4 flex flex-col items-end gap-2">
        {currentUserClosed ? (
          <button
            type="button"
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50"
            onClick={() => reopenMineMutation.mutate()}
            disabled={reopenMineMutation.isPending}
          >
            Reabrir mi cierre
          </button>
        ) : (
          <>
            <button
              type="button"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              onClick={() => closeMineMutation.mutate()}
              disabled={closeMineMutation.isPending || !monthEnded}
            >
              Cerrar mi parte
            </button>
            {!monthEnded && (
              <p className="text-xs text-white/60">
                Se habilita cuando termine {MESES[monthNumber - 1]} {monthYear}.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

type MonthBucketRow = MonthDetail['monthBuckets'][number];

function MonthBucketsPanel({
  monthId,
  monthBuckets,
  isClosed,
  onSaved,
}: {
  monthId: string;
  monthBuckets: MonthBucketRow[];
  isClosed: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [rows, setRows] = useState<MonthBucketRow[]>(monthBuckets);

  useEffect(() => {
    setRows(monthBuckets);
  }, [monthBuckets]);

  const saveMutation = useMutation({
    mutationFn: () => replaceMonthBuckets(monthId, rows),
    onSuccess: async () => {
      await onSaved();
      setShowForm(false);
    },
  });

  const activeSum = rows.filter((b) => b.active).reduce((sum, b) => sum + Number(b.percentage), 0);

  function updateRow(id: string, patch: Partial<MonthBucketRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <section className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink-muted">Rubros de este mes</h2>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="text-xs font-semibold text-brand">
          {showForm ? 'Cerrar' : 'Configurar mes'}
        </button>
      </div>

      {showForm && (
        <div className="mt-3 flex flex-col gap-2">
          {isClosed && (
            <p className="rounded-lg bg-warning-light p-2 text-xs text-warning">
              El mes esta cerrado — reabrelo para poder editar sus rubros.
            </p>
          )}
          {rows.map((bucket) => (
            <div
              key={bucket.id}
              className={`flex items-center justify-between gap-3 border-t border-line py-2 ${bucket.active ? '' : 'opacity-40'}`}
            >
              <span className="text-sm text-ink-soft">{bucket.name}</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={bucket.percentage}
                    onChange={(e) => updateRow(bucket.id, { percentage: e.target.value })}
                    disabled={isClosed}
                    className="w-16 rounded-lg border border-line px-2 py-1 text-right text-sm disabled:opacity-50"
                  />
                  <span className="text-xs text-ink-muted">%</span>
                </div>
                <button
                  type="button"
                  disabled={isClosed}
                  onClick={() => updateRow(bucket.id, { active: !bucket.active })}
                  className="text-xs font-semibold text-ink-muted hover:text-brand disabled:opacity-50"
                >
                  {bucket.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between">
            <span className={`text-xs font-bold ${activeSum === 100 ? 'text-success' : 'text-danger'}`}>
              Suman {activeSum}%
            </span>
            <button
              type="button"
              disabled={isClosed || activeSum !== 100 || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Guardar rubros
            </button>
          </div>
          {saveMutation.isError && (
            <p className="text-xs text-danger">
              {saveMutation.error instanceof Error ? saveMutation.error.message : 'No se pudo guardar'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ---- Cuadre de Inicio (ticket #29) ----

function OpeningReconciliationSection({
  monthId,
  currentUser,
  users,
}: {
  monthId: string;
  currentUser: CurrentUser;
  users: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirmingRedo, setConfirmingRedo] = useState(false);

  const latestQueryKey = ['months', monthId, 'opening-reconciliation', 'latest', currentUser.id];
  const { data: latest } = useQuery({
    queryKey: latestQueryKey,
    queryFn: () => fetchLatestOpeningReconciliation(monthId, currentUser.id),
  });

  // Estado por persona (John/Lina) para mostrar los checks -- separado del query de arriba, que es
  // solo del usuario actual y maneja la logica de abrir el wizard / ofrecer repetir (ticket #33).
  const perPersonQueries = useQueries({
    queries: users.map((user) => ({
      queryKey: ['months', monthId, 'opening-reconciliation', 'latest', user.id],
      queryFn: () => fetchLatestOpeningReconciliation(monthId, user.id),
    })),
  });
  const allDone = users.length > 0 && perPersonQueries.every((q) => Boolean(q.data));

  function handleButtonClick() {
    if (latest) {
      setConfirmingRedo(true);
      return;
    }
    setWizardOpen(true);
  }

  return (
    <section className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-ink-muted">Cuadre de Inicio</h2>
          {latest && (
            <p className="mt-1 text-xs text-ink-faint">
              Cuadre de inicio realizado en {new Date(latest.createdAt).toLocaleDateString('es-CO')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleButtonClick}
          className="shrink-0 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand"
        >
          Cuadre de Inicio
        </button>
      </div>

      {users.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          {users.map((user, i) => {
            const record = perPersonQueries[i]?.data;
            return (
              <span
                key={user.id}
                className={`flex items-center gap-1 ${record ? 'text-success' : 'text-ink-faint'}`}
              >
                <span aria-hidden="true">{record ? '✓' : '○'}</span>
                <span>
                  {user.name}
                  {record ? ` · ${new Date(record.createdAt).toLocaleDateString('es-CO')}` : ' · pendiente'}
                </span>
              </span>
            );
          })}
          {allDone && <span className="font-semibold text-success">Cuadre completo</span>}
        </div>
      )}

      {confirmingRedo && latest && (
        <div className="mt-3 rounded-lg bg-warning-light p-3 text-sm text-warning">
          <p>El cuadre ya se hizo el {new Date(latest.createdAt).toLocaleDateString('es-CO')}. ¿Deseas repetirlo?</p>
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setConfirmingRedo(false)} className="text-ink-muted">
              Cancelar
            </button>
            <button
              type="button"
              className="font-semibold text-brand"
              onClick={() => {
                setConfirmingRedo(false);
                setWizardOpen(true);
              }}
            >
              Sí, repetir
            </button>
          </div>
        </div>
      )}

      {wizardOpen && (
        <OpeningReconciliationWizard
          monthId={monthId}
          currentUser={currentUser}
          onClose={() => setWizardOpen(false)}
          onDone={async () => {
            setWizardOpen(false);
            await queryClient.invalidateQueries({ queryKey: latestQueryKey });
          }}
        />
      )}
    </section>
  );
}

type WizardStep = 'check' | 'balance' | 'breakdown' | 'confirm' | 'success' | 'mismatch';

function OpeningReconciliationWizard({
  monthId,
  currentUser,
  onClose,
  onDone,
}: {
  monthId: string;
  currentUser: CurrentUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<WizardStep>('check');
  const [upToDateAnswer, setUpToDateAnswer] = useState<boolean | null>(null);
  const [initialBalance, setInitialBalance] = useState('');
  const [confirmedBalance, setConfirmedBalance] = useState('');

  const { data: transactions, isLoading: loadingTransactions } = useQuery({
    queryKey: ['transactions', monthId, { ownerUserId: currentUser.id }],
    queryFn: () => fetchTransactions({ monthId, ownerUserId: currentUser.id }),
  });
  const hasTransactions = Boolean(transactions?.length);
  const blocked = !loadingTransactions && (!hasTransactions || upToDateAnswer === false);

  const { data: preview } = useQuery({
    queryKey: ['months', monthId, 'opening-reconciliation', 'preview', currentUser.id, initialBalance],
    queryFn: () => fetchOpeningReconciliationPreview(monthId, currentUser.id, initialBalance),
    enabled: (step === 'breakdown' || step === 'confirm') && Boolean(initialBalance),
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      confirmOpeningReconciliation(monthId, {
        userId: currentUser.id,
        accountBalance: initialBalance,
        confirmedBalance,
      }),
    onSuccess: (data) => {
      setStep(data.openingReconciliation.matched ? 'success' : 'mismatch');
    },
  });

  const result = confirmMutation.data;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-lg sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">Cuadre de Inicio</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-ink-faint hover:text-ink">
            ✕
          </button>
        </div>

        {step === 'check' &&
          (loadingTransactions ? (
            <p className="text-sm text-ink-muted">Verificando transacciones del mes…</p>
          ) : blocked ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-soft">
                {!hasTransactions
                  ? 'Todavía no hay transacciones importadas para este mes.'
                  : 'Para hacer el cuadre necesitamos el extracto al día.'}
              </p>
              <p className="text-sm text-ink-muted">
                Descarga un archivo con las transacciones hasta este momento, impórtalo, y recuerda anotar el saldo
                exacto de tu cuenta antes de continuar.
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-muted">
                  Cerrar
                </button>
                <Link
                  to="/importar"
                  onClick={onClose}
                  className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                >
                  Ir a importar
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-soft">
                Ya existen transacciones para este mes. ¿Corresponden a todas las transacciones al día de hoy?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUpToDateAnswer(false)}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink-soft"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setStep('balance')}
                  className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                >
                  Sí, continuar
                </button>
              </div>
            </div>
          ))}

        {step === 'balance' && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-ink-soft">Saldo actual en cuenta Bancolombia</span>
              <CurrencyInput value={initialBalance} onChange={setInitialBalance} autoFocus />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-muted">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!initialBalance}
                onClick={() => setStep('breakdown')}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {step === 'breakdown' &&
          (preview ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Total Gastos</span>
                  <span className="font-medium text-ink">{formatCOP(preview.totalSharedExpenses)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Aporte presupuestado a Ahorros Conjuntos</span>
                  <span className="font-medium text-ink">{formatCOP(preview.totalSavings)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Total Ahorros Personales</span>
                  <span className="font-medium text-ink">{formatCOP(preview.totalPersonal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Gastos a la fecha</span>
                  <span className="font-medium text-ink">{formatCOP(preview.expensesToDate)}</span>
                </div>
              </div>
              <div className="rounded-lg bg-ink p-3 text-white">
                <div className="flex justify-between text-sm">
                  <span className="text-white/70">Dejar en cuenta</span>
                  <span className="font-bold">{formatCOP(preview.leaveInAccount)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-white/70">Mover a Nu</span>
                  <span className="font-bold">{formatCOP(preview.moveToSavings)}</span>
                </div>
              </div>
              <p className="text-xs text-ink-faint">
                "Mover a Nu" puede ser mayor al aporte presupuestado a Ahorros Conjuntos si queda saldo de meses
                anteriores en la cuenta — ese sobrante se termina de repartir en el cuadre de cierre. Haz la
                transferencia por el valor exacto a mover a Nu y luego confirma el nuevo saldo.
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-muted">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => setStep('confirm')}
                  className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                >
                  Ya hice la transferencia
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Calculando…</p>
          ))}

        {step === 'confirm' && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-ink-soft">Nuevo saldo en cuenta tras la transferencia</span>
              <CurrencyInput value={confirmedBalance} onChange={setConfirmedBalance} autoFocus />
            </label>
            {confirmMutation.isError && (
              <p className="text-sm text-danger">
                {confirmMutation.error instanceof Error ? confirmMutation.error.message : 'No se pudo confirmar el cuadre'}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-muted">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!confirmedBalance || confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {confirmMutation.isPending ? 'Confirmando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && result && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-success">Cuadre de Inicio completado con éxito.</p>
            <p className="text-sm text-ink-soft">
              Para dividir lo que hay en Nu entre personal y conjunto (Cajitas), ejecuta el cierre del mes anterior.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onDone}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
              >
                Listo
              </button>
            </div>
          </div>
        )}

        {step === 'mismatch' && result && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-danger">El saldo no coincide.</p>
            <p className="text-sm text-ink-soft">
              Esperábamos {formatCOP(result.openingReconciliation.leaveInAccount)} y anotaste{' '}
              {formatCOP(result.openingReconciliation.accountBalance)} (diferencia de{' '}
              {formatCOP(String(Math.abs(Number(result.diff))))}).
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Link
                to="/transacciones"
                onClick={onClose}
                className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft"
              >
                Revisar transacciones
              </Link>
              <button
                type="button"
                onClick={() => setStep('confirm')}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
              >
                Corregir saldo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MonthComparisonSection() {
  const { data: months } = useQuery({ queryKey: ['months', 'comparison'], queryFn: fetchMonthComparison });

  if (!months || months.length === 0) return null;

  return (
    <section className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-medium text-ink-muted">Comparativo mes a mes</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-faint">
              <th className="pb-2 pr-3 font-medium">Mes</th>
              <th className="pb-2 pr-3 font-medium">Ingresos</th>
              <th className="pb-2 pr-3 font-medium">Gastado conjunto</th>
              <th className="pb-2 font-medium">Ahorro real total</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const sharedBucket = m.buckets.find((b) => b.kind === 'shared_expenses');
              const totalRealSavings = m.close.perPerson.reduce((sum, p) => sum + Number(p.realSavings), 0);
              return (
                <tr key={m.monthId} className="border-t border-line">
                  <td className="py-2 pr-3 font-medium text-ink">
                    {MESES[m.month - 1]} {m.year}
                  </td>
                  <td className="py-2 pr-3 text-ink-muted">{formatCOP(m.totalIncome)}</td>
                  <td className="py-2 pr-3 text-ink-muted">{sharedBucket ? formatCOP(sharedBucket.spent) : '—'}</td>
                  <td className="py-2 font-semibold text-success">{formatCOP(String(totalRealSavings))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
