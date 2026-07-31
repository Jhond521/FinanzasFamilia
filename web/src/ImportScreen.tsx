import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bulkConfirmSkippedDuplicates,
  confirmSkippedDuplicate,
  fetchImportBatches,
  fetchImportDuplicates,
  fetchMonths,
  fetchUsers,
  forceSkippedDuplicate,
  undoImportBatch,
  uploadImport,
  type ImportResult,
} from './lib/api';
import { formatCOP, MESES } from './lib/money';
import NavBar from './NavBar';

export default function ImportScreen() {
  const queryClient = useQueryClient();
  const { data: months } = useQuery({ queryKey: ['months'], queryFn: fetchMonths });
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const { data: batches } = useQuery({ queryKey: ['imports'], queryFn: fetchImportBatches });

  const openMonth = months?.find((m) => m.status === 'open') ?? months?.[0];
  const [monthId, setMonthId] = useState<string | undefined>(undefined);
  const selectedMonthId = monthId ?? openMonth?.id;

  const [ownerUserId, setOwnerUserId] = useState<string | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [reviewingBatchId, setReviewingBatchId] = useState<string | null>(null);

  function handleFileChange(selected: File | null) {
    setFile(selected);
    if (selected && users && !ownerUserId) {
      const lower = selected.name.toLowerCase();
      const suggested = users.find((u) => lower.includes(u.name.toLowerCase()));
      if (suggested) setOwnerUserId(suggested.id);
    }
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file || !selectedMonthId || !ownerUserId) throw new Error('Falta archivo, mes o dueño');
      return uploadImport(file, selectedMonthId, ownerUserId);
    },
    onSuccess: async (result) => {
      setLastResult(result);
      setFile(null);
      if (result.duplicatesSkipped > 0) setReviewingBatchId(result.batchId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['imports'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['months'] }),
      ]);
    },
  });

  const undoMutation = useMutation({
    mutationFn: (batchId: string) => undoImportBatch(batchId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['imports'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['months'] }),
      ]);
    },
  });

  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4">
        <h1 className="text-xl font-extrabold text-ink">Importar extracto</h1>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-bold text-ink">Subir extracto Bancolombia</h2>

            <label className="mb-4 flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Mes</span>
              <select
                className="rounded-lg border border-line px-3 py-2 text-sm"
                value={selectedMonthId ?? ''}
                onChange={(e) => setMonthId(e.target.value)}
              >
                {months?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {MESES[m.month - 1]} {m.year}
                  </option>
                ))}
              </select>
            </label>

            <div className="mb-4 flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Dueño del archivo</span>
              <div className="flex gap-2">
                {users?.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setOwnerUserId(u.id)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                      ownerUserId === u.id ? 'border border-brand bg-brand-light text-brand' : 'border border-line text-ink-soft'
                    }`}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>

            <label className="mb-4 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line px-6 py-9 text-center text-sm text-ink-muted">
              <span className="font-semibold text-ink-soft">{file ? file.name : 'Arrastra el .xlsx o haz clic para elegirlo'}</span>
              {!file && <span className="text-xs">Formato Bancolombia: Fecha, Descripción, Referencia, Valor</span>}
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </label>

            {importMutation.isError && (
              <p className="mb-3 text-sm text-danger">
                {importMutation.error instanceof Error ? importMutation.error.message : 'No se pudo importar'}
              </p>
            )}

            <button
              type="button"
              disabled={!file || !selectedMonthId || !ownerUserId || importMutation.isPending}
              onClick={() => importMutation.mutate()}
              className="w-full rounded-xl bg-brand py-3 font-bold text-white transition hover:bg-brand-hover disabled:opacity-50"
            >
              {importMutation.isPending ? 'Importando…' : 'Importar'}
            </button>
          </section>

          <div className="flex flex-col gap-5">
            {lastResult && (
              <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                <h2 className="mb-4 font-bold text-ink">Resultado del último batch</h2>
                <div className="grid grid-cols-2 gap-4">
                  <ResultStat label="importadas" value={lastResult.imported} className="text-success" />
                  <ResultStat label="duplicados omitidos" value={lastResult.duplicatesSkipped} />
                  <ResultStat label="auto-clasificadas" value={lastResult.autoClassified} />
                  <ResultStat label="a revisar" value={lastResult.needsReview} className="text-warning" />
                </div>
                {lastResult.rejectedOutOfMonth > 0 && (
                  <p className="mt-3 rounded-lg bg-warning-light p-2 text-xs font-semibold text-warning">
                    {lastResult.rejectedOutOfMonth} fila(s) rechazadas por tener fecha fuera del mes seleccionado.
                  </p>
                )}
                {lastResult.duplicatesSkipped > 0 && (
                  <button
                    type="button"
                    onClick={() => setReviewingBatchId(lastResult.batchId)}
                    className="mt-3 text-sm font-bold text-brand"
                  >
                    Revisar duplicados →
                  </button>
                )}
              </section>
            )}

            {reviewingBatchId && (
              <DuplicatesReview
                batchId={reviewingBatchId}
                onClose={() => setReviewingBatchId(null)}
              />
            )}

            <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-bold text-ink">Historial de batches</h2>
              <div className="flex flex-col gap-3">
                {batches?.length ? (
                  batches.map((batch) => (
                    <div key={batch.id} className="flex items-center justify-between border-t border-line pt-3 first:border-0 first:pt-0">
                      <div>
                        <div className="text-sm font-bold text-ink">{batch.filename}</div>
                        <div className="text-xs text-ink-muted">
                          {batch.owner?.name ?? '—'} · {batch.importedCount} importadas · {batch.duplicateCount} duplicados
                          {batch.status === 'undone' && <span className="ml-2 text-danger">(deshecho)</span>}
                        </div>
                      </div>
                      {batch.status === 'done' && (
                        <button
                          type="button"
                          onClick={() => undoMutation.mutate(batch.id)}
                          disabled={undoMutation.isPending}
                          className="text-xs font-bold text-danger disabled:opacity-50"
                        >
                          Deshacer
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-ink-muted">Todavia no hay batches importados.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultStat({ label, value, className = 'text-ink' }: { label: string; value: number; className?: string }) {
  return (
    <div>
      <div className={`text-2xl font-extrabold ${className}`}>{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}

function DuplicatesReview({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: groups } = useQuery({
    queryKey: ['imports', batchId, 'duplicates'],
    queryFn: () => fetchImportDuplicates(batchId),
  });

  const totalRows = useMemo(() => groups?.reduce((sum, g) => sum + g.skipped.length, 0) ?? 0, [groups]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['imports', batchId, 'duplicates'] });
  }

  const confirmMutation = useMutation({ mutationFn: confirmSkippedDuplicate, onSuccess: refresh });
  const forceMutation = useMutation({ mutationFn: forceSkippedDuplicate, onSuccess: refresh });
  const bulkConfirmMutation = useMutation({
    mutationFn: () => bulkConfirmSkippedDuplicates(batchId),
    onSuccess: refresh,
  });

  return (
    <section className="rounded-2xl border border-line bg-white p-6 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-bold text-ink">Revisar duplicados</h2>
        <span className="text-xs text-ink-muted">
          {groups?.length ?? 0} tuplas · {totalRows} filas
        </span>
      </div>
      <p className="mb-4 text-xs text-ink-muted">
        Marca las gemelas (compras distintas, mismos datos) para importarlas. Lo no marcado se descarta.
      </p>

      <div className="flex flex-col gap-3">
        {groups?.map((group) => (
          <div key={group.dedupeKey} className="grid grid-cols-2 gap-3 border-t border-line pt-3">
            <div className="rounded-lg bg-cream p-3">
              {group.existing.map((tx) => (
                <div key={tx.id} className="text-xs">
                  <div className="font-semibold text-ink">{tx.bankDescription}</div>
                  <div className="mt-1 font-bold text-ink">{formatCOP(tx.amount)}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {group.skipped.map((row) => (
                <div key={row.id} className="rounded-lg border border-line p-3 text-xs">
                  <div className="font-semibold text-ink">{row.bankDescription}</div>
                  <div className="mt-1 font-bold text-ink">{formatCOP(row.amount)}</div>
                  {row.resolution === 'pending' ? (
                    <div className="mt-2 flex gap-3">
                      <button
                        type="button"
                        onClick={() => forceMutation.mutate(row.id)}
                        className="font-bold text-brand"
                      >
                        Es gemela, agregar
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmMutation.mutate(row.id)}
                        className="font-semibold text-ink-muted"
                      >
                        Es duplicado
                      </button>
                    </div>
                  ) : (
                    <div className={`mt-2 font-bold ${row.resolution === 'forced_twin' ? 'text-brand' : 'text-ink-muted'}`}>
                      {row.resolution === 'forced_twin' ? 'Marcada como gemela · importada' : 'Confirmada como duplicado'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end gap-3">
        <button type="button" onClick={onClose} className="text-sm font-semibold text-ink-muted">
          Cerrar
        </button>
        <button
          type="button"
          onClick={() => bulkConfirmMutation.mutate()}
          disabled={bulkConfirmMutation.isPending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Confirmar todo lo demas como duplicado
        </button>
      </div>
    </section>
  );
}
