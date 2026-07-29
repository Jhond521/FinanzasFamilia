import { useQuery } from '@tanstack/react-query';
import { fetchCurrentUser } from './lib/api';

export default function App() {
  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
      <h1 className="text-2xl font-semibold text-slate-800">Finanzas en Pareja</h1>

      {isLoading && <p className="text-slate-500">Cargando...</p>}

      {!isLoading && user && (
        <p className="text-slate-600">
          Hola, <span className="font-medium">{user.name}</span>
        </p>
      )}

      {!isLoading && !user && (
        <a
          href="/api/auth/google"
          className="rounded-full bg-slate-800 px-6 py-3 text-white shadow-sm transition hover:bg-slate-700"
        >
          Continuar con Google
        </a>
      )}
    </main>
  );
}
