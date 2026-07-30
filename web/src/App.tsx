import { useQuery } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { fetchCurrentUser } from './lib/api';
import Dashboard from './Dashboard';
import QuickEntry from './QuickEntry';

export default function App() {
  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
  });

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Cargando...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <h1 className="text-2xl font-semibold text-slate-800">Finanzas en Pareja</h1>
        <a
          href="/api/auth/google"
          className="rounded-full bg-slate-800 px-6 py-3 text-white shadow-sm transition hover:bg-slate-700"
        >
          Continuar con Google
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/r" element={<QuickEntry currentUser={user} />} />
      </Routes>
    </main>
  );
}
