import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft,
  FileDown,
  FlaskConical,
  Package,
  Barcode,
  Pencil,
  Send,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import { StatusOrcamentoBadge } from '@/components/ui/status-badge';
import { ResultadoCalculo } from '@/components/orcamento/resultado-calculo';
import { brl } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { NIVEL_ORCAMENTO_LABEL, type OrcamentoDetalhe } from '@/lib/types';
import { orcamentosApi } from '@/lib/services/orcamentos';
import { useAuth } from '@/auth/auth-context';
import { EditarNcmOrcamentoModal } from '@/components/data/editar-ncm-orcamento';

/** Item rótulo → valor do resumo do briefing. */
function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-caption uppercase tracking-wide text-warm-500">{rotulo}</dt>
      <dd className="text-sm text-ink">{valor ?? '—'}</dd>
    </div>
  );
}

function ResumoBriefing({
  orc,
  podeVerCustos,
  onEditarNcm,
}: {
  orc: OrcamentoDetalhe;
  podeVerCustos: boolean;
  onEditarNcm: () => void;
}) {
  const formula = orc.formula
    ? `${orc.formula.nome_produto}${orc.formula.versao_codigo ? ` ${orc.formula.versao_codigo}` : ''}`
    : 'Sem fórmula';
  const embalagem = orc.sem_embalagem
    ? 'A granel (sem embalagem)'
    : // fallback: orçamento calculado antes do fix do bug #50 não tem o
      // snapshot persistido — o snap resolvido vive dentro do JSON_CALC.
      (orc.embalagem_snapshot?.nome ?? orc.calculo?.embalagem?.nome ?? '—');

  // NCM efetivo: objeto do override (origem 'orcamento') ou da fórmula ('formula').
  const ncmObj = orc.ncm_efetivo_origem === 'orcamento' ? orc.ncm : orc.formula?.ncm ?? null;
  const origemLabel =
    orc.ncm_efetivo_origem === 'orcamento'
      ? 'deste orçamento'
      : orc.ncm_efetivo_origem === 'formula'
        ? 'da fórmula'
        : null;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-h3 text-ink">Briefing</h2>
        {podeVerCustos && (
          <Button variant="ghost" size="sm" onClick={onEditarNcm}>
            <Barcode className="size-4" /> Editar NCM
          </Button>
        )}
      </div>
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
        <Campo
          rotulo="NCM"
          valor={
            <span className="inline-flex items-center gap-2">
              <span className="font-mono">{ncmObj ? ncmObj.ncm : '—'}</span>
              {origemLabel && <Badge variant="neutral">{origemLabel}</Badge>}
            </span>
          }
        />
      </dl>
    </Card>
  );
}

export default function OrcamentoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const podeVerCustos = !!user && (user.pode_ver_custos || user.role === 'admin');

  const [baixando, setBaixando] = useState(false);
  const [editandoNcm, setEditandoNcm] = useState(false);
  // P1: qual transição está aguardando confirmação (null = nenhuma)
  const [transicao, setTransicao] = useState<null | 'enviado' | 'aprovado_cliente' | 'recusado'>(null);
  const queryClient = useQueryClient();

  const mudarStatus = useMutation({
    mutationFn: (novo: 'enviado' | 'aprovado_cliente' | 'recusado') =>
      orcamentosApi.mudarStatus(id!, novo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      setTransicao(null);
      toast.success('Status atualizado.');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao mudar o status.');
    },
  });

  const { data: orc, isLoading, isError, refetch } = useQuery({
    queryKey: ['orcamentos', 'detalhe', id],
    queryFn: () => orcamentosApi.obter(id!),
    enabled: !!id,
  });

  // PDF interno: erro vem como Blob (responseType blob) — extrai a mensagem do backend.
  const baixarPdf = async () => {
    if (!orc) return;
    setBaixando(true);
    try {
      await orcamentosApi.baixarPdf(orc.id);
    } catch (err) {
      let msg = 'Não foi possível gerar o PDF.';
      const data = (err as AxiosError).response?.data;
      if (data instanceof Blob) {
        try {
          const j = JSON.parse(await data.text()) as { message?: string | string[] };
          if (j.message) msg = Array.isArray(j.message) ? j.message[0] : j.message;
        } catch {
          /* mantém a mensagem genérica */
        }
      }
      toast.error(msg);
    } finally {
      setBaixando(false);
    }
  };

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

        <div className="flex flex-wrap gap-2">
          {/* Correção C/#4: rascunho REABRE no wizard com o estado salvo. */}
          {orc.status === 'rascunho' && (
            <Button onClick={() => navigate(`/orcamentos/${orc.id}/editar`)}>
              <Pencil className="size-4" /> Continuar edição
            </Button>
          )}
          {/* P1 — transições de status (máquina valida no backend). */}
          {orc.status === 'rascunho' && (
            <span title={!orc.calculo ? 'Calcule o orçamento antes de enviar' : undefined}>
              <Button
                variant="outline"
                disabled={!orc.calculo || mudarStatus.isPending}
                onClick={() => setTransicao('enviado')}
              >
                <Send className="size-4" /> Enviar ao cliente
              </Button>
            </span>
          )}
          {orc.status === 'enviado' && (
            <>
              <Button
                variant="outline"
                disabled={mudarStatus.isPending}
                onClick={() => setTransicao('aprovado_cliente')}
              >
                <ThumbsUp className="size-4" /> Aprovado pelo cliente
              </Button>
              <Button
                variant="outline"
                disabled={mudarStatus.isPending}
                className="text-error hover:bg-error-soft"
                onClick={() => setTransicao('recusado')}
              >
                <ThumbsDown className="size-4" /> Recusado
              </Button>
            </>
          )}
          <span
            title={!orc.calculo ? 'Calcule o orçamento antes de exportar' : undefined}
          >
            <Button
              variant="outline"
              disabled={!orc.calculo || baixando}
              onClick={baixarPdf}
            >
              {baixando ? (
                <Spinner className="text-gold-500" />
              ) : (
                <FileDown className="size-4" />
              )}
              Baixar PDF
            </Button>
          </span>
        </div>
      </div>

      <ResumoBriefing
        orc={orc}
        podeVerCustos={podeVerCustos}
        onEditarNcm={() => setEditandoNcm(true)}
      />

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

      <EditarNcmOrcamentoModal
        open={editandoNcm}
        orcamento={orc}
        onClose={() => setEditandoNcm(false)}
      />

      {/* P1 — confirmação da transição de status */}
      <ConfirmDialog
        open={transicao !== null}
        onClose={() => setTransicao(null)}
        onConfirm={() => transicao && mudarStatus.mutate(transicao)}
        loading={mudarStatus.isPending}
        destructive={transicao === 'recusado'}
        title={
          transicao === 'enviado'
            ? 'Enviar ao cliente'
            : transicao === 'aprovado_cliente'
              ? 'Marcar como aprovado'
              : 'Marcar como recusado'
        }
        confirmLabel="Confirmar"
        description={
          transicao === 'enviado' ? (
            <p>
              O orçamento <strong className="text-ink">#{orc.numero}</strong> passa de rascunho
              para <strong className="text-ink">enviado</strong>. Depois disso, só as transições de
              aprovação/recusa ficam disponíveis.
            </p>
          ) : transicao === 'aprovado_cliente' ? (
            <p>
              Registra a resposta do cliente: <strong className="text-ink">aprovado</strong>.
            </p>
          ) : (
            <p>
              Registra a resposta do cliente: <strong className="text-ink">recusado</strong>. (O
              motivo categorizado da recusa chega na próxima fase.)
            </p>
          )
        }
      />
    </div>
  );
}
