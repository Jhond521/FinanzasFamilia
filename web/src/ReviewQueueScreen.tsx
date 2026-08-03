import { useRef, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptRuleSuggestion,
  fetchCategories,
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

export default function ReviewQueueScreen() {
  const { data: months } = useQuery({ queryKey: ['months'], queryFn: fetchMonths });
  const openMonth = months?.find((m) => m.status === 'open') ?? months?.[0];
  const [monthId, setMonthId] = useState<string | undefined>(undefined);
  const selectedMonthId = monthId ?? openMonth?.id;

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

        {months && months.length === 0 && (
          <p className="rounded-2xl border border-line bg-white p-6 text-center text-sm text-ink-muted">
            Todavia no hay meses creados — crea uno desde el Dashboard.
          </p>
        )}

        {selectedMonthId && (
          <>
            <LearningBanner monthId={selectedMonthId} />
            <MatchCandidatesSection monthId={selectedMonthId} />
            <ReviewQueueList monthId={selectedMonthId} />
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

function MatchCandidatesSection({ monthId }: { monthId: string }) {
  const queryClient = useQueryClient();
  const { data: pendingReview } = useQuery({
    queryKey: ['transactions', monthId, { needsReview: true }],
    queryFn: () => fetchTransactions({ monthId, needsReview: true }),
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

  const ambiguous = (pendingReview ?? [])
    .map((tx, i) => ({ tx, candidates: candidateQueries[i]?.data ?? [] }))
    .filter((entry) => entry.candidates.length > 1);

  if (ambiguous.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-bold text-ink">Candidatos de match</h2>
      <p className="mb-3 text-xs text-ink-muted">
        Varios registros rapidos calzan con la misma transaccion. Elige cual va con cual.
      </p>
      <div className="flex flex-col gap-4">
        {ambiguous.map(({ tx, candidates }) => (
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

function ReviewQueueList({ monthId }: { monthId: string }) {
  const queryClient = useQueryClient();
  const { data: transactions } = useQuery({
    queryKey: ['transactions', monthId, { needsReview: true }],
    queryFn: () => fetchTransactions({ monthId, needsReview: true }),
  });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; type: RuleSetType; categoryId: string | null; detail: string | null }) =>
      updateTransaction(input.id, { type: input.type, categoryId: input.categoryId, detail: input.detail }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['months'] }),
      ]);
    },
  });

  if (!transactions || transactions.length === 0) {
    return <p className="text-center text-ink-muted">No hay transacciones pendientes de revision.</p>;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-muted">{transactions.length} pendientes</h2>
      {transactions.map((tx) => (
        <ReviewCard
          key={tx.id}
          transaction={tx}
          categories={categories ?? []}
          ownerName={users?.find((u) => u.id === tx.ownerUserId)?.name}
          onClassify={(type, categoryId, detail) => updateMutation.mutate({ id: tx.id, type, categoryId, detail })}
        />
      ))}
    </section>
  );
}

function ReviewCard({
  transaction,
  categories,
  ownerName,
  onClassify,
}: {
  transaction: Transaction;
  categories: { id: string; name: string }[];
  ownerName?: string;
  onClassify: (type: RuleSetType, categoryId: string | null, detail: string | null) => void;
}) {
  const suggestedCategoryId = transaction.suggestedCategoryId ?? null;
  const [categoryId, setCategoryId] = useState<string | null>(suggestedCategoryId);
  const [detail, setDetail] = useState(transaction.suggestedDetail ?? '');

  const hasConflict = transaction.ruleConflicts.length > 0;

  // Swipe horizontal (izquierda=personal, derecha=conjunto) — RF5. `touch-action: pan-y` deja que
  // el navegador siga scrolleando la pantalla verticalmente (la cola es una lista, no una sola
  // tarjeta como en el mock movil) mientras JS captura el gesto horizontal. Un swipe hacia arriba
  // no es viable aqui sin romper ese scroll vertical nativo, por eso "Movimiento" queda solo con
  // el boton de abajo (RF5 lo pide, pero no hay forma de tener ambos sin una libreria de gestos).
  const SWIPE_THRESHOLD = 80;
  const [dragX, setDragX] = useState(0);
  const dragState = useRef<{ startX: number; startY: number; horizontal: boolean } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragState.current = { startX: e.clientX, startY: e.clientY, horizontal: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = dragState.current;
    if (!state) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (!state.horizontal && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      state.horizontal = true;
    }
    if (state.horizontal) {
      setDragX(dx);
    }
  }

  function endDrag() {
    const state = dragState.current;
    dragState.current = null;
    if (state?.horizontal && Math.abs(dragX) > SWIPE_THRESHOLD) {
      if (dragX < 0) onClassify('personal', categoryId, detail || null);
      else onClassify('joint', categoryId, detail || null);
    }
    setDragX(0);
  }

  return (
    <div
      className="rounded-2xl border border-line bg-white p-5 shadow-sm"
      style={{
        touchAction: 'pan-y',
        transform: dragX ? `translateX(${dragX}px) rotate(${dragX / 30}deg)` : undefined,
        transition: dragX ? 'none' : 'transform 0.2s',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="mb-1 flex items-start justify-between">
        <span className="text-xs font-semibold text-ink-muted">
          {transaction.date} · {ownerName ?? '—'}
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
        className="mb-4 w-full rounded-lg border border-line px-3 py-2 text-sm"
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
