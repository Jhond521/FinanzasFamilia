export function buildApiUrl(path: string): string {
  return `/api${path.startsWith('/') ? path : `/${path}`}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    headers: init?.body && !isFormData ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Error de red (${response.status})`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(buildApiUrl('/auth/me'), { credentials: 'include' });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`No se pudo obtener el usuario actual (${response.status})`);
  }
  const body = (await response.json()) as { user: CurrentUser };
  return body.user;
}

export type User = { id: string; name: string; email: string };

export async function fetchUsers(): Promise<User[]> {
  const body = await apiFetch<{ users: User[] }>('/users');
  return body.users;
}

export type MonthSummary = { id: string; year: number; month: number; status: 'open' | 'closed'; totalIncome: string };

export async function fetchMonths(): Promise<MonthSummary[]> {
  const body = await apiFetch<{ months: MonthSummary[] }>('/months');
  return body.months;
}

export async function createMonth(year: number, month: number): Promise<{ id: string }> {
  const body = await apiFetch<{ month: { id: string } }>('/months', {
    method: 'POST',
    body: JSON.stringify({ year, month }),
  });
  return body.month;
}

export type Income = { id: string; monthId: string; userId: string; label: string; amount: string };

export async function replaceMonthIncomes(
  monthId: string,
  incomes: { userId: string; label: string; amount: string }[],
): Promise<Income[]> {
  const body = await apiFetch<{ incomes: Income[] }>(`/months/${monthId}/incomes`, {
    method: 'PUT',
    body: JSON.stringify(incomes),
  });
  return body.incomes;
}

export type BucketKind = 'savings' | 'personal' | 'shared_expenses' | 'other';
export type SplitMode = 'proportional' | 'half';

export type MonthBucketSummary = {
  id: string;
  name: string;
  kind: BucketKind;
  splitMode: SplitMode;
  percentage: string;
  budget: string;
  spent: string;
  available: string;
  contributions: { userId: string; amount: string; spent?: string }[];
};

export type MonthDetail = {
  month: { id: string; year: number; month: number; status: 'open' | 'closed' };
  incomes: Income[];
  monthBuckets: { id: string; name: string; percentage: string; splitMode: SplitMode; kind: BucketKind; active: boolean }[];
};

export async function fetchMonthDetail(monthId: string): Promise<MonthDetail> {
  return apiFetch<MonthDetail>(`/months/${monthId}`);
}

// ---- Rubros (buckets) — config general (Fase 1, sin cliente hasta el ticket #12) ----

export type Bucket = {
  id: string;
  name: string;
  percentage: string;
  splitMode: SplitMode;
  kind: BucketKind;
  active: boolean;
  sortOrder: number;
};

export async function fetchBuckets(): Promise<Bucket[]> {
  const body = await apiFetch<{ buckets: Bucket[] }>('/buckets');
  return body.buckets;
}

export type BucketInput = {
  name: string;
  percentage: string;
  splitMode: SplitMode;
  kind: BucketKind;
  active?: boolean;
};

export async function createBucket(input: BucketInput): Promise<Bucket> {
  const body = await apiFetch<{ bucket: Bucket }>('/buckets', { method: 'POST', body: JSON.stringify(input) });
  return body.bucket;
}

export async function updateBucket(id: string, input: Partial<BucketInput>): Promise<Bucket> {
  const body = await apiFetch<{ bucket: Bucket }>(`/buckets/${id}`, { method: 'PUT', body: JSON.stringify(input) });
  return body.bucket;
}

// ---- Snapshot de rubros del mes (editable mientras el mes este abierto) ----

export type MonthBucketInput = {
  id?: string;
  name: string;
  percentage: string;
  splitMode: SplitMode;
  kind: BucketKind;
  active: boolean;
};

export async function replaceMonthBuckets(
  monthId: string,
  buckets: MonthBucketInput[],
): Promise<MonthDetail['monthBuckets']> {
  const body = await apiFetch<{ monthBuckets: MonthDetail['monthBuckets'] }>(`/months/${monthId}/buckets`, {
    method: 'PUT',
    body: JSON.stringify(buckets),
  });
  return body.monthBuckets;
}

