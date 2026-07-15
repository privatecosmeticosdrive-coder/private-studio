import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { WizardStepper, type EtapaDef } from '@/components/orcamento/wizard-stepper';
import { EtapaBriefing } from '@/components/orcamento/etapa-briefing';
import { EtapaMatch } from '@/components/orcamento/etapa-match';
import { EtapaEmbalagem } from '@/components/orcamento/etapa-embalagem';
import { EtapaCalculo } from '@/components/orcamento/etapa-calculo';
import { FORM_INICIAL, type OrcamentoForm } from '@/components/orcamento/wizard-types';
import { orcamentosApi } from '@/lib/services/orcamentos';
import type { OrcamentoDetalhe } from '@/lib/types';

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

/** Reidrata o estado do wizard a partir de um rascunho salvo (correção C/#4). */
function formDoOrcamento(o: OrcamentoDetalhe): OrcamentoForm {
  const semFormula = o.formula_id == null;
  return {
    ...FORM_INICIAL,
    produto: o.produto ?? '',
    cliente_id: o.cliente_id ?? '',
    categoria: o.categoria ?? '',
    nivel: o.nivel ?? '',
    volume_un: o.volume_un != null ? String(Number(o.volume_un)) : '',
    quantidade: o.quantidade != null ? String(o.quantidade) : FORM_INICIAL.quantidade,
    produto_referencia: o.produto_referencia ?? '',
    requer_amostra: o.requer_amostra,
    amostra_qtd: o.amostra_qtd != null ? String(o.amostra_qtd) : '',
    modo_operacao: o.modo_operacao ?? 'full_service',
    formula_id: o.formula_id,
    formula_nome: o.formula
      ? `${o.formula.nome_produto}${o.formula.versao_codigo ? ` ${o.formula.versao_codigo}` : ''}`
      : '',
    sem_formula: semFormula,
    budget_mp: semFormula && o.budget_mp != null ? String(Number(o.budget_mp)) : '',
    embalagem_id: o.embalagem_id,
    embalagem_nome: o.embalagem_snapshot?.nome ?? '',
    sem_embalagem: o.sem_embalagem,
    un_min: o.un_min != null ? String(Number(o.un_min)) : '',
    margem_pct: o.margem_pct != null ? String(Number(o.margem_pct)) : FORM_INICIAL.margem_pct,
  };
}

export default function OrcamentoWizard() {
  const navigate = useNavigate();
  // MODO EDIÇÃO (correção C/#4): /orcamentos/:id/editar reabre um RASCUNHO com
  // o estado salvo; o cálculo recai no MESMO registro (orcIdInicial).
  const params = useParams<{ id?: string }>();
  const editandoId = params.id ?? null;

  const [etapa, setEtapa] = React.useState(1);
  const [form, setForm] = React.useState<OrcamentoForm>(FORM_INICIAL);
  const [reidratado, setReidratado] = React.useState(false);
  // P0-2: id do orçamento persistido — do modo edição OU criado na solicitação
  // ao lab (etapa 2). A etapa 4 recalcula o MESMO registro.
  const [orcIdCriado, setOrcIdCriado] = React.useState<string | null>(editandoId);

  const rascunho = useQuery({
    queryKey: ['orcamentos', 'detalhe', editandoId],
    queryFn: () => orcamentosApi.obter(editandoId!),
    enabled: !!editandoId,
  });

  React.useEffect(() => {
    if (rascunho.data && !reidratado) {
      setForm(formDoOrcamento(rascunho.data));
      setReidratado(true);
    }
  }, [rascunho.data, reidratado]);

  const patch = React.useCallback((parcial: Partial<OrcamentoForm>) => {
    setForm((prev) => ({ ...prev, ...parcial }));
  }, []);

  const avancar = () => setEtapa((e) => Math.min(ETAPAS.length, e + 1));
  const voltar = () => setEtapa((e) => Math.max(1, e - 1));
  const liberado = podeAvancar(etapa, form);

  if (editandoId && rascunho.isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-muted-foreground">
        <Spinner /> <span className="text-sm">Carregando rascunho…</span>
      </div>
    );
  }
  if (editandoId && (rascunho.isError || (rascunho.data && rascunho.data.status !== 'rascunho'))) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-error">
          {rascunho.isError
            ? 'Não foi possível carregar o orçamento.'
            : 'Só orçamentos em rascunho podem ser reabertos para edição.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate('/orcamentos')}>
          Voltar aos orçamentos
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={editandoId ? `Continuar orçamento #${rascunho.data?.numero ?? ''}` : 'Novo orçamento'}
        description="Briefing, fórmula, embalagem e cálculo determinístico em quatro etapas."
        actions={
          <Button variant="ghost" onClick={() => navigate('/orcamentos')}>
            <X className="size-4" /> {editandoId ? 'Fechar' : 'Cancelar'}
          </Button>
        }
      />

      <Card className="p-5">
        <WizardStepper etapas={ETAPAS} atual={etapa} onIr={setEtapa} />
      </Card>

      <Card className="p-6">
        {etapa === 1 && <EtapaBriefing form={form} patch={patch} />}
        {etapa === 2 && (
          <EtapaMatch
            form={form}
            patch={patch}
            orcamentoId={orcIdCriado}
            onOrcamentoPersistido={setOrcIdCriado}
          />
        )}
        {etapa === 3 && <EtapaEmbalagem form={form} patch={patch} />}
        {etapa === 4 && (
          <EtapaCalculo form={form} patch={patch} onVoltar={voltar} orcIdInicial={orcIdCriado} />
        )}

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
