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
import FormulaNovaVersao from '@/pages/formula-nova-versao';
import FormulaEditar from '@/pages/formula-editar';
import Orcamentos from '@/pages/orcamentos';
import OrcamentoWizard from '@/pages/orcamento-wizard';
import OrcamentoDetalhe from '@/pages/orcamento-detalhe';
import Admin from '@/pages/admin';
import MatrizCusto from '@/pages/matriz-custo';
import NcmPage from '@/pages/ncm';
import RevisaoNcm from '@/pages/revisao-ncm';
import Laboratorio from '@/pages/laboratorio';
import Placeholder from '@/pages/placeholder';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/orcamentos" element={<Orcamentos />} />
          <Route path="/orcamentos/novo" element={<OrcamentoWizard />} />
          <Route path="/orcamentos/:id/editar" element={<OrcamentoWizard />} />
          <Route path="/orcamentos/:id" element={<OrcamentoDetalhe />} />
          <Route path="/formulas" element={<Formulas />} />
          <Route path="/formulas/:id" element={<FormulaDetalhe />} />
          <Route path="/formulas/:id/nova-versao" element={<FormulaNovaVersao />} />
          <Route path="/formulas/:id/editar" element={<FormulaEditar />} />
          <Route path="/laboratorio" element={<Laboratorio />} />
          <Route path="/materias-primas" element={<MateriasPrimas />} />
          <Route path="/embalagens" element={<Embalagens />} />
          <Route path="/amostras" element={<Placeholder title="Amostras (pipeline)" dia="Dia 11" />} />
          <Route path="/cotacoes" element={<Placeholder title="Cotações" dia="Dia 11" />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/matriz-custo" element={<MatrizCusto />} />
          <Route path="/ncm" element={<NcmPage />} />
          <Route path="/revisao-ncm" element={<RevisaoNcm />} />
          <Route index element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
