import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBucket,
  createQuickEntryType,
  createRule,
  deleteRule,
  fetchAppSettings,
  fetchBuckets,
  fetchCategories,
  fetchQuickEntryTypes,
  fetchRules,
  updateAppSettings,
  updateBucket,
  updateQuickEntryType,
  updateRule,
  type Bucket,
  type BucketKind,
  type QuickEntryKind,
  type QuickEntryTypeInput,
  type QuickEntryTypeOption,
  type Rule,
  type RuleMode,
  type RuleSetType,
  type SplitMode,
} from './lib/api';
import { CurrencyInput } from './CurrencyInput';
import NavBar from './NavBar';

const TYPE_LABEL: Record<RuleSetType, string> = { personal: 'Personal', joint: 'Conjunto', movement: 'Movimiento' };
const ORIGIN_LABEL: Record<Rule['createdFrom'], string> = { seed: 'Semilla', user: 'Manual', learned: 'Aprendida' };

const BUCKET_KIND_LABEL: Record<BucketKind, string> = {
  savings: 'Ahorro',
  personal: 'Personal',
  shared_expenses: 'Gasto conjunto',
  other: 'Otro',
};
const SPLIT_MODE_LABEL: Record<SplitMode, string> = { proportional: 'Proporcional al ingreso', half: 'Mitad y mitad' };

const QUICK_ENTRY_KIND_LABEL: Record<QuickEntryKind, string> = {
  personal: 'Personal',
  joint: 'Conjunto',
  movement: 'Movimiento (no entra en los totales)',
};

type DraftRule = { pattern: string; setType: RuleSetType; categoryId: string; mode: RuleMode; setDetail: string };

const EMPTY_DRAFT: DraftRule = { pattern: '', setType: 'joint', categoryId: '', mode: 'auto', setDetail: '' };

type DraftBucket = { name: string; percentage: string; splitMode: SplitMode; kind: BucketKind };
const EMPTY_BUCKET_DRAFT: DraftBucket = { name: '', percentage: '', splitMode: 'proportional', kind: 'other' };

type DraftQuickEntryType = { name: string; kind: QuickEntryKind };
const EMPTY_QUICK_ENTRY_TYPE_DRAFT: DraftQuickEntryType = { name: '', kind: 'personal' };

