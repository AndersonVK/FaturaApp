import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './routes/AppShell';

const LancarPage = lazy(() => import('./features/lancar/LancarPage').then((m) => ({ default: m.LancarPage })));
const ImportarPage = lazy(() => import('./features/importar/ImportarPage').then((m) => ({ default: m.ImportarPage })));
const HistoricoPage = lazy(() => import('./features/historico/HistoricoPage').then((m) => ({ default: m.HistoricoPage })));
const AjustesPage = lazy(() => import('./features/ajustes/AjustesPage').then((m) => ({ default: m.AjustesPage })));
const CartoesPage = lazy(() => import('./features/cartoes/CartoesPage').then((m) => ({ default: m.CartoesPage })));
const PessoasPage = lazy(() => import('./features/pessoas/PessoasPage').then((m) => ({ default: m.PessoasPage })));
const DicionarioPage = lazy(() => import('./features/dicionario/DicionarioPage').then((m) => ({ default: m.DicionarioPage })));
const BackupPage = lazy(() => import('./features/backup/BackupPage').then((m) => ({ default: m.BackupPage })));

export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<div className="p-4 text-sm text-slate-500">Carregando...</div>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/lancar" replace />} />
            <Route path="lancar" element={<LancarPage />} />
            <Route path="importar" element={<ImportarPage />} />
            <Route path="historico" element={<HistoricoPage />} />
            <Route path="ajustes" element={<AjustesPage />} />
            <Route path="ajustes/cartoes" element={<CartoesPage />} />
            <Route path="ajustes/pessoas" element={<PessoasPage />} />
            <Route path="ajustes/dicionario" element={<DicionarioPage />} />
            <Route path="ajustes/backup" element={<BackupPage />} />
            <Route path="*" element={<Navigate to="/lancar" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
