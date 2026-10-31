import { useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptRuleSuggestion,
  fetchCategories,
  fetchCurrentUser,
  fetchMatchCandidates,
  fetchMonths,
  fetchRuleSuggestions,
  fetchTransactions,
  fetchUsers,
  matchTransaction,
  updateTransaction,
  type QuickEntry,
  type RuleSetType,
  type Transaction,
} from './lib/api';
import { formatCOP, MESES } from './lib/money';
import NavBar from './NavBar';

const TYPE_LABEL: Record<RuleSetType, string> = { personal: 'Personal', joint: 'Conjunto', movement: 'Movimiento' };

// Hacia donde sale la tarjeta clasificada: la misma direccion que la flecha del boton (##105).
const EXIT_ANIMATION: Record<RuleSetType, string> = {
  personal: 'motion-safe:animate-card-out-left',
  movement: 'motion-safe:animate-card-out-up',
  joint: 'motion-safe:animate-card-out-right',
};
const EXIT_ANIMATION_MS = 300;

export default function ReviewQueueScreen() {
  const { data: months } = useQuery({ queryKey: ['months'], queryFn: fetchMonths });
  const openMonth = months?.find((m) => m.status === 'open') ?? months?.[0];
  const [monthId, setMonthId] = useState<string | undefined>(undefined);
  const selectedMonthId = monthId ?? openMonth?.id;

  const { data: currentUser } = useQuery({ queryKey: ['auth', 'me'], queryFn: fetchCurrentUser });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const otherUser = users?.find((u) => u.id !== currentUser?.id);
  const [ownerFilter, setOwnerFilter] = useState<string | undefined>(undefined);
  const selectedOwnerFilter = ownerFilter ?? currentUser?.id;
  const ownerUserId = selectedOwnerFilter === 'all' ? undefined : selectedOwnerFilter;

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-ink">Revisar</h1>
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

        {currentUser && (
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
        )}

        {months && months.length === 0 && (
          <p className="rounded-2xl border border-line bg-white p-6 text-center text-sm text-ink-muted">
            Todavia no hay meses creados — crea uno desde el Dashboard.
          </p>
        )}

        {selectedMonthId && (
          <>
            <LearningBanner monthId={selectedMonthId} />
            <MatchCandidatesSection monthId={selectedMonthId} ownerUserId={ownerUserId} />
            <ReviewQueueList monthId={selectedMonthId} ownerUserId={ownerUserId} />
          </>
        )}
      </div>
    </div>
  );
}

function LearningBanner({ monthId }: { monthId: string }) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { data: suggestions } = useQuery({
    queryKey: ['rules', 'suggestions', monthId],
    queryFn: () => fetchRuleSuggestions(monthId),
  });

  const acceptMutation = useMutation({
    mutationFn: acceptRuleSuggestion,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['rules'] }),
        queryClient.invalidateQueries({ queryKey: ['rules', 'suggestions', monthId] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      ]);
    },
  });

  const suggestion = suggestions?.find((s) => !dismissed.has(s.pattern));
  if (!suggestion) return null;

  return (
    <div className="rounded-xl bg-brand-light p-4 text-sm text-brand">
      Has marcado <b>&quot;{suggestion.pattern}&quot;</b> como {TYPE_LABEL[suggestion.setType]} {suggestion.count} veces.
      ¿Creo la regla?
      {acceptMutation.isError && (
        <p className="mt-2 font-semibold text-danger">
          {acceptMutation.error instanceof Error ? acceptMutation.error.message : 'No se pudo crear la regla'}
        </p>
      )}
      <div className="mt-2 flex gap-4 font-bold">
        <button type="button" onClick={() => acceptMutation.mutate({ ...suggestion, monthId })}>
          Si, crear
        </button>
        <button
          type="button"
          className="text-brand/60"
          onClick={() => setDismissed((prev) => new Set(prev).add(suggestion.pattern))}
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}

