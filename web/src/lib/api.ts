export function buildApiUrl(path: string): string {
  return `/api${path.startsWith('/') ? path : `/${path}`}`;
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