export default function ConfigurationScreen() {
  const queryClient = useQueryClient();
  const { data: rules } = useQuery({ queryKey: ['rules'], queryFn: fetchRules });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftRule>(EMPTY_DRAFT);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['rules'] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createRule({
        pattern: draft.pattern,
        setType: draft.setType,
        setCategoryId: draft.categoryId || undefined,
        setDetail: draft.setDetail || undefined,
        mode: draft.mode,
      }),
    onSuccess: async () => {
      await invalidate();
      setDraft(EMPTY_DRAFT);
      setShowForm(false);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (rule: Rule) => updateRule(rule.id, { active: !rule.active }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRule(id),
    onSuccess: invalidate,
  });

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4">
        <div>
          <h1 className="text-xl font-extrabold text-ink">Configuración</h1>
          <p className="text-xs text-ink-muted">
            Plantilla de rubros para meses nuevos y reglas de clasificacion. Para ajustar los rubros de
            un mes en particular (ej. Julio) usa &quot;Configurar mes&quot; desde el Dashboard.
          </p>
        </div>

        <GeneralSettingsSection />

        <BucketsSection />

        <QuickEntryTypesSection />

        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-ink">Reglas de clasificacion</h2>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand-hover"
            >
              + Regla
            </button>
          </div>

          {showForm && (
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-line p-4 sm:grid-cols-3">
              <input
                type="text"
                placeholder="Patron (ej. CARULLA)"
                value={draft.pattern}
                onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                className="col-span-2 rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-1"
              />
              <select
                value={draft.setType}
                onChange={(e) => setDraft({ ...draft, setType: e.target.value as RuleSetType })}
                className="rounded-lg border border-line px-3 py-2 text-sm"
              >
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                className="rounded-lg border border-line px-3 py-2 text-sm"
              >
                <option value="">Sin categoria</option>
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <select
                value={draft.mode}
                onChange={(e) => setDraft({ ...draft, mode: e.target.value as RuleMode })}
                className="rounded-lg border border-line px-3 py-2 text-sm"
              >
                <option value="auto">Auto</option>
                <option value="suggest">Sugerir</option>
              </select>
              <input
                type="text"
                placeholder="Detalle (opcional)"
                value={draft.setDetail}
                onChange={(e) => setDraft({ ...draft, setDetail: e.target.value })}
                className="col-span-2 rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-1"
              />
              <button
                type="button"
                disabled={!draft.pattern.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[1.3fr_80px_130px_90px_50px_150px] gap-2 px-1 pb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
                <div>Patron</div>
                <div>Modo</div>
                <div>Tipo → Categoria</div>
                <div>Origen</div>
                <div className="text-right">Hits</div>
                <div />
              </div>
              {rules?.length === 0 && (
                <p className="py-8 text-center text-sm text-ink-muted">
                  Todavia no hay reglas de clasificacion configuradas.
                </p>
              )}
              {rules?.map((rule) => (
                <div
                  key={rule.id}
                  className={`grid grid-cols-[1.3fr_80px_130px_90px_50px_150px] items-center gap-2 border-t border-line px-1 py-2 text-sm ${
                    rule.active ? '' : 'opacity-40'
                  }`}
                >
                  <div className="font-semibold text-ink">{rule.pattern}</div>
                  <div className="text-ink-muted">{rule.mode === 'auto' ? 'Auto' : 'Sugerir'}</div>
                  <div className="text-ink-muted">
                    {TYPE_LABEL[rule.setType]} → {categories?.find((c) => c.id === rule.setCategoryId)?.name ?? '—'}
                  </div>
                  <div className="text-ink-muted">{ORIGIN_LABEL[rule.createdFrom]}</div>
                  <div className="text-right font-bold text-ink">{rule.hitCount}</div>
                  <div className="flex justify-end gap-3 whitespace-nowrap text-xs font-semibold">
                    <button type="button" onClick={() => toggleMutation.mutate(rule)} className="text-ink-muted">
                      {rule.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button type="button" onClick={() => deleteMutation.mutate(rule.id)} className="text-danger">
                      Borrar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function GeneralSettingsSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchAppSettings });

  const [yieldThreshold, setYieldThreshold] = useState('');

  useEffect(() => {
    if (settings) setYieldThreshold(settings.yieldAutoThreshold);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => updateAppSettings({ yieldAutoThreshold: yieldThreshold }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <h2 className="font-bold text-ink">Configuración general</h2>
      <label className="mt-3 flex flex-col gap-1 sm:max-w-xs">
        <span className="text-sm text-ink-soft">
          Umbral para sugerir &quot;Rendimientos&quot; en el cierre de mes
        </span>
        <span className="text-xs text-ink-muted">
          Si la diferencia del saldo real de Nu contra lo calculado es menor o igual a este valor, el
          wizard de cierre ofrece registrarla como rendimientos para cuadrar el ledger.
        </span>
        <div className="mt-1 flex items-center gap-2">
          <CurrencyInput value={yieldThreshold} onChange={setYieldThreshold} />
          <button
            type="button"
            disabled={!yieldThreshold || yieldThreshold === settings?.yieldAutoThreshold || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </label>
    </section>
  );
}

function BucketsSection() {
  const queryClient = useQueryClient();
  const { data: buckets } = useQuery({ queryKey: ['buckets'], queryFn: fetchBuckets });

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftBucket>(EMPTY_BUCKET_DRAFT);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['buckets'] });
  }

  const createMutation = useMutation({
    mutationFn: () => createBucket(draft),
    onSuccess: async () => {
      await invalidate();
      setDraft(EMPTY_BUCKET_DRAFT);
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Bucket> }) => updateBucket(id, input),
    onSuccess: invalidate,
  });

  const activeSum = (buckets ?? []).filter((b) => b.active).reduce((sum, b) => sum + Number(b.percentage), 0);

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-ink">Rubros — configuracion general</h2>
          <p className="text-xs text-ink-muted">Plantilla que se copia al crear cada mes nuevo</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              activeSum === 100 ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
            }`}
          >
            Suman {activeSum}%
          </span>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand-hover"
          >
            + Rubro
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-4 mt-3 grid grid-cols-2 gap-3 rounded-xl border border-line p-4 sm:grid-cols-4">
          <input
            type="text"
            placeholder="Nombre"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="col-span-2 rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-1"
          />
          <input
            type="text"
            inputMode="decimal"
            placeholder="%"
            value={draft.percentage}
            onChange={(e) => setDraft({ ...draft, percentage: e.target.value })}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
          <select
            value={draft.splitMode}
            onChange={(e) => setDraft({ ...draft, splitMode: e.target.value as SplitMode })}
            className="rounded-lg border border-line px-3 py-2 text-sm"
          >
            {Object.entries(SPLIT_MODE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as BucketKind })}
            className="rounded-lg border border-line px-3 py-2 text-sm"
          >
            {Object.entries(BUCKET_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!draft.name.trim() || !draft.percentage || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="col-span-2 rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white disabled:opacity-50 sm:col-span-1"
          >
            Guardar
          </button>
          {createMutation.isError && (
            <p className="col-span-2 text-xs text-danger sm:col-span-4">
              {createMutation.error instanceof Error ? createMutation.error.message : 'No se pudo crear el rubro'}
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-col">
        {buckets?.map((bucket) => (
          <BucketRow key={bucket.id} bucket={bucket} onUpdate={(input) => updateMutation.mutate({ id: bucket.id, input })} />
        ))}
      </div>
    </section>
  );
}

function BucketRow({ bucket, onUpdate }: { bucket: Bucket; onUpdate: (input: Partial<Bucket>) => void }) {
  const [percentage, setPercentage] = useState(bucket.percentage);

  return (
    <div className={`flex items-center justify-between gap-3 border-t border-line py-3 ${bucket.active ? '' : 'opacity-40'}`}>
      <div>
        <div className="text-sm font-semibold text-ink">{bucket.name}</div>
        <div className="text-xs text-ink-muted">
          {SPLIT_MODE_LABEL[bucket.splitMode]} · {BUCKET_KIND_LABEL[bucket.kind]}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            value={percentage}
            onChange={(e) => setPercentage(e.target.value)}
            onBlur={() => percentage !== bucket.percentage && onUpdate({ percentage })}
            className="w-16 rounded-lg border border-line px-2 py-1 text-right text-sm text-ink"
          />
          <span className="text-sm text-ink-muted">%</span>
        </div>
        <button
          type="button"
          onClick={() => onUpdate({ active: !bucket.active })}
          className="text-xs font-semibold text-ink-muted hover:text-brand"
        >
          {bucket.active ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </div>
  );
}

// Tipos configurables de registro rapido (##73): reemplazan el toggle fijo Personal/Conjunto que
// tenia `/r` — los tipos activos aparecen ahi como opciones, en el orden de creacion.
function QuickEntryTypesSection() {
  const queryClient = useQueryClient();
  const { data: quickEntryTypes } = useQuery({ queryKey: ['quickEntryTypes'], queryFn: fetchQuickEntryTypes });

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftQuickEntryType>(EMPTY_QUICK_ENTRY_TYPE_DRAFT);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['quickEntryTypes'] });
  }

  const createMutation = useMutation({
    mutationFn: () => createQuickEntryType(draft),
    onSuccess: async () => {
      await invalidate();
      setDraft(EMPTY_QUICK_ENTRY_TYPE_DRAFT);
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<QuickEntryTypeInput> }) => updateQuickEntryType(id, input),
    onSuccess: invalidate,
  });

  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-ink">Tipos de registro rápido</h2>
          <p className="text-xs text-ink-muted">Los tipos activos aparecen como opciones en el registro rápido (/r)</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white hover:bg-brand-hover"
        >
          + Tipo
        </button>
      </div>

      {showForm && (
        <div className="mb-4 mt-3 grid grid-cols-2 gap-3 rounded-xl border border-line p-4 sm:grid-cols-3">
          <input
            type="text"
            placeholder="Nombre (ej. Ayuda Familia)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="col-span-2 rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-1"
          />
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as QuickEntryKind })}
            className="rounded-lg border border-line px-3 py-2 text-sm"
          >
            {Object.entries(QUICK_ENTRY_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!draft.name.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="col-span-2 rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white disabled:opacity-50 sm:col-span-1"
          >
            Guardar
          </button>
          {createMutation.isError && (
            <p className="col-span-2 text-xs text-danger sm:col-span-3">
              {createMutation.error instanceof Error ? createMutation.error.message : 'No se pudo crear el tipo'}
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-col">
        {quickEntryTypes?.map((type) => (
          <QuickEntryTypeRow
            key={type.id}
            type={type}
            onToggleActive={() => updateMutation.mutate({ id: type.id, input: { active: !type.active } })}
          />
        ))}
      </div>
      {updateMutation.isError && (
        <p className="mt-2 text-xs text-danger">
          {updateMutation.error instanceof Error ? updateMutation.error.message : 'No se pudo actualizar el tipo'}
        </p>
      )}
    </section>
  );
}

function QuickEntryTypeRow({ type, onToggleActive }: { type: QuickEntryTypeOption; onToggleActive: () => void }) {
  return (
    <div className={`flex items-center justify-between gap-3 border-t border-line py-3 ${type.active ? '' : 'opacity-40'}`}>
      <div>
        <div className="text-sm font-semibold text-ink">{type.name}</div>
        <div className="text-xs text-ink-muted">{QUICK_ENTRY_KIND_LABEL[type.kind]}</div>
      </div>
      <button type="button" onClick={onToggleActive} className="text-xs font-semibold text-ink-muted hover:text-brand">
        {type.active ? 'Desactivar' : 'Activar'}
      </button>
    </div>
  );
}
