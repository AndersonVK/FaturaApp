import { Link } from 'react-router-dom';

const links = [
  { to: '/ajustes/cartoes', label: 'Cartões', descricao: 'Contas Itaú e cartões finais', icon: '💳' },
  { to: '/ajustes/pessoas', label: 'Pessoas', descricao: 'Quem usa os cartões', icon: '🧑‍🤝‍🧑' },
  { to: '/ajustes/dicionario', label: 'Dicionário', descricao: 'Estabelecimento → Pessoa', icon: '📖' },
  { to: '/ajustes/backup', label: 'Backup e Restauração', descricao: 'Exportar/importar dados', icon: '💾' },
];

export function AjustesPage() {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="mb-2 text-base font-semibold text-slate-600 dark:text-slate-300">Ajustes</h2>
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm active:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:active:bg-slate-800"
        >
          <span className="text-2xl">{link.icon}</span>
          <span className="flex-1">
            <span className="block font-medium">{link.label}</span>
            <span className="block text-sm text-slate-500 dark:text-slate-400">{link.descricao}</span>
          </span>
          <span className="text-slate-400">›</span>
        </Link>
      ))}
    </div>
  );
}
