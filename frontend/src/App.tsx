import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import Embalagens from '@/pages/embalagens';
import MateriasPrimas from '@/pages/materias-primas';
import Clientes from '@/pages/clientes';
import Formulas from '@/pages/formulas';
import FormulaDetalhe from '@/pages/formula-detalhe';
import Placeholder from '@/pages/placeholder';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/orcamentos" element={<Placeholder title="Orçamentos" dia="Dia 9-10" />} />
          <Route path="/formulas" element={<Formulas />} />
          <Route path="/formulas/:id" element={<FormulaDetalhe />} />
          <Route path="/materias-primas" element={<MateriasPrimas />} />
          <Route path="/embalagens" element={<Embalagens />} />
          <Route path="/amostras" element={<Placeholder title="Amostras (pipeline)" dia="Dia 11" />} />
          <Route path="/cotacoes" element={<Placeholder title="Cotações" dia="Dia 11" />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/admin" element={<Placeholder title="Admin" dia="Dia 13" />} />
          <Route index element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
