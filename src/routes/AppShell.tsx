import { NavLink, Outlet } from 'react-router-dom';

const itensNav = [
  { to: '/lancar', label: 'Lançar', icon: '➕' },
  { to: '/importar', label: 'Importar', icon: '📥' },
  { to: '/historico', label: 'Histórico', icon: '📊' },
  { to: '/ajustes', label: 'Ajustes', icon: '⚙️' },
];

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <h1 className="text-lg font-semibold">FaturaApp</h1>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <div className="mx-auto w-full max-w-2xl px-4 py-4">
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-2xl justify-around">
          {itensNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                  isActive ? 'text-brand-600 dark:text-brand-500' : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <span className="text-xl leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
