export function buildApiUrl(path: string): string {
  return `/api${path.startsWith('/') ? path : `/${path}`}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Error de red (${response.status})`);
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
  contributions: { userId: string; amount: string }[];
};

export type MonthDetail = {
  month: { id: string; year: number; month: number; status: 'open' | 'closed' };
  incomes: Income[];
  monthBuckets: { id: string; name: string; percentage: string; splitMode: SplitMode; kind: BucketKind; active: boolean }[];
};

export async function fetchMonthDetail(monthId: string): Promise<MonthDetail> {
  return apiFetch<MonthDetail>(`/months/${monthId}`);
}

export type MonthSummaryDetail = {
  month: { id: string; year: number; month: number; status: 'open' | 'closed' };
  totalIncome: string;
  buckets: MonthBucketSummary[];
};

export async function fetchMonthSummary(monthId: string): Promise<MonthSummaryDetail> {
  return apiFetch<MonthSummaryDetail>(`/months/${monthId}/summary`);
}
