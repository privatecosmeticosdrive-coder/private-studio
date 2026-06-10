import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import Placeholder from '@/pages/placeholder';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/orcamentos" element={<Placeholder title="Orcamentos" dia="Dia 9-10" />} />
          <Route path="/formulas" element={<Placeholder title="Formulas" dia="Dia 9-11" />} />
          <Route path="/materias-primas" element={<Placeholder title="Materias-primas" dia="Dia 9-11" />} />
          <Route path="/amostras" element={<Placeholder title="Amostras (pipeline)" dia="Dia 11" />} />
          <Route path="/cotacoes" element={<Placeholder title="Cotacoes" dia="Dia 11" />} />
          <Route path="/clientes" element={<Placeholder title="Clientes" dia="Dia 13" />} />
          <Route path="/admin" element={<Placeholder title="Admin" dia="Dia 13" />} />
          <Route index element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
