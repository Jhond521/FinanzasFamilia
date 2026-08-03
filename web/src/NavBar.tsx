import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/importar', label: 'Importar' },
  { to: '/revisar', label: 'Revisar' },
  { to: '/transacciones', label: 'Transacciones' },
  { to: '/tarjetas', label: 'Tarjetas' },
  { to: '/ahorros-familiares', label: 'Ahorros Familiares' },
  { to: '/configuracion', label: 'Configuración' },
];

export default function NavBar() {
  const location = useLocation();

  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-brand" />
          <span className="text-base font-extrabold text-ink">Finanzas en Pareja</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-5 text-sm font-semibold text-ink-muted">
          {LINKS.map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={active ? 'border-b-2 border-brand pb-1 text-ink' : 'pb-1 hover:text-ink'}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
