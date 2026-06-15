import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FlaskConical, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { StatusOrcamentoBadge } from '@/components/ui/status-badge';
import { ResultadoCalculo } from '@/components/orcamento/resultado-calculo';
import { brl } from '@/lib/utils';
import { NIVEL_ORCAMENTO_LABEL, type OrcamentoDetalhe } from '@/lib/types';
import { orcamentosApi } from '@/lib/services/orcamentos';

/** Item rótulo → valor do resumo do briefing. */
function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-caption uppercase tracking-wide text-warm-500">{rotulo}</dt>
      <dd className="text-sm text-ink">{valor ?? '—'}</dd>
    </div>
  );
}

function ResumoBriefing({ orc }: { orc: OrcamentoDetalhe }) {
  const formula = orc.formula
    ? `${orc.formula.nome_produto}${orc.formula.versao_codigo ? ` ${orc.formula.versao_codigo}` : ''}`
    : 'Sem fórmula';
  const embalagem = orc.sem_embalagem
    ? 'A granel (sem embalagem)'
    : orc.embalagem_snapshot?.nome ?? '—';

  return (
    <Card className="p-6">
      <h2 className="mb-4 font-display text-h3 text-ink">Briefing</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
        <Campo rotulo="Produto" valor={orc.produto} />
        <Campo rotulo="Cliente" valor={orc.cliente?.nome} />
        <Campo rotulo="Categoria" valor={orc.categoria} />
        <Campo rotulo="Nível" valor={orc.nivel ? NIVEL_ORCAMENTO_LABEL[orc.nivel] : '—'} />
        <Campo
          rotulo="Volume/un"
          valor={orc.volume_un != null ? `${String(orc.volume_un)} mL/g` : '—'}
        />
        <Campo rotulo="Quantidade do lote" valor={orc.quantidade != null ? String(orc.quantidade) : '—'} />
        <Campo
          rotulo="Fórmula"
          valor={
            <span className="inline-flex items-center gap-1.5">
              <FlaskConical className="size-4 text-warm-500" />
              {formula}
            </span>
          }
        />
        <Campo
          rotulo="Embalagem"
          valor={
            <span className="inline-flex items-center gap-1.5">
              <Package className="size-4 text-warm-500" />
              {embalagem}
            </span>
          }
        />
        <Campo
          rotulo="Produtividade"
          valor={orc.un_min != null ? `${String(orc.un_min)} un/min` : '—'}
        />
        <Campo rotulo="Margem" valor={orc.margem_pct != null ? `${String(orc.margem_pct)}%` : '—'} />
        <Campo rotulo="Produto de referência" valor={orc.produto_referencia} />
        <Campo rotulo="Requer amostra" valor={orc.requer_amostra ? 'Sim' : 'Não'} />
      </dl>
    </Card>
  );
}

export default function OrcamentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: orc, isLoading, isError, refetch } = useQuery({
    queryKey: ['orcamentos', 'detalhe', id],
    queryFn: () => orcamentosApi.obter(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Spinner className="text-warm-500" /> Carregando orçamento…
      </div>
    );
  }

  if (isError || !orc) {
    return (
      <div className="space-y-4 py-20 text-center">
        <p className="text-error">Não foi possível carregar o orçamento.</p>
        <div className="flex justify-center gap-2">
          <Button variant="ghost" onClick={() => navigate('/orcamentos')}>
            <ArrowLeft className="size-4" /> Voltar
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate('/orcamentos')}
            className="mb-2 inline-flex items-center gap-1 text-caption text-warm-600 transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3.5" /> Orçamentos
          </button>
          <h1 className="font-display text-h1 text-ink">
            <span className="tnum">#{orc.numero}</span> · {orc.produto}
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <StatusOrcamentoBadge status={orc.status} />
            {orc.preco_cipi != null && (
              <span className="text-sm text-warm-600">
                Preço c/ IPI <span className="tnum font-semibold text-ink">{brl(orc.preco_cipi)}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <ResumoBriefing orc={orc} />

      <Card className="p-6">
        <h2 className="mb-4 font-display text-h3 text-ink">Cálculo</h2>
        {orc.calculo ? (
          <ResultadoCalculo calc={orc.calculo} />
        ) : (
          <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Este orçamento ainda não foi calculado.
          </p>
        )}
      </Card>
    </div>
  );
}
