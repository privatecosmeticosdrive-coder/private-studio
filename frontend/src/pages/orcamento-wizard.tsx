import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { WizardStepper, type EtapaDef } from '@/components/orcamento/wizard-stepper';
import { EtapaBriefing } from '@/components/orcamento/etapa-briefing';
import { EtapaMatch } from '@/components/orcamento/etapa-match';
import { EtapaEmbalagem } from '@/components/orcamento/etapa-embalagem';
import { EtapaCalculo } from '@/components/orcamento/etapa-calculo';
import { FORM_INICIAL, type OrcamentoForm } from '@/components/orcamento/wizard-types';

const ETAPAS: EtapaDef[] = [
  { id: 1, titulo: 'Briefing' },
  { id: 2, titulo: 'Fórmula' },
  { id: 3, titulo: 'Embalagem' },
  { id: 4, titulo: 'Cálculo' },
];

/** Validação mínima por etapa — libera o botão Avançar. */
function podeAvancar(etapa: number, form: OrcamentoForm): boolean {
  switch (etapa) {
    case 1: {
      const qtd = parseInt(form.quantidade, 10);
      return form.produto.trim().length >= 2 && Number.isInteger(qtd) && qtd >= 1;
    }
    case 2:
      return form.sem_formula || form.formula_id != null;
    case 3:
      return form.sem_embalagem || form.embalagem_id != null;
    default:
      return true;
  }
}

export default function OrcamentoWizard() {
  const navigate = useNavigate();
  const [etapa, setEtapa] = React.useState(1);
  const [form, setForm] = React.useState<OrcamentoForm>(FORM_INICIAL);

  const patch = React.useCallback((parcial: Partial<OrcamentoForm>) => {
    setForm((prev) => ({ ...prev, ...parcial }));
  }, []);

  const avancar = () => setEtapa((e) => Math.min(ETAPAS.length, e + 1));
  const voltar = () => setEtapa((e) => Math.max(1, e - 1));
  const liberado = podeAvancar(etapa, form);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Novo orçamento"
        description="Briefing, fórmula, embalagem e cálculo determinístico em quatro etapas."
        actions={
          <Button variant="ghost" onClick={() => navigate('/orcamentos')}>
            <X className="size-4" /> Cancelar
          </Button>
        }
      />

      <Card className="p-5">
        <WizardStepper etapas={ETAPAS} atual={etapa} onIr={setEtapa} />
      </Card>

      <Card className="p-6">
        {etapa === 1 && <EtapaBriefing form={form} patch={patch} />}
        {etapa === 2 && <EtapaMatch form={form} patch={patch} />}
        {etapa === 3 && <EtapaEmbalagem form={form} patch={patch} />}
        {etapa === 4 && <EtapaCalculo form={form} patch={patch} onVoltar={voltar} />}

        {/* Rodapé de navegação: etapas 1–3. A etapa 4 traz as próprias ações. */}
        {etapa < 4 && (
          <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
            <Button variant="ghost" onClick={voltar} disabled={etapa === 1}>
              <ArrowLeft className="size-4" /> Voltar
            </Button>
            <Button onClick={avancar} disabled={!liberado}>
              Avançar <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
