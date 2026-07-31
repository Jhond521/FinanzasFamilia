import { useQuery } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import { fetchCurrentUser } from './lib/api';
import Dashboard from './Dashboard';
import QuickEntry from './QuickEntry';
import UnauthorizedScreen from './UnauthorizedScreen';

function LoginScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream p-6 text-center">
      <h1 className="text-2xl font-extrabold text-ink">Finanzas en Pareja</h1>
      <a
        href="/api/auth/google"
        className="rounded-full bg-brand px-6 py-3 text-white shadow-sm transition hover:bg-brand-hover"
      >
        Continuar con Google
      </a>
    </main>
  );
}

export default function App() {
  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchCurrentUser,
  });

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream">
        <p className="text-ink-muted">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cream">
      <Routes>
        <Route path="/cuenta-no-autorizada" element={<UnauthorizedScreen />} />
        {user ? (
          <>
            <Route path="/" element={<Dashboard />} />
            <Route path="/r" element={<QuickEntry currentUser={user} />} />
          </>
        ) : (
          <Route path="*" element={<LoginScreen />} />
        )}
      </Routes>
    </main>
  );
}
