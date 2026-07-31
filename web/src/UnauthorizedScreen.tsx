import { Link } from 'react-router-dom';

export default function UnauthorizedScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream p-6 text-center">
      <h1 className="text-2xl font-extrabold text-danger">Usuario no autorizado</h1>
      <p className="max-w-xs text-ink-muted">
        Esta cuenta de Google no tiene acceso a Finanzas en Pareja. Si crees que es un error, contacta
        a quien administra la app.
      </p>
      <Link
        to="/"
        className="rounded-full bg-brand px-6 py-3 text-white shadow-sm transition hover:bg-brand-hover"
      >
        Volver al login
      </Link>
    </main>
  );
}
