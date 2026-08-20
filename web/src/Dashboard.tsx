import { useEffect, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  closeMine,
  confirmOpeningReconciliation,
  createMonth,
  downloadMonthExport,
  fetchAppSettings,
  fetchCloseCheck,
  fetchClosePreview,
  fetchCurrentUser,
  fetchFamilySavingsEntries,
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
import { bucketPercentUsed, bucketStatus, formatCOP, MESES, type BucketStatus } from './lib/money';
import NavBar from './NavBar';
import type { MonthSummaryDetail } from './lib/api';

const BUCKET_KIND_LABEL: Record<string, string> = {
  savings: 'Ahorro',
  personal: 'Personal',
  shared_expenses: 'Gasto conjunto',
  other: 'Otro',
};

// Semaforo de 3 estados por bolsa (ticket #44): mismos tokens de color de tailwind.config.js
// (success/warning/danger) usados en el resto de la app.
const STATUS_TEXT_CLASS: Record<BucketStatus, string> = {
  ok: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};
const STATUS_BAR_CLASS: Record<BucketStatus, string> = {
  ok: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

function BucketProgressBar({ status, percentUsed }: { status: BucketStatus; percentUsed: number }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cream-surface">
      <div className={`h-full rounded-full ${STATUS_BAR_CLASS[status]}`} style={{ width: `${percentUsed}%` }} />
    </div>
  );
}

// ---- Resumen del mes (ticket #44): ingresos vs. gastado total, consolidado arriba del dashboard ----

function MonthOverviewCard({ summary }: { summary: MonthSummaryDetail }) {
  const spendingBuckets = summary.buckets.filter((b) => b.kind === 'shared_expenses' || b.kind === 'personal');
  const totalBudget = spendingBuckets.reduce((sum, b) => sum + Number(b.budget), 0);
  const totalSpent = spendingBuckets.reduce((sum, b) => sum + Number(b.spent), 0);
  const totalAvailable = totalBudget - totalSpent;
  const status = bucketStatus(String(totalBudget), String(totalSpent));

  return (
    <section className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-medium text-ink-muted">Resumen del mes</h2>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <div>
          <div className="text-xs text-ink-faint">Ingresos totales</div>
          <div className="text-lg font-semibold text-ink">{formatCOP(summary.totalIncome)}</div>
        </div>
        <div>
          <div className="text-xs text-ink-faint">Gastado (conjunto + personal)</div>
          <div className="text-lg font-semibold text-ink">{formatCOP(String(totalSpent))}</div>
        </div>
        <div>
          <div className="text-xs text-ink-faint">Disponible</div>
          <div className={`text-lg font-semibold ${STATUS_TEXT_CLASS[status]}`}>
            {formatCOP(String(totalAvailable))}
          </div>
        </div>
      </div>
      <BucketProgressBar status={status} percentUsed={bucketPercentUsed(String(totalBudget), String(totalSpent))} />
    </section>
  );
}

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

      {summary && <MonthOverviewCard summary={summary} />}

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
            const status = bucketStatus(bucket.budget, bucket.spent);
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
                  <>
                    <BucketProgressBar status={status} percentUsed={bucketPercentUsed(bucket.budget, bucket.spent)} />
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="text-ink-muted">Gastado {formatCOP(bucket.spent)}</span>
                      <span className={`font-semibold ${STATUS_TEXT_CLASS[status]}`}>
                        Disponible {formatCOP(bucket.available)}
                      </span>
                    </div>
                  </>
                )}
                <div className="mt-2 flex flex-col gap-1 text-sm text-ink-muted">
                  {bucket.contributions.map((c) => {
                    // Semaforo tambien por persona (ticket #44): cuanto gasto cada uno contra su
                    // propia porcion del presupuesto de la bolsa, no solo el agregado.
                    const contributionStatus = c.spent !== undefined ? bucketStatus(c.amount, c.spent) : undefined;
                    // Disponible por persona (##70): mismo dato que ya trae el agregado de la
                    // bolsa (presupuesto - gastado), solo que a nivel individual.
                    const contributionAvailable =
                      c.spent !== undefined ? String(Number(c.amount) - Number(c.spent)) : undefined;
                    return (
                      <div key={c.userId} className="flex justify-between">
                        <span>{users.find((u) => u.id === c.userId)?.name ?? c.userId}</span>
                        <span>
                          {formatCOP(c.amount)}
                          {c.spent !== undefined && (
                            <span
                              className={`ml-2 text-xs font-semibold ${contributionStatus ? STATUS_TEXT_CLASS[contributionStatus] : 'text-ink-faint'}`}
                            >
                              gastado {formatCOP(c.spent)}
                            </span>
                          )}
                          {contributionAvailable !== undefined && (
                            <span
                              className={`ml-2 text-xs font-semibold ${contributionStatus ? STATUS_TEXT_CLASS[contributionStatus] : 'text-ink-faint'}`}
                            >
                              disponible {formatCOP(contributionAvailable)}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
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
              ? `Gastos del Mes se pasó ${formatCOP(summary.close.sharedExpensesExcess)} en total. El sobregasto (o el bono, si sobró) lo asume quien lo generó — cada quien responde por su propia bolsa, no se reparte por ingreso.`
              : 'Gastos del Mes no se pasó del presupuesto en total: el ahorro real de cada quien depende de su propia bolsa (aporte a Ahorros Conjuntos + lo que le sobró o faltó en Gastos del Mes).'}
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
  const [wizardOpen, setWizardOpen] = useState(false);

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
    await queryClient.invalidateQueries({ queryKey: ['family-savings'] });
    await onChanged();
  }

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
              onClick={() => setWizardOpen(true)}
              disabled={!monthEnded}
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

      {wizardOpen && (
        <MonthClosureWizard
          monthId={monthId}
          currentUser={currentUser}
          monthYear={monthYear}
          monthNumber={monthNumber}
          onClose={() => setWizardOpen(false)}
          onDone={async () => {
            setWizardOpen(false);
            await handleChange();
          }}
        />
      )}
    </>
  );
}

// ---- Wizard de cierre refinado (ticket #36) ----

/** Usado solo mientras carga el umbral configurado (Configuracion) -- ver fetchAppSettings. */
const YIELD_AUTO_THRESHOLD_FALLBACK = 200000;

type CloseWizardStep = 'check' | 'blocked' | 'nuBalance' | 'bigExpense' | 'breakdown' | 'finalBalance' | 'result';

function MonthClosureWizard({
  monthId,
  currentUser,
  monthYear,
  monthNumber,
  onClose,
  onDone,
}: {
  monthId: string;
  currentUser: CurrentUser;
  monthYear: number;
  monthNumber: number;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [step, setStep] = useState<CloseWizardStep>('check');
  const [nuBalance, setNuBalance] = useState('');
  const [hasBigExpense, setHasBigExpense] = useState<boolean | null>(null);
  const [bigExpenseAmount, setBigExpenseAmount] = useState('');
  const [bigExpenseDescription, setBigExpenseDescription] = useState('');
  const [finalBalance, setFinalBalance] = useState('');
  const [acceptYield, setAcceptYield] = useState(false);

  const monthLabel = `${MESES[monthNumber - 1]} ${monthYear}`;

  const { data: check, isLoading: loadingCheck } = useQuery({
    queryKey: ['months', monthId, 'close-check', currentUser.id],
    queryFn: () => fetchCloseCheck(monthId, currentUser.id),
  });

  useEffect(() => {
    if (!check || step !== 'check') return;
    setStep(check.unclassifiedCount > 0 || !check.nextMonthOpeningDone ? 'blocked' : 'nuBalance');
  }, [check, step]);

  const nextMonthId = check?.nextMonthId ?? undefined;

  // Candidatos para "gasto grande" (paso #39): del mes que se cierra y tambien del mes
  // siguiente, ya que el gasto realmente afecta los ahorros de ESE mes (ticket #40).
  const { data: movementCandidatesClosingMonth } = useQuery({
    queryKey: ['transactions', monthId, { ownerUserId: currentUser.id, type: 'movement' }],
    queryFn: () => fetchTransactions({ monthId, ownerUserId: currentUser.id, type: 'movement' }),
    enabled: step === 'bigExpense',
  });
  const { data: movementCandidatesNextMonth } = useQuery({
    queryKey: ['transactions', nextMonthId, { ownerUserId: currentUser.id, type: 'movement' }],
    queryFn: () => fetchTransactions({ monthId: nextMonthId!, ownerUserId: currentUser.id, type: 'movement' }),
    enabled: step === 'bigExpense' && Boolean(nextMonthId),
  });
  const movementCandidates = [...(movementCandidatesClosingMonth ?? []), ...(movementCandidatesNextMonth ?? [])];
  const nonPayrollMovements = movementCandidates.filter((tx) => !/NOMI|INTERBANC/i.test(tx.bankDescription));

  const { data: preview } = useQuery({
    queryKey: ['months', monthId, 'close-preview', currentUser.id],
    queryFn: () => fetchClosePreview(monthId, currentUser.id),
    enabled: step === 'breakdown' || step === 'finalBalance' || step === 'result',
  });

  // Presupuesto de ahorro del mes que entra (ej. Agosto al cerrar Julio) -- paso #42, para indicar
  // cuanto mover a Ahorros Conjuntos por ese mes durante ESTE cierre.
  const { data: nextMonthPreview } = useQuery({
    queryKey: ['months', nextMonthId, 'close-preview', currentUser.id],
    queryFn: () => fetchClosePreview(nextMonthId!, currentUser.id),
    enabled: step === 'breakdown' && Boolean(nextMonthId),
  });
  const nextMonthLabel =
    monthNumber === 12 ? `${MESES[0]} ${monthYear + 1}` : `${MESES[monthNumber]} ${monthYear}`;

  const { data: pastEntries } = useQuery({
    queryKey: ['family-savings', 'entries', currentUser.id, 'closure-wizard'],
    queryFn: () => fetchFamilySavingsEntries({ userId: currentUser.id }),
    enabled: step === 'finalBalance' || step === 'result',
  });

  const { data: appSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchAppSettings,
    enabled: step === 'finalBalance' || step === 'result',
  });
  const yieldThreshold = appSettings ? Number(appSettings.yieldAutoThreshold) : YIELD_AUTO_THRESHOLD_FALLBACK;

  const bigExpenseValue = hasBigExpense ? Number(bigExpenseAmount || '0') : 0;
  // El gasto grande ya no se resta de "Ahorros de [mes en cierre]" -- afecta al mes siguiente
  // (ticket #40). Igual se descuenta aqui porque la plata sale de la misma cajita de Nu, sin
  // importar a que mes quede atribuida en el ledger.
  const netSavings = preview ? Number(preview.monthlySavingsBudget) : undefined;
  const adjustment = preview ? Number(preview.adjustment) : undefined;

  // Guia accionable del paso `breakdown` (ticket #42): cuanto mover en Nu y que saldo debe quedar
  // tras cada movimiento. "nuBalance" es el saldo general de Nu (no la cajita de Ahorros Conjuntos)
  // que se pregunta al inicio del wizard.
  const nuBalanceNum = Number(nuBalance || '0');
  // Paso 1: ajuste de Ahorros Conjuntos del mes que cierra. Ingresar a ahorros resta del saldo
  // general; retirar de ahorros suma -- por eso siempre se resta el ajuste (su signo ya indica la
  // direccion: negativo = retirar, positivo = ingresar).
  const checkpointAfterAdjustment = adjustment !== undefined ? nuBalanceNum - adjustment : undefined;
  // Paso 2: ahorros del mes que entra (ej. Agosto), ya descontado el gasto grande de este cierre.
  const nextMonthSavingsBudget = nextMonthPreview ? Number(nextMonthPreview.monthlySavingsBudget) : undefined;
  const nextMonthSavingsToMove =
    nextMonthSavingsBudget !== undefined ? nextMonthSavingsBudget - bigExpenseValue : undefined;
  const checkpointAfterNextMonthSavings =
    checkpointAfterAdjustment !== undefined && nextMonthSavingsToMove !== undefined
      ? checkpointAfterAdjustment - nextMonthSavingsToMove
      : undefined;

  const balanceSoFar = pastEntries?.reduce((sum, entry) => sum + Number(entry.amount), 0) ?? 0;
  const calculatedBalance =
    netSavings !== undefined && adjustment !== undefined
      ? balanceSoFar + netSavings + adjustment - bigExpenseValue
      : undefined;
  const diff = calculatedBalance !== undefined && finalBalance ? Number(finalBalance) - calculatedBalance : undefined;
  const suggestsYield = diff !== undefined && diff > 0 && diff <= yieldThreshold;

  const closeMineMutation = useMutation({
    mutationFn: () =>
      closeMine(monthId, currentUser.id, {
        ...(hasBigExpense
          ? { bigExpenseAmount, bigExpenseDescription: bigExpenseDescription || 'gasto grande de ahorros' }
          : {}),
        ...(suggestsYield && acceptYield && diff !== undefined ? { yieldAmount: String(diff) } : {}),
      }),
    onSuccess: () => onDone(),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 shadow-lg sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">Cerrar {monthLabel}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-ink-faint hover:text-ink">
            ✕
          </button>
        </div>

        {step === 'check' && <p className="text-sm text-ink-muted">Verificando…</p>}

        {step === 'blocked' && check && (
          <div className="flex flex-col gap-3">
            {check.unclassifiedCount > 0 ? (
              <>
                <p className="text-sm text-ink-soft">
                  Tienes <b>{check.unclassifiedCount}</b> transacción(es) sin clasificar este mes. Clasifícalas antes
                  de cerrar.
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-muted">
                    Cerrar
                  </button>
                  <Link
                    to="/revisar"
                    onClick={onClose}
                    className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                  >
                    Ir a revisar
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-soft">
                  Antes de cerrar {monthLabel}, primero haz el Cuadre de Inicio del mes siguiente (así se deja en Nu
                  lo de ese mes y lo que sobró de este).
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-muted">
                    Cerrar
                  </button>
                  <Link
                    to="/"
                    onClick={onClose}
                    className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                  >
                    Ir al Dashboard
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'nuBalance' && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-ink-soft">Saldo actual en Nu (el general, no la cajita de Ahorros)</span>
              <CurrencyInput value={nuBalance} onChange={setNuBalance} autoFocus />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-muted">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!nuBalance}
                onClick={() => setStep('bigExpense')}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {step === 'bigExpense' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">¿Hubo algún gasto grande de ahorros este mes (vacaciones, compras grandes)?</p>
            {nonPayrollMovements.length > 0 && (
              <div className="rounded-lg bg-cream p-2 text-xs text-ink-muted">
                <p className="mb-1 font-semibold">Movimientos del mes que podrían ser candidatos:</p>
                {nonPayrollMovements.map((tx) => (
                  <div key={tx.id} className="flex justify-between">
                    <span>{tx.bankDescription}</span>
                    <span>{formatCOP(tx.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setHasBigExpense(false);
                  setStep('breakdown');
                }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${hasBigExpense === false ? 'border-brand bg-brand-light text-brand' : 'border-line text-ink-soft'}`}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => setHasBigExpense(true)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${hasBigExpense === true ? 'border-brand bg-brand-light text-brand' : 'border-line text-ink-soft'}`}
              >
                Sí
              </button>
            </div>
            {hasBigExpense === true && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-ink-soft">Monto gastado</span>
                  <CurrencyInput value={bigExpenseAmount} onChange={setBigExpenseAmount} autoFocus />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-ink-soft">Descripción</span>
                  <input
                    type="text"
                    value={bigExpenseDescription}
                    onChange={(e) => setBigExpenseDescription(e.target.value)}
                    placeholder="Ej. Compra de tiquetes aéreos"
                    className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
                  />
                </label>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!bigExpenseAmount || !bigExpenseDescription}
                    onClick={() => setStep('breakdown')}
                    className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    Continuar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'breakdown' &&
          (adjustment !== undefined &&
          checkpointAfterAdjustment !== undefined &&
          nextMonthSavingsToMove !== undefined &&
          checkpointAfterNextMonthSavings !== undefined ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-ink">Sigue estos movimientos en Nu:</p>

              <div className="rounded-lg border border-line p-3 text-sm">
                <p className="text-ink">
                  <b>1.</b>{' '}
                  {adjustment < 0 ? (
                    <>
                      Retira <b>{formatCOP(String(Math.abs(adjustment)))}</b> de tu cajita de Ahorros Conjuntos
                    </>
                  ) : adjustment > 0 ? (
                    <>
                      Ingresa <b>{formatCOP(String(adjustment))}</b> a tu cajita de Ahorros Conjuntos
                    </>
                  ) : (
                    'No hay ajuste de Gastos del Mes este cierre'
                  )}{' '}
                  (ajuste de Gastos del Mes de {monthLabel}).
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  Tras este movimiento, tu saldo en Nu debe ser <b>{formatCOP(String(checkpointAfterAdjustment))}</b>.
                </p>
              </div>

              <div className="rounded-lg border border-line p-3 text-sm">
                <p className="text-ink">
                  <b>2.</b> Ingresa <b>{formatCOP(String(nextMonthSavingsToMove))}</b> a tu cajita de Ahorros
                  Conjuntos y guárdalo como "Ahorros de {nextMonthLabel}".
                </p>
                {hasBigExpense && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Ya se descontó el gasto grande de este cierre ({bigExpenseDescription}).
                  </p>
                )}
                <p className="mt-1 text-xs text-ink-muted">
                  Tras este movimiento, tu saldo en Nu debe ser{' '}
                  <b>{formatCOP(String(checkpointAfterNextMonthSavings))}</b>.
                </p>
              </div>

              <div className="rounded-lg bg-cream p-3 text-sm">
                <p className="text-ink">
                  <b>3.</b> El excedente (<b>{formatCOP(String(checkpointAfterNextMonthSavings))}</b>) va a tu cajita
                  de ahorro personal.
                </p>
              </div>

              <p className="text-xs text-ink-faint">Cuando hayas hecho estos movimientos, continúa.</p>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-muted">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => setStep('finalBalance')}
                  className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
                >
                  Continuar
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Calculando…</p>
          ))}

        {step === 'finalBalance' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">Saldo en cajita de Ahorros Conjuntos de Nu, después de mover lo de este cierre:</p>
            <CurrencyInput value={finalBalance} onChange={setFinalBalance} autoFocus />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-muted">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!finalBalance}
                onClick={() => setStep('result')}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {step === 'result' && diff !== undefined && (
          <div className="flex flex-col gap-3">
            {diff === 0 ? (
              <p className="text-sm font-semibold text-success">El saldo cuadra exacto.</p>
            ) : suggestsYield ? (
              <>
                <p className="text-sm text-ink-soft">
                  El saldo real es {formatCOP(String(diff))} mayor al calculado — dentro del margen para registrarlo
                  como Rendimientos.
                </p>
                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <input type="checkbox" checked={acceptYield} onChange={(e) => setAcceptYield(e.target.checked)} />
                  Agregar {formatCOP(String(diff))} como "Rendimientos" para cuadrar el ledger
                </label>
              </>
            ) : (
              <p className="text-sm text-ink-soft">
                Hay una diferencia de {formatCOP(String(Math.abs(diff)))} ({diff > 0 ? 'a favor' : 'en contra'})
                respecto a lo calculado. Revisa manualmente (puedes agregar un movimiento en Ahorros Familiares) — el
                cierre se puede completar igual.
              </p>
            )}
            {closeMineMutation.isError && (
              <p className="text-sm text-danger">
                {closeMineMutation.error instanceof Error ? closeMineMutation.error.message : 'No se pudo cerrar'}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-ink-muted">
                Cancelar
              </button>
              <button
                type="button"
                disabled={closeMineMutation.isPending}
                onClick={() => closeMineMutation.mutate()}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {closeMineMutation.isPending ? 'Cerrando…' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        )}

        {loadingCheck && step === 'check' && <p className="text-xs text-ink-faint">Cargando…</p>}
      </div>
    </div>
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
                    className="w-16 rounded-lg border border-line px-2 py-1 text-right text-sm text-ink disabled:opacity-50"
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