export type MonthCloseInfo = {
  sharedExpensesExcess: string;
  perPerson: { userId: string; realSavings: string; leaveInAccount: string; sharedExpensesDelta: string }[];
};

export type MonthSummaryDetail = {
  month: { id: string; year: number; month: number; status: 'open' | 'closed' };
  totalIncome: string;
  buckets: MonthBucketSummary[];
  close: MonthCloseInfo;
};

export async function fetchMonthSummary(monthId: string): Promise<MonthSummaryDetail> {
  return apiFetch<MonthSummaryDetail>(`/months/${monthId}/summary`);
}

// ---- Cierre de mes individual por persona (ticket #34) ----

export type MonthClosure = {
  id: string;
  monthId: string;
  userId: string;
  action: 'closed' | 'reopened';
  createdAt: string;
};

export async function fetchLatestClosure(monthId: string, userId: string): Promise<MonthClosure | null> {
  const body = await apiFetch<{ closure: MonthClosure | null }>(
    `/months/${monthId}/closures/latest?userId=${userId}`,
  );
  return body.closure;
}

export async function closeMine(
  monthId: string,
  userId: string,
  extra?: { bigExpenseAmount?: string; bigExpenseDescription?: string; yieldAmount?: string },
): Promise<{ closure: MonthClosure; month: MonthDetail['month']; summary?: MonthSummaryDetail }> {
  return apiFetch(`/months/${monthId}/close-mine`, {
    method: 'POST',
    body: JSON.stringify({ userId, ...extra }),
  });
}

export async function reopenMine(
  monthId: string,
  userId: string,
): Promise<{ closure: MonthClosure; month: MonthDetail['month'] }> {
  return apiFetch(`/months/${monthId}/reopen-mine`, { method: 'POST', body: JSON.stringify({ userId }) });
}

// ---- Proceso de cierre refinado (ticket #36) ----

export type CloseCheck = {
  unclassifiedCount: number;
  nextMonthExists: boolean;
  nextMonthId: string | null;
  nextMonthOpeningDone: boolean;
};

export async function fetchCloseCheck(monthId: string, userId: string): Promise<CloseCheck> {
  return apiFetch(`/months/${monthId}/close-check?userId=${userId}`);
}

export type ClosePreview = {
  monthlySavingsBudget: string;
  adjustment: string;
};

export async function fetchClosePreview(monthId: string, userId: string): Promise<ClosePreview> {
  return apiFetch(`/months/${monthId}/close-preview?userId=${userId}`);
}

// ---- Ahorros Familiares (ticket #36) ----

export type FamilySavingsEntryType = 'initial' | 'monthly_savings' | 'adjustment' | 'yield' | 'manual';

export type FamilySavingsEntry = {
  id: string;
  userId: string;
  monthId: string | null;
  type: FamilySavingsEntryType;
  amount: string;
  description: string;
  createdAt: string;
};

export type FamilySavingsSummary = {
  balances: { userId: string; name: string; balance: string }[];
  total: string;
};

export async function fetchFamilySavingsSummary(): Promise<FamilySavingsSummary> {
  return apiFetch('/family-savings/summary');
}

export async function fetchFamilySavingsEntries(params?: {
  userId?: string;
  monthId?: string;
}): Promise<FamilySavingsEntry[]> {
  const query = new URLSearchParams();
  if (params?.userId) query.set('userId', params.userId);
  if (params?.monthId) query.set('monthId', params.monthId);
  const qs = query.toString();
  const body = await apiFetch<{ entries: FamilySavingsEntry[] }>(`/family-savings/entries${qs ? `?${qs}` : ''}`);
  return body.entries;
}

export type FamilySavingsEntryInput = {
  userId: string;
  type?: FamilySavingsEntryType;
  amount: string;
  description: string;
  monthId?: string;
};

