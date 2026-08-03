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
import {
  MOTIVOS_RECUSA,
  MOTIVO_RECUSA_LABEL,
  NIVEL_ORCAMENTO_LABEL,
  type MotivoRecusa,
  type OrcamentoDetalhe,
  type UrgenciaLab,
} from '@/lib/types';
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
  // FASE 3 — form da recusa (vive no dialog; zerado a cada abertura).
  const [motivo, setMotivo] = useState<MotivoRecusa | ''>('');
  const [observacao, setObservacao] = useState('');
  const [urgencia, setUrgencia] = useState<UrgenciaLab>('dois_tres_dias');
  const queryClient = useQueryClient();

  /** Abre o dialog zerando o form (não herdar motivo de uma recusa cancelada). */
  const abrirTransicao = (t: 'enviado' | 'aprovado_cliente' | 'recusado') => {
    setMotivo('');
    setObservacao('');
    setUrgencia('dois_tres_dias');
    setTransicao(t);
  };

  const mudarStatus = useMutation({
    mutationFn: (novo: 'enviado' | 'aprovado_cliente' | 'recusado') =>
      orcamentosApi.mudarStatus(id!, {
        status: novo,
        ...(novo === 'recusado'
          ? {
              motivo: motivo as MotivoRecusa,
              observacao: observacao.trim() || undefined,
              ...(motivo === 'formula' ? { urgencia } : {}),
            }
          : {}),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      queryClient.invalidateQueries({ queryKey: ['pendencias-lab'] });
      setTransicao(null);
      // O gatilho tem 3 desfechos e a UI conta os 3 (nunca "sucesso" mudo).
      if (res.aviso) {
        toast.warning(res.aviso, { duration: 9000 });
      } else if (res.pendencia_criada) {
        toast.success(
          `Recusa registrada. Pendência de revisão #${res.pendencia_criada.id} criada no laboratório.`,
        );
      } else {
        toast.success('Status atualizado.');
      }
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
                onClick={() => abrirTransicao('enviado')}
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
                onClick={() => abrirTransicao('aprovado_cliente')}
              >
                <ThumbsUp className="size-4" /> Aprovado pelo cliente
              </Button>
              <Button
                variant="outline"
                disabled={mudarStatus.isPending}
                className="text-error hover:bg-error-soft"
                onClick={() => abrirTransicao('recusado')}
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

      {/* FASE 3 — motivo da recusa. Só aparece quando existe (UI nunca mente:
          orçamento recusado antes desta fase não tem motivo e não inventa um). */}
      {orc.status === 'recusado' && orc.recusa_motivo && (
        <Card className="border-error/30 bg-error-soft/40 p-6">
          <h2 className="mb-2 font-display text-h3 text-ink">Motivo da recusa</h2>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-error/30 bg-surface px-3 py-1 text-caption font-semibold text-error">
              {MOTIVO_RECUSA_LABEL[orc.recusa_motivo] ?? orc.recusa_motivo}
            </span>
            {orc.recusa_em && (
              <span className="text-caption text-warm-600">
                em {new Date(orc.recusa_em).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          {orc.recusa_observacao && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-warm-700">
              {orc.recusa_observacao}
            </p>
          )}
        </Card>
      )}

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
        // FASE 3 — sem motivo não recusa (o backend também barra; isto é UX).
        confirmDisabled={transicao === 'recusado' && !motivo}
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
            // FASE 3 — o motivo é o dado que fecha o funil: sem ele, "perdemos
            // o orçamento" é dado morto. Por isso é obrigatório aqui.
            <div className="space-y-4">
              <p>
                Registra a resposta do cliente: <strong className="text-ink">recusado</strong>.
              </p>

              <div className="space-y-1.5">
                <label htmlFor="recusa-motivo" className="block text-caption text-warm-600">
                  Motivo da recusa <span className="text-error">*</span>
                </label>
                <select
                  id="recusa-motivo"
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value as MotivoRecusa | '')}
                >
                  <option value="">Selecione…</option>
                  {MOTIVOS_RECUSA.map((m) => (
                    <option key={m} value={m}>
                      {MOTIVO_RECUSA_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>

              {motivo === 'formula' && (
                <div className="space-y-1.5 rounded-md border border-gold-200 bg-gold-50 p-3">
                  <label htmlFor="recusa-urgencia" className="block text-caption text-warm-700">
                    Urgência da revisão no laboratório
                  </label>
                  <select
                    id="recusa-urgencia"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
                    value={urgencia}
                    onChange={(e) => setUrgencia(e.target.value as UrgenciaLab)}
                  >
                    <option value="mesmo_dia">Mesmo dia</option>
                    <option value="dois_tres_dias">2 a 3 dias</option>
                    <option value="ate_sete_dias">Até 7 dias</option>
                  </select>
                  <p className="text-caption text-warm-600">
                    Uma pendência de revisão da fórmula será aberta no laboratório, vinculada a
                    este orçamento.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="recusa-obs" className="block text-caption text-warm-600">
                  Observação <span className="text-warm-500">(opcional)</span>
                </label>
                <textarea
                  id="recusa-obs"
                  rows={3}
                  maxLength={1000}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
                  placeholder="O que o cliente falou? (ex.: preço 8% acima do concorrente)"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>
            </div>
          )
        }
      />
    </div>
  );
}
