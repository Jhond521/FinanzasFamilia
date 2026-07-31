import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRule,
  deleteRule,
  fetchCategories,
  fetchRules,
  updateRule,
  type Rule,
  type RuleMode,
  type RuleSetType,
} from './lib/api';
import NavBar from './NavBar';

const TYPE_LABEL: Record<RuleSetType, string> = { personal: 'Personal', joint: 'Conjunto', movement: 'Movimiento' };
const ORIGIN_LABEL: Record<Rule['createdFrom'], string> = { seed: 'Semilla', user: 'Manual', learned: 'Aprendida' };

type DraftRule = { pattern: string; setType: RuleSetType; categoryId: string; mode: RuleMode; setDetail: string };

const EMPTY_DRAFT: DraftRule = { pattern: '', setType: 'joint', categoryId: '', mode: 'auto', setDetail: '' };

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
            Rubros e ingresos se editan desde el Dashboard. Aqui solo se administran las reglas de clasificacion.
          </p>
        </div>

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
                className="col-span-2 rounded-lg border border-line px-3 py-2 text-sm sm:col-span-1"
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
                className="col-span-2 rounded-lg border border-line px-3 py-2 text-sm sm:col-span-1"
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

          <div className="grid grid-cols-[1.3fr_90px_130px_100px_70px_70px] gap-2 px-1 pb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
            <div>Patron</div>
            <div>Modo</div>
            <div>Tipo → Categoria</div>
            <div>Origen</div>
            <div className="text-right">Hits</div>
            <div />
          </div>
          {rules?.map((rule) => (
            <div
              key={rule.id}
              className={`grid grid-cols-[1.3fr_90px_130px_100px_70px_70px] items-center gap-2 border-t border-line px-1 py-2 text-sm ${
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
              <div className="flex justify-end gap-2 text-xs font-semibold">
                <button type="button" onClick={() => toggleMutation.mutate(rule)} className="text-ink-muted">
                  {rule.active ? 'Desactivar' : 'Activar'}
                </button>
                <button type="button" onClick={() => deleteMutation.mutate(rule.id)} className="text-danger">
                  Borrar
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