export async function createFamilySavingsEntry(input: FamilySavingsEntryInput): Promise<FamilySavingsEntry> {
  const body = await apiFetch<{ entry: FamilySavingsEntry }>('/family-savings/entries', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.entry;
}

export async function updateFamilySavingsEntry(
  id: string,
  input: FamilySavingsEntryInput,
): Promise<FamilySavingsEntry> {
  const body = await apiFetch<{ entry: FamilySavingsEntry }>(`/family-savings/entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return body.entry;
}

export async function deleteFamilySavingsEntry(id: string): Promise<void> {
  await apiFetch<void>(`/family-savings/entries/${id}`, { method: 'DELETE' });
}

export type MonthComparisonRow = {
  monthId: string;
  year: number;
  month: number;
  totalIncome: string;
  buckets: MonthBucketSummary[];
  close: MonthCloseInfo;
};

export async function fetchMonthComparison(): Promise<MonthComparisonRow[]> {
  const body = await apiFetch<{ months: MonthComparisonRow[] }>('/months/comparison');
  return body.months;
}

// ---- Cuadre de Inicio (ticket #29) ----

export type OpeningReconciliationPreview = {
  userId: string;
  totalSharedExpenses: string;
  totalSavings: string;
  totalPersonal: string;
  expensesToDate: string;
  leaveInAccount: string;
  moveToSavings: string;
};

export async function fetchOpeningReconciliationPreview(
  monthId: string,
  userId: string,
  accountBalance: string,
): Promise<OpeningReconciliationPreview> {
  return apiFetch(
    `/months/${monthId}/opening-reconciliation/preview?userId=${userId}&accountBalance=${accountBalance}`,
  );
}

export type OpeningReconciliation = {
  id: string;
  monthId: string;
  userId: string;
  accountBalance: string;
  expensesToDate: string;
  leaveInAccount: string;
  moveToSavings: string;
  matched: boolean;
  createdAt: string;
};

export async function fetchLatestOpeningReconciliation(
  monthId: string,
  userId: string,
): Promise<OpeningReconciliation | null> {
  const body = await apiFetch<{ openingReconciliation: OpeningReconciliation | null }>(
    `/months/${monthId}/opening-reconciliation/latest?userId=${userId}`,
  );
  return body.openingReconciliation;
}

export async function confirmOpeningReconciliation(
  monthId: string,
  input: { userId: string; accountBalance: string; confirmedBalance: string },
): Promise<{ openingReconciliation: OpeningReconciliation; diff: string }> {
  return apiFetch(`/months/${monthId}/opening-reconciliation`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Descarga el .xlsx del mes (bolsas + transacciones) y dispara el guardado en el navegador. */
export async function downloadMonthExport(monthId: string, filename: string): Promise<void> {
  const response = await fetch(buildApiUrl(`/months/${monthId}/export`), { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`No se pudo exportar el mes (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type QuickEntryStatus = 'pending' | 'matched' | 'no_match_expected';

// ---- Tipos de registro rapido (configurables, ##73) ----

export type QuickEntryKind = 'personal' | 'joint' | 'movement';

export type QuickEntryTypeOption = {
  id: string;
  name: string;
  kind: QuickEntryKind;
  slug: string;
  active: boolean;
  sortOrder: number;
};

export async function fetchQuickEntryTypes(): Promise<QuickEntryTypeOption[]> {
  const body = await apiFetch<{ quickEntryTypes: QuickEntryTypeOption[] }>('/quick-entry-types');
  return body.quickEntryTypes;
}

export type QuickEntryTypeInput = { name: string; kind: QuickEntryKind; active?: boolean };

export async function createQuickEntryType(input: QuickEntryTypeInput): Promise<QuickEntryTypeOption> {
  const body = await apiFetch<{ quickEntryType: QuickEntryTypeOption }>('/quick-entry-types', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.quickEntryType;
}

export async function updateQuickEntryType(
  id: string,
  input: Partial<QuickEntryTypeInput>,
): Promise<QuickEntryTypeOption> {
  const body = await apiFetch<{ quickEntryType: QuickEntryTypeOption }>(`/quick-entry-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return body.quickEntryType;
}

export type QuickEntry = {
  id: string;
  monthId: string;
  userId: string;
  createdBy: string;
  amount: string;
  description: string;
  typeOptionId: string;
  typeOption: QuickEntryTypeOption;
  date: string;
  status: QuickEntryStatus;
};

export async function fetchQuickEntries(monthId: string, status?: QuickEntryStatus): Promise<QuickEntry[]> {
  const query = new URLSearchParams({ monthId, ...(status ? { status } : {}) });
  const body = await apiFetch<{ quickEntries: QuickEntry[] }>(`/quick-entries?${query.toString()}`);
  return body.quickEntries;
}

export async function createQuickEntry(input: {
  amount: string;
  description: string;
  typeOptionId: string;
  date?: string;
  userId?: string;
}): Promise<QuickEntry> {
  const body = await apiFetch<{ quickEntry: QuickEntry }>('/quick-entries', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.quickEntry;
}

export async function updateQuickEntry(
  id: string,
  input: Partial<{ amount: string; description: string; typeOptionId: string; date: string; userId: string }>,
): Promise<QuickEntry> {
  const body = await apiFetch<{ quickEntry: QuickEntry }>(`/quick-entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return body.quickEntry;
}

export async function deleteQuickEntry(id: string): Promise<void> {
  await apiFetch<void>(`/quick-entries/${id}`, { method: 'DELETE' });
}

export async function markQuickEntryNoMatchExpected(id: string, noMatchExpected: boolean): Promise<QuickEntry> {
  const body = await apiFetch<{ quickEntry: QuickEntry }>(`/quick-entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: noMatchExpected ? 'no_match_expected' : 'pending' }),
  });
  return body.quickEntry;
}

// ---- Fase 3: categorias, reglas, importacion y transacciones ----

export type Category = { id: string; name: string; active: boolean; sortOrder: number };

export async function fetchCategories(): Promise<Category[]> {
  const body = await apiFetch<{ categories: Category[] }>('/categories');
  return body.categories;
}

export type RuleSetType = 'personal' | 'joint' | 'movement';
export type RuleMode = 'auto' | 'suggest';
export type RuleAmountSign = 'any' | 'positive' | 'negative';
export type RuleOrigin = 'seed' | 'user' | 'learned';

export type Rule = {
  id: string;
  pattern: string;
  amountSign: RuleAmountSign;
  setType: RuleSetType;
  setCategoryId: string | null;
  setDetail: string | null;
  mode: RuleMode;
  active: boolean;
  hitCount: number;
  createdFrom: RuleOrigin;
};

export async function fetchRules(): Promise<Rule[]> {
  const body = await apiFetch<{ rules: Rule[] }>('/rules');
  return body.rules;
}

export type RuleInput = {
  pattern: string;
  setType: RuleSetType;
  setCategoryId?: string | null;
  setDetail?: string | null;
  mode: RuleMode;
  amountSign?: RuleAmountSign;
};

export async function createRule(input: RuleInput): Promise<Rule> {
  const body = await apiFetch<{ rule: Rule }>('/rules', { method: 'POST', body: JSON.stringify(input) });
  return body.rule;
}

export async function updateRule(id: string, input: Partial<RuleInput & { active: boolean }>): Promise<Rule> {
  const body = await apiFetch<{ rule: Rule }>(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(input) });
  return body.rule;
}

export async function deleteRule(id: string): Promise<void> {
  await apiFetch<void>(`/rules/${id}`, { method: 'DELETE' });
}

export type RuleSuggestion = {
  pattern: string;
  setType: RuleSetType;
  setCategoryId: string | null;
  setDetail: string | null;
  count: number;
};

export async function fetchRuleSuggestions(monthId: string): Promise<RuleSuggestion[]> {
  const body = await apiFetch<{ suggestions: RuleSuggestion[] }>(`/rules/suggestions?monthId=${monthId}`);
  return body.suggestions;
}

export async function acceptRuleSuggestion(
  input: RuleSuggestion & { monthId?: string },
): Promise<{ rule: Rule; reclassified: number }> {
  return apiFetch(`/rules/suggestions/accept`, { method: 'POST', body: JSON.stringify(input) });
}

export type TransactionType = 'personal' | 'joint' | 'movement' | 'unclassified';
export type ClassifiedBy = 'rule' | 'match' | 'user' | null;

export type Transaction = {
  id: string;
  monthId: string;
  ownerUserId: string;
  importBatchId: string | null;
  date: string;
  bankTime: string | null;
  bankDescription: string;
  bankReference: string | null;
  amount: string;
  type: TransactionType;
  categoryId: string | null;
  detail: string | null;
  classifiedBy: ClassifiedBy;
  ruleId: string | null;
  needsReview: boolean;
  suggestedType: TransactionType | null;
  suggestedCategoryId: string | null;
  suggestedDetail: string | null;
  ruleConflicts: { id: string; setType: RuleSetType; setCategoryId: string | null; setDetail: string | null }[];
  matchedQuickEntry: QuickEntry | null;
};

export async function fetchTransactions(params: {
  monthId: string;
  type?: TransactionType;
  categoryId?: string;
  needsReview?: boolean;
  ownerUserId?: string;
  q?: string;
}): Promise<Transaction[]> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const body = await apiFetch<{ transactions: Transaction[] }>(`/transactions?${query.toString()}`);
  return body.transactions;
}

export async function updateTransaction(
  id: string,
  input: Partial<{ type: TransactionType; categoryId: string | null; detail: string | null }>,
): Promise<Transaction> {
  const body = await apiFetch<{ transaction: Transaction }>(`/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return body.transaction;
}

/** Crea una transaccion manual, sin archivo (ticket #92). */
export async function createTransaction(input: {
  date: string;
  bankDescription: string;
  amount: string;
  ownerUserId: string;
  type?: TransactionType;
  categoryId?: string | null;
  detail?: string | null;
}): Promise<Transaction> {
  const body = await apiFetch<{ transaction: Transaction }>('/transactions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.transaction;
}

export type SheetExportResult = { tabName: string; transactionsWritten: number; tabCreated: boolean };

/** Boton "Actualizar Sheet" (ticket ##51): sube las transacciones ya verificadas de las personas
 * indicadas al tab Auto-[Mes]-[Año] del Google Sheet real. */
export async function updateSheetExport(monthId: string, ownerUserIds: string[]): Promise<SheetExportResult> {
  return apiFetch<SheetExportResult>(`/months/${monthId}/sheet-export`, {
    method: 'POST',
    body: JSON.stringify({ ownerUserIds }),
  });
}

export async function fetchMatchCandidates(transactionId: string): Promise<QuickEntry[]> {
  const body = await apiFetch<{ candidates: QuickEntry[] }>(`/transactions/${transactionId}/match-candidates`);
  return body.candidates;
}

export async function matchTransaction(transactionId: string, quickEntryId: string): Promise<Transaction> {
  const body = await apiFetch<{ transaction: Transaction }>(`/transactions/${transactionId}/match`, {
    method: 'POST',
    body: JSON.stringify({ quickEntryId }),
  });
  return body.transaction;
}

export type ImportBatch = {
  id: string;
  monthId: string;
  ownerUserId: string;
  filename: string;
  uploadedBy: string;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  status: 'done' | 'undone';
  createdAt: string;
  owner?: User;
  uploader?: User;
};

export type ImportResult = {
  batchId: string;
  imported: number;
  duplicatesSkipped: number;
  autoClassified: number;
  needsReview: number;
  matchedQuickEntries: number;
  rejectedOutOfMonth: number;
};

export async function uploadImport(file: File, monthId: string, ownerUserId: string): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('monthId', monthId);
  formData.append('ownerUserId', ownerUserId);
  return apiFetch<ImportResult>('/imports', { method: 'POST', body: formData });
}

export type ImportPreviewRow = { date: string; bankDescription: string; bankReference: string | null; amount: string };

export async function previewImport(file: File): Promise<{ totalRows: number; rows: ImportPreviewRow[] }> {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch('/imports/preview', { method: 'POST', body: formData });
}

export async function fetchImportBatches(): Promise<ImportBatch[]> {
  const body = await apiFetch<{ batches: ImportBatch[] }>('/imports');
  return body.batches;
}

export async function undoImportBatch(batchId: string): Promise<void> {
  await apiFetch<void>(`/imports/${batchId}/undo`, { method: 'POST' });
}

export type SkippedDuplicate = {
  id: string;
  importBatchId: string;
  dedupeKey: string;
  date: string;
  bankDescription: string;
  bankReference: string | null;
  amount: string;
  resolution: 'pending' | 'confirmed_duplicate' | 'forced_twin';
  forcedTransactionId: string | null;
};

export type DuplicateGroup = { dedupeKey: string; existing: Transaction[]; skipped: SkippedDuplicate[] };

export async function fetchImportDuplicates(batchId: string): Promise<DuplicateGroup[]> {
  const body = await apiFetch<{ groups: DuplicateGroup[] }>(`/imports/${batchId}/duplicates`);
  return body.groups;
}

export async function confirmSkippedDuplicate(id: string): Promise<void> {
  await apiFetch<void>(`/skipped-duplicates/${id}/confirm`, { method: 'POST' });
}

export async function forceSkippedDuplicate(id: string): Promise<void> {
  await apiFetch<void>(`/skipped-duplicates/${id}/force`, { method: 'POST' });
}

export async function bulkConfirmSkippedDuplicates(batchId: string): Promise<number> {
  const body = await apiFetch<{ confirmed: number }>('/skipped-duplicates/bulk-confirm', {
    method: 'POST',
    body: JSON.stringify({ batchId }),
  });
  return body.confirmed;
}

// ---- Configuracion general (ticket #36) ----

export type AppSettings = { yieldAutoThreshold: string };

export async function fetchAppSettings(): Promise<AppSettings> {
  return apiFetch('/settings');
}

export async function updateAppSettings(input: { yieldAutoThreshold: string }): Promise<AppSettings> {
  return apiFetch('/settings', { method: 'PUT', body: JSON.stringify(input) });
}

// ---- Fase 4: tarjetas Nu Bank ----

export type CreditCard = { id: string; name: string; ownerUserId: string; active: boolean; owner?: User };

export async function fetchCards(): Promise<CreditCard[]> {
  const body = await apiFetch<{ cards: CreditCard[] }>('/cards');
  return body.cards;
}

export type CardItemType = 'personal' | 'joint';

export type CardItem = {
  id: string;
  cardMonthId: string;
  description: string;
  date: string | null;
  amount: string;
  type: CardItemType;
  isAdjustment: boolean;
};

export type CardDiffStatus = 'matched' | 'short' | 'over';

export type CardMonthDetail = {
  cardMonth: { id: string; creditCardId: string; monthId: string; amountPaid: string };
  items: CardItem[];
  itemsTotal: string;
  diff: string;
  diffStatus: CardDiffStatus;
  split: { personal: string; joint: string; personalPercentage: string; jointPercentage: string };
};

export async function fetchCardMonth(cardId: string, monthId: string): Promise<CardMonthDetail> {
  return apiFetch<CardMonthDetail>(`/cards/${cardId}/months/${monthId}`);
}

export type CardMutationResult = { itemsTotal: string; diff: string; diffStatus: CardDiffStatus };

export async function updateCardMonthAmountPaid(
  cardMonthId: string,
  amountPaid: string,
): Promise<CardMutationResult & { cardMonth: { id: string; amountPaid: string } }> {
  return apiFetch(`/card-months/${cardMonthId}`, { method: 'PUT', body: JSON.stringify({ amountPaid }) });
}

export type CardItemInput = {
  description: string;
  date?: string;
  amount: string;
  type: CardItemType;
  isAdjustment?: boolean;
};

export async function createCardItem(
  cardMonthId: string,
  input: CardItemInput,
): Promise<CardMutationResult & { item: CardItem }> {
  return apiFetch(`/card-months/${cardMonthId}/items`, { method: 'POST', body: JSON.stringify(input) });
}

export async function updateCardItem(
  id: string,
  input: Partial<CardItemInput>,
): Promise<CardMutationResult & { item: CardItem }> {
  return apiFetch(`/card-items/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export async function deleteCardItem(id: string): Promise<CardMutationResult> {
  return apiFetch(`/card-items/${id}`, { method: 'DELETE' });
}

export type ParsedNuRow = { date: string; description: string; amount: string };

export async function importNuStatement(cardMonthId: string, file: File): Promise<ParsedNuRow[]> {
  const formData = new FormData();
  formData.append('file', file);
  const body = await apiFetch<{ items: ParsedNuRow[] }>(`/card-months/${cardMonthId}/import`, {
    method: 'POST',
    body: formData,
  });
  return body.items;
}