function MatchCandidatesSection({ monthId, ownerUserId }: { monthId: string; ownerUserId?: string }) {
  const queryClient = useQueryClient();
  const { data: pendingReview } = useQuery({
    queryKey: ['transactions', monthId, { needsReview: true, ownerUserId }],
    queryFn: () => fetchTransactions({ monthId, needsReview: true, ownerUserId }),
  });

  const candidateQueries = useQueries({
    queries: (pendingReview ?? []).map((tx) => ({
      queryKey: ['transactions', tx.id, 'match-candidates'],
      queryFn: () => fetchMatchCandidates(tx.id),
      enabled: Boolean(pendingReview),
    })),
  });

  const matchMutation = useMutation({
    mutationFn: ({ transactionId, quickEntryId }: { transactionId: string; quickEntryId: string }) =>
      matchTransaction(transactionId, quickEntryId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['quickEntries'] }),
        queryClient.invalidateQueries({ queryKey: ['months'] }),
      ]);
    },
  });

  // Basta con un candidato (no >1, ticket #95): al resolver una ambiguedad entre varias
  // transacciones del mismo monto, la siguiente queda con un unico registro rapido pendiente y,
  // si se filtrara, no habria otro lugar de la UI para confirmar ese match.
  const withCandidates = (pendingReview ?? [])
    .map((tx, i) => ({ tx, candidates: candidateQueries[i]?.data ?? [] }))
    .filter((entry) => entry.candidates.length > 0);

  if (withCandidates.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-bold text-ink">Candidatos de match</h2>
      <p className="mb-3 text-xs text-ink-muted">
        Estos registros rapidos calzan con transacciones pendientes. Elige cual va con cual.
      </p>
      <div className="flex flex-col gap-4">
        {withCandidates.map(({ tx, candidates }) => (
          <div key={tx.id} className="border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-ink">{tx.bankDescription}</span>
              <span className="font-bold text-ink">{formatCOP(tx.amount)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {candidates.map((entry: QuickEntry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => matchMutation.mutate({ transactionId: tx.id, quickEntryId: entry.id })}
                  disabled={matchMutation.isPending}
                  className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  {entry.description} · {entry.date}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewQueueList({ monthId, ownerUserId }: { monthId: string; ownerUserId?: string }) {
  const queryClient = useQueryClient();
  const { data: transactions } = useQuery({
    queryKey: ['transactions', monthId, { needsReview: true, ownerUserId }],
    queryFn: () => fetchTransactions({ monthId, needsReview: true, ownerUserId }),
  });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  // El toast dice QUE transaccion se clasifico (no solo el tipo) para que no se confunda con la
  // nueva tarjeta de arriba (##105).
  const [toast, setToast] = useState<{ type: RuleSetType; description: string; amount: string } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(type: RuleSetType, tx: Transaction) {
    setToast({ type, description: tx.bankDescription, amount: tx.amount });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3500);
  }

  // Sin el gesto de swipe (ticket #84) no hay ninguna senal visual de "esto ya se fue" hasta que la
  // query se re-invalida; se oculta la tarjeta clasificada de inmediato en vez de esperar el
  // round-trip al servidor, y se revierte si la mutacion falla.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // Tarjetas que estan animando su salida (##105): siguen en la lista hasta que termina la
  // animacion y recien ahi pasan a hiddenIds. Con timeout (no animationend) para que tambien
  // funcione con prefers-reduced-motion, donde no hay animacion.
  const [leaving, setLeaving] = useState<Map<string, RuleSetType>>(new Map());
  // Tras la primera clasificacion, la nueva tarjeta de arriba se marca como "Siguiente".
  const [hasClassified, setHasClassified] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; type: RuleSetType; categoryId: string | null; detail: string | null }) =>
      updateTransaction(input.id, { type: input.type, categoryId: input.categoryId, detail: input.detail }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['months'] }),
      ]);
    },
    onError: (_err, variables) => {
      setLeaving((prev) => {
        const next = new Map(prev);
        next.delete(variables.id);
        return next;
      });
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
    },
  });

  const visibleTransactions = transactions?.filter((tx) => !hiddenIds.has(tx.id)) ?? [];

  if (!transactions || visibleTransactions.length === 0) {
    return <p className="text-center text-ink-muted">No hay transacciones pendientes de revision.</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
        {visibleTransactions.length} pendientes
      </h2>
      {visibleTransactions.map((tx, i) => (
        <ReviewCard
          // La tarjeta que pasa a ser la primera de la cola cambia de key (top-<id> vs <id>) para
          // forzar un remount y que la animacion de entrada se note — sin esto, React reutiliza el
          // mismo nodo DOM y la siguiente transaccion aparece de golpe (motivo del ticket #23).
          key={i === 0 ? `top-${tx.id}` : tx.id}
          transaction={tx}
          categories={categories ?? []}
          ownerName={users?.find((u) => u.id === tx.ownerUserId)?.name}
          leavingAs={leaving.get(tx.id)}
          isNext={i === 0 && hasClassified && !leaving.has(tx.id)}
          onClassify={(type, categoryId, detail) => {
            if (leaving.has(tx.id)) return;
            showToast(type, tx);
            setHasClassified(true);
            setLeaving((prev) => new Map(prev).set(tx.id, type));
            setTimeout(() => {
              setLeaving((prev) => {
                const next = new Map(prev);
                next.delete(tx.id);
                return next;
              });
              setHiddenIds((prev) => new Set(prev).add(tx.id));
            }, EXIT_ANIMATION_MS);
            updateMutation.mutate({ id: tx.id, type, categoryId, detail });
          }}
        />
      ))}
      {toast && (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="animate-toast-in flex w-full max-w-sm items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-xl">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-base font-bold"
            >
              ✓
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold">Clasificada como {TYPE_LABEL[toast.type]}</div>
              <div className="truncate text-xs text-white/80">
                {toast.description} · {formatCOP(toast.amount)}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewCard({
  transaction,
  categories,
  ownerName,
  leavingAs,
  isNext,
  onClassify,
}: {
  transaction: Transaction;
  categories: { id: string; name: string }[];
  ownerName?: string;
  /** Si esta definido, la tarjeta ya se clasifico y esta animando su salida (##105). */
  leavingAs?: RuleSetType;
  /** Nueva primera tarjeta tras clasificar otra: entrada mas notoria + etiqueta "Siguiente" (##105). */
  isNext: boolean;
  onClassify: (type: RuleSetType, categoryId: string | null, detail: string | null) => void;
}) {
  const suggestedCategoryId = transaction.suggestedCategoryId ?? null;
  const [categoryId, setCategoryId] = useState<string | null>(suggestedCategoryId);
  const [detail, setDetail] = useState(transaction.suggestedDetail ?? '');

  const hasConflict = transaction.ruleConflicts.length > 0;

  return (
    <div
      aria-hidden={leavingAs ? true : undefined}
      className={`rounded-2xl border border-line bg-white p-5 shadow-sm ${
        leavingAs
          ? `pointer-events-none ${EXIT_ANIMATION[leavingAs]}`
          : isNext
            ? 'ring-brand motion-safe:animate-card-in-next'
            : 'motion-safe:animate-card-in'
      }`}
    >
      {isNext && (
        <span className="mb-2 inline-block rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-bold text-brand motion-safe:animate-badge-fade">
          Siguiente
        </span>
      )}
      <div className="mb-1 flex items-start justify-between">
        <span className="text-xs font-semibold text-ink-muted">
          {transaction.date}
          {transaction.bankTime ? ` ${transaction.bankTime}` : ''} · {ownerName ?? '—'}
        </span>
        <span className="text-lg font-extrabold text-ink">{formatCOP(transaction.amount)}</span>
      </div>
      <div className="mb-1 font-bold text-ink">{transaction.bankDescription}</div>
      <div className="mb-3 text-xs text-ink-muted">Descripcion del banco, textual</div>

      {hasConflict && (
        <div className="mb-3 flex flex-wrap gap-2">
          {transaction.ruleConflicts.map((rule) => (
            <button
              key={rule.id}
              type="button"
              onClick={() => setCategoryId(rule.setCategoryId)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                categoryId === rule.setCategoryId ? 'bg-brand-light text-brand' : 'border border-line text-ink-muted'
              }`}
            >
              {TYPE_LABEL[rule.setType]} · {categories.find((c) => c.id === rule.setCategoryId)?.name ?? '—'}
            </button>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryId(cat.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              categoryId === cat.id ? 'bg-brand-light text-brand' : 'border border-line text-ink-muted'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="Detalle (opcional)…"
        className="mb-4 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
      />

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onClassify('personal', categoryId, detail || null)}
          className="flex min-h-11 items-center justify-center rounded-lg border border-line py-2 text-xs font-bold text-ink-soft hover:border-brand hover:text-brand"
        >
          ← Personal
        </button>
        <button
          type="button"
          onClick={() => onClassify('movement', null, detail || null)}
          className="flex min-h-11 items-center justify-center rounded-lg border border-line py-2 text-xs font-bold text-ink-soft hover:border-brand hover:text-brand"
        >
          ↑ Movimiento
        </button>
        <button
          type="button"
          onClick={() => onClassify('joint', categoryId, detail || null)}
          className="flex min-h-11 items-center justify-center rounded-lg bg-brand py-2 text-xs font-bold text-white hover:bg-brand-hover"
        >
          Conjunto →
        </button>
      </div>
    </div>
  );
}
