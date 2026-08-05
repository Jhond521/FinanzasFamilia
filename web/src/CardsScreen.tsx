import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCardItem,
  deleteCardItem,
  fetchCardMonth,
  fetchCards,
  fetchMonths,
  importNuStatement,
  updateCardItem,
  updateCardMonthAmountPaid,
  type CardItemInput,
  type CardItemType,
  type ParsedNuRow,
} from './lib/api';
import { CurrencyInput } from './CurrencyInput';
import { formatCOP, MESES } from './lib/money';
import NavBar from './NavBar';

const DIFF_STYLES: Record<string, { bar: string; text: string; barBg: string }> = {
  matched: { bar: 'bg-success', barBg: 'bg-success-light', text: 'text-success' },
  short: { bar: 'bg-warning', barBg: 'bg-warning-light', text: 'text-warning' },
  over: { bar: 'bg-danger', barBg: 'bg-danger-light', text: 'text-danger' },
};

export default function CardsScreen() {
  const queryClient = useQueryClient();
  const { data: cards } = useQuery({ queryKey: ['cards'], queryFn: fetchCards });
  const { data: months } = useQuery({ queryKey: ['months'], queryFn: fetchMonths });

  const openMonth = months?.find((m) => m.status === 'open') ?? months?.[0];
  const [monthId, setMonthId] = useState<string | undefined>(undefined);
  const selectedMonthId = monthId ?? openMonth?.id;

  const [cardId, setCardId] = useState<string | undefined>(undefined);
  const selectedCardId = cardId ?? cards?.[0]?.id;

  const { data: detail } = useQuery({
    queryKey: ['cardMonth', selectedCardId, selectedMonthId],
    queryFn: () => fetchCardMonth(selectedCardId!, selectedMonthId!),
    enabled: Boolean(selectedCardId && selectedMonthId),
  });

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['cardMonth', selectedCardId, selectedMonthId] });
  }

  const [amountPaid, setAmountPaid] = useState('');
  useEffect(() => {
    setAmountPaid(detail?.cardMonth.amountPaid ?? '');
  }, [detail?.cardMonth.id, detail?.cardMonth.amountPaid]);

  const amountPaidMutation = useMutation({
    mutationFn: (value: string) => updateCardMonthAmountPaid(detail!.cardMonth.id, value),
    onSuccess: invalidate,
  });

  const [showItemForm, setShowItemForm] = useState<'item' | 'adjustment' | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [previewRows, setPreviewRows] = useState<(ParsedNuRow & { type: CardItemType })[]>([]);

  const createItemMutation = useMutation({
    mutationFn: (input: CardItemInput) => createCardItem(detail!.cardMonth.id, input),
    onSuccess: invalidate,
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CardItemInput> }) => updateCardItem(id, input),
    onSuccess: invalidate,
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => deleteCardItem(id),
    onSuccess: invalidate,
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => importNuStatement(detail!.cardMonth.id, file),
    onSuccess: (rows) => {
      setPreviewRows(rows.map((row) => ({ ...row, type: 'personal' })));
      setShowImport(true);
    },
  });

  const diffStyle = detail ? DIFF_STYLES[detail.diffStatus] : DIFF_STYLES.short;
  const progressPct = detail && Number(detail.cardMonth.amountPaid) > 0
    ? Math.min(100, (Number(detail.itemsTotal) / Number(detail.cardMonth.amountPaid)) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold text-ink">Tarjetas</h1>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
              value={selectedCardId ?? ''}
              onChange={(e) => setCardId(e.target.value)}
            >
              {cards?.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} · {card.owner?.name ?? '—'}
                </option>
              ))}
            </select>
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
        </div>
        <p className="text-xs text-ink-muted">Módulo independiente — no afecta las bolsas del mes.</p>

        {months && months.length === 0 && (
          <p className="rounded-2xl border border-line bg-white p-6 text-center text-sm text-ink-muted">
            Todavia no hay meses creados — crea uno desde el Dashboard.
          </p>
        )}

        {months && months.length > 0 && cards && cards.length === 0 && (
          <p className="rounded-2xl border border-line bg-white p-6 text-center text-sm text-ink-muted">
            Todavia no hay tarjetas configuradas.
          </p>
        )}

        {detail && (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
              <div className="mb-4 text-xs font-bold uppercase tracking-wide text-ink-muted">Monto pagado</div>
              <CurrencyInput
                value={amountPaid}
                onChange={setAmountPaid}
                onBlur={() => amountPaid !== detail.cardMonth.amountPaid && amountPaidMutation.mutate(amountPaid)}
                className="mb-4 w-full text-2xl"
                ariaLabel="Monto pagado"
              />
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-ink-muted">Σ items registrados</span>
                <b className="text-ink">{formatCOP(detail.itemsTotal)}</b>
              </div>
              <div className={`mb-2 h-2 overflow-hidden rounded-full ${diffStyle.barBg}`}>
                <div className={`h-full rounded-full ${diffStyle.bar}`} style={{ width: `${progressPct}%` }} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">Diferencia</span>
                <b className={diffStyle.text}>{formatCOP(detail.diff)}</b>
              </div>
              {detail.diffStatus === 'over' && (
                <p className="mt-2 rounded-lg bg-danger-light p-2 text-xs font-semibold text-danger">
                  Se registró de más — ajusta o corrige items hasta que la diferencia llegue a $0.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
              <div className="mb-4 font-bold text-ink">Resumen del mes</div>
              <div className="mb-4 flex gap-8">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-xs text-ink-muted">
                    <span className="h-2 w-2 rounded-full bg-brand" /> Personal
                  </div>
                  <div className="text-xl font-extrabold text-ink">{formatCOP(detail.split.personal)}</div>
                </div>
                <div className="w-px bg-line" />
                <div>
                  <div className="mb-1 flex items-center gap-2 text-xs text-ink-muted">
                    <span className="h-2 w-2 rounded-full bg-ink-faint" /> Conjunto
                  </div>
                  <div className="text-xl font-extrabold text-ink">{formatCOP(detail.split.joint)}</div>
                </div>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-cream-surface">
                <div className="bg-brand" style={{ width: `${detail.split.personalPercentage}%` }} />
                <div className="bg-ink-faint" style={{ width: `${detail.split.jointPercentage}%` }} />
              </div>
            </section>
          </div>
        )}

        {detail && (
          <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-ink">Items registrados</h2>
              <div className="flex gap-2">
                <label className="cursor-pointer rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-muted">
                  Subir extracto Nu
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importMutation.mutate(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setShowItemForm('adjustment')}
                  className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-muted"
                >
                  + Ajuste
                </button>
                <button
                  type="button"
                  onClick={() => setShowItemForm('item')}
                  className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand-hover"
                >
                  + Item
                </button>
              </div>
            </div>

            <CardQuickAddRow onSave={(input) => createItemMutation.mutateAsync(input).then(() => undefined)} />

            {showItemForm && (
              <ItemForm
                isAdjustment={showItemForm === 'adjustment'}
                onCancel={() => setShowItemForm(null)}
                onSave={(input) => {
                  createItemMutation.mutate(input);
                  setShowItemForm(null);
                }}
              />
            )}

            {showImport && (
              <div className="mb-4 rounded-xl border border-line p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink">Revisar items del extracto ({previewRows.length})</h3>
                  <button type="button" onClick={() => setShowImport(false)} className="text-xs font-semibold text-ink-muted">
                    Cerrar
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {previewRows.map((row, index) => (
                    <div key={index} className="grid grid-cols-[100px_1fr_120px_100px_60px] items-center gap-2 text-xs">
                      <input
                        type="text"
                        value={row.date}
                        onChange={(e) =>
                          setPreviewRows((prev) => prev.map((r, i) => (i === index ? { ...r, date: e.target.value } : r)))
                        }
                        className="rounded border border-line px-2 py-1 text-ink"
                      />
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) =>
                          setPreviewRows((prev) => prev.map((r, i) => (i === index ? { ...r, description: e.target.value } : r)))
                        }
                        className="rounded border border-line px-2 py-1 text-ink"
                      />
                      <input
                        type="text"
                        value={row.amount}
                        onChange={(e) =>
                          setPreviewRows((prev) => prev.map((r, i) => (i === index ? { ...r, amount: e.target.value } : r)))
                        }
                        className="rounded border border-line px-2 py-1 text-right text-ink"
                      />
                      <select
                        value={row.type}
                        onChange={(e) =>
                          setPreviewRows((prev) =>
                            prev.map((r, i) => (i === index ? { ...r, type: e.target.value as CardItemType } : r)),
                          )
                        }
                        className="rounded border border-line px-2 py-1"
                      >
                        <option value="personal">Personal</option>
                        <option value="joint">Conjunto</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setPreviewRows((prev) => prev.filter((_, i) => i !== index))}
                        className="font-semibold text-danger"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={previewRows.length === 0}
                  onClick={async () => {
                    for (const row of previewRows) {
                      await createItemMutation.mutateAsync({
                        description: row.description,
                        date: row.date,
                        amount: row.amount,
                        type: row.type,
                      });
                    }
                    setPreviewRows([]);
                    setShowImport(false);
                  }}
                  className="mt-3 rounded-lg bg-brand px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  Guardar {previewRows.length} items
                </button>
              </div>
            )}

            <div className="flex flex-col">
              {detail.items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[90px_1fr_90px_90px_64px] items-center gap-2 border-t border-line py-3 text-sm first:border-0"
                >
                  <div className="text-ink-muted">{item.date ?? '—'}</div>
                  <div className="font-semibold text-ink">
                    {item.description}
                    {item.isAdjustment && <span className="ml-2 text-xs font-normal text-ink-faint">(ajuste)</span>}
                  </div>
                  <select
                    value={item.type}
                    onChange={(e) => updateItemMutation.mutate({ id: item.id, input: { type: e.target.value as CardItemType } })}
                    className="rounded border border-line bg-white px-2 py-1 text-xs"
                  >
                    <option value="personal">Personal</option>
                    <option value="joint">Conjunto</option>
                  </select>
                  <div className="text-right font-bold text-ink">{formatCOP(item.amount)}</div>
                  <button
                    type="button"
                    onClick={() => deleteItemMutation.mutate(item.id)}
                    className="justify-self-end text-xs font-semibold text-danger"
                  >
                    Borrar
                  </button>
                </div>
              ))}
              {detail.items.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">Sin items todavia.</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Fila de captura rápida (ticket #60): permite agregar items de tarjeta seguidos usando solo el
 * teclado — Tab entre campos (orden nativo del DOM), Enter en "Tipo" guarda y vuelve a enfocar
 * "Fecha" de una fila vacía nueva, sin soltar el teclado. Coexiste con `ItemForm` (botón "+ Item")
 * para cuando se prefiere el formulario de un solo item. */
function CardQuickAddRow({ onSave }: { onSave: (input: CardItemInput) => Promise<void> }) {
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<CardItemType>('personal');
  const [error, setError] = useState<string | null>(null);

  const dateRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  // Guarda contra doble-submit sin usar `disabled`: deshabilitar los campos mientras se guarda le
  // quita el foco al elemento (un input disabled no puede tener foco) y rompe el auto-focus de
  // vuelta a "Fecha" al terminar — ver hallazgo de prueba manual del ticket #60.
  const savingRef = useRef(false);

  async function trySave() {
    if (savingRef.current) return;
    setError(null);
    if (!description.trim()) {
      setError('La descripción es obligatoria');
      descRef.current?.focus();
      return;
    }
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) === 0) {
      setError('El monto no puede ser cero');
      amountRef.current?.focus();
      return;
    }
    savingRef.current = true;
    try {
      await onSave({ description: description.trim(), amount, type, date: date || undefined });
      setDate('');
      setDescription('');
      setAmount('');
      setType('personal');
      dateRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el item');
    } finally {
      savingRef.current = false;
    }
  }

  function handleFieldKeyDown(
    e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    field: 'date' | 'description' | 'amount' | 'type',
  ) {
    // Un <input type="date"> nativo le da su propio significado a Tab: mueve el foco entre sus
    // segmentos internos (mes/día/año) antes de salir del control. Interceptamos Tab (además de
    // Enter) para que "Fecha" siga contando como un solo campo en la navegación de la fila.
    const isForwardTab = e.key === 'Tab' && !e.shiftKey;
    if (e.key !== 'Enter' && !isForwardTab) return;
    if (field === 'date') {
      e.preventDefault();
      descRef.current?.focus();
    } else if (field === 'description') {
      e.preventDefault();
      amountRef.current?.focus();
    } else if (field === 'amount') {
      e.preventDefault();
      typeRef.current?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void trySave();
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-dashed border-line p-3">
      <div className="mb-2 hidden grid-cols-[110px_1fr_130px_110px] gap-2 text-xs font-bold uppercase tracking-wide text-ink-muted sm:grid">
        <span>Fecha</span>
        <span>Descripción</span>
        <span>Monto</span>
        <span>Tipo</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[110px_1fr_130px_110px]">
        <input
          ref={dateRef}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={(e) => handleFieldKeyDown(e, 'date')}
          className="col-span-2 min-w-0 rounded-lg border border-line px-2 py-2 text-sm text-ink sm:col-span-1"
        />
        <input
          ref={descRef}
          type="text"
          placeholder="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => handleFieldKeyDown(e, 'description')}
          className="col-span-2 min-w-0 rounded-lg border border-line px-2 py-2 text-sm text-ink sm:col-span-1"
        />
        {/* CurrencyInput no expone su div envolvente a className: sin este wrapper con min-w-0,
            el ancho de contenido del input (mayor al de la columna fija de 130px) hace que se
            salga de su celda de grid y tape la columna de "Tipo" — el bug de "grid blowout". */}
        <div className="min-w-0">
          <CurrencyInput
            ref={amountRef}
            value={amount}
            onChange={setAmount}
            onKeyDown={(e) => handleFieldKeyDown(e, 'amount')}
            allowNegative
            className="w-full text-sm"
            ariaLabel="Monto del item (captura rápida)"
          />
        </div>
        <select
          ref={typeRef}
          value={type}
          onChange={(e) => setType(e.target.value as CardItemType)}
          onKeyDown={(e) => handleFieldKeyDown(e, 'type')}
          className="min-w-0 rounded-lg border border-line px-2 py-2 text-sm"
        >
          <option value="personal">Personal</option>
          <option value="joint">Conjunto</option>
        </select>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <p className="mt-2 text-xs text-ink-muted">
        Tab para moverte entre campos · Enter en "Tipo" guarda y sigue con la siguiente compra.
      </p>
    </div>
  );
}

function ItemForm({
  isAdjustment,
  onSave,
  onCancel,
}: {
  isAdjustment: boolean;
  onSave: (input: CardItemInput) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(isAdjustment ? 'Ajuste' : '');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<CardItemType>('personal');
  const [date, setDate] = useState('');

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-line p-4 sm:grid-cols-4">
      <input
        type="text"
        placeholder="Descripción"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="col-span-2 rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-1"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-line px-3 py-2 text-sm"
      />
      <CurrencyInput
        value={amount}
        onChange={setAmount}
        allowNegative
        className="rounded-lg border border-line px-3 py-2 text-sm"
        ariaLabel="Monto del item"
      />
      <select value={type} onChange={(e) => setType(e.target.value as CardItemType)} className="rounded-lg border border-line px-3 py-2 text-sm">
        <option value="personal">Personal</option>
        <option value="joint">Conjunto</option>
      </select>
      <p className="col-span-2 -mt-1 text-xs text-ink-muted sm:col-span-4">
        Usa un monto negativo para devoluciones, cancelaciones o ajustes que restan.
      </p>
      <div className="col-span-2 flex gap-2 sm:col-span-4">
        <button
          type="button"
          disabled={!description.trim() || !amount || Number.isNaN(Number(amount)) || Number(amount) === 0}
          onClick={() => onSave({ description, amount, type, date: date || undefined, isAdjustment })}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Guardar
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-muted">
          Cancelar
        </button>
      </div>
    </div>
  );
}
