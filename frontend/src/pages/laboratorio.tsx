import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { Beaker, Clock, AlertTriangle, FlaskConical, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/auth/auth-context';
import { pendenciasLabApi } from '@/lib/services/pendencias-lab';
import { ConcluirPendenciaModal } from '@/components/data/concluir-pendencia-modal';
import type { PendenciaLab, StatusPendencia, UrgenciaLab } from '@/lib/types';

const URGENCIA_LABEL: Record<UrgenciaLab, string> = {
  mesmo_dia: 'Mesmo dia',
  dois_tres_dias: '2–3 dias úteis',
  ate_sete_dias: 'Até 7 dias úteis',
};
const STATUS_LABEL: Record<StatusPendencia, string> = {
  aberta: 'Aberta',
  em_atendimento: 'Em atendimento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

function dataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function CardPendencia({
  p,
  podeAtender,
  onAtender,
  onConcluir,
  onEditarFormula,
  atendendo,
}: {
  p: PendenciaLab;
  podeAtender: boolean;
  onAtender: (p: PendenciaLab) => void;
  onConcluir: (p: PendenciaLab) => void;
  onEditarFormula: (p: PendenciaLab) => void;
  atendendo: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              <FlaskConical className="size-4 text-warm-500" />
              {p.tipo === 'formulacao_nova' ? 'Fórmula nova' : 'Revisão de fórmula'}
            </span>
            <span className="rounded-full bg-warm-100 px-2 py-0.5 text-caption text-warm-600">
              {STATUS_LABEL[p.status]}
            </span>
            {p.atrasada && (
              <span className="inline-flex items-center gap-1 rounded-full bg-error-soft px-2 py-0.5 text-caption font-medium text-error">
                <AlertTriangle className="size-3" /> Atrasada
              </span>
            )}
          </div>
          <p className="text-sm text-ink">{p.descricao}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-warm-600">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {URGENCIA_LABEL[p.urgencia]} · prazo {dataHora(p.prazo_limite)}
            </span>
            {p.ncm_proposto && (
              <span>
                NCM {p.ncm_proposto.ncm}
                {p.ncm_proposto.ex_tipi ? ` ${p.ncm_proposto.ex_tipi}` : ''}
              </span>
            )}
            {p.orcamento && <span>Orçamento #{p.orcamento.numero}</span>}
            {p.formula_base && <span>Base: {p.formula_base.nome_produto}</span>}
          </div>
          {p.formula_resultado && (
            <p className={p.status === 'concluida' ? 'text-caption text-success' : 'text-caption text-warm-600'}>
              {p.status === 'concluida' ? 'Concluída → ' : 'Fórmula da pendência: '}
              {p.formula_resultado.nome_produto}
              {p.formula_resultado.versao_codigo ? ` ${p.formula_resultado.versao_codigo}` : ''}
              {p.status !== 'concluida' ? ` (${p.formula_resultado.status})` : ''}
            </p>
          )}
        </div>
        {podeAtender && p.status === 'aberta' && (
          <Button size="sm" onClick={() => onAtender(p)} disabled={atendendo}>
            {atendendo ? <Spinner /> : <ArrowRight className="size-4" />} Atender
          </Button>
        )}
        {podeAtender && p.status === 'em_atendimento' && (
          <div className="flex flex-col gap-2">
            {/* P0-1: retomar a MESMA versão em rascunho (edição in-place). */}
            {p.formula_resultado && p.formula_resultado.status === 'rascunho' && (
              <Button size="sm" onClick={() => onEditarFormula(p)}>
                Editar fórmula
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onConcluir(p)}>
              Concluir
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Jornada de Laboratório (fatia 1) — fila PÚBLICA. Atender: pd|admin. */
export default function Laboratorio() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const podeAtender = !!user && (user.role === 'pd' || user.role === 'admin');
  const [filtro, setFiltro] = React.useState<'abertas' | 'todas' | 'concluida'>('abertas');
  const [concluindo, setConcluindo] = React.useState<PendenciaLab | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['pendencias-lab', filtro],
    queryFn: () => pendenciasLabApi.listar(filtro === 'abertas' ? undefined : filtro),
  });

  const atender = useMutation({
    mutationFn: (p: PendenciaLab) => pendenciasLabApi.atender(p.id),
    onSuccess: (upd) => {
      queryClient.invalidateQueries({ queryKey: ['pendencias-lab'] });
      queryClient.invalidateQueries({ queryKey: ['formulas'] });
      toast.success('Pendência em atendimento — fórmula da pendência criada.');
      // Correção A + P0-1: o atender JÁ criou a fórmula vinculada (rascunho, com
      // o NCM proposto). Leva ao editor IN-PLACE dela — salva a MESMA versão.
      if (upd.formula_resultado) {
        navigate(`/formulas/${upd.formula_resultado.id}/editar`);
      }
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao atender a pendência.');
    },
  });

  const abas: { key: typeof filtro; label: string }[] = [
    { key: 'abertas', label: 'Na fila' },
    { key: 'concluida', label: 'Concluídas' },
    { key: 'todas', label: 'Todas' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laboratório"
        description="Fila de pendências de desenvolvimento e revisão de fórmulas. Atender é restrito ao P&D."
      />

      <div className="flex gap-2">
        {abas.map((a) => (
          <Button
            key={a.key}
            variant={filtro === a.key ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFiltro(a.key)}
          >
            {a.label}
          </Button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Spinner /> <span className="text-sm">Carregando fila…</span>
        </div>
      )}
      {isError && (
        <div className="space-y-3 py-12 text-center">
          <p className="text-sm text-error">Não foi possível carregar a fila.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <Beaker className="size-8 text-warm-400" />
          <p className="text-sm text-muted-foreground">Nenhuma pendência {filtro === 'abertas' ? 'na fila' : 'aqui'}.</p>
        </div>
      )}
      <div className="space-y-3">
        {(data ?? []).map((p) => (
          <CardPendencia
            key={p.id}
            p={p}
            podeAtender={podeAtender}
            onAtender={atender.mutate}
            onConcluir={setConcluindo}
            onEditarFormula={(pend) =>
              pend.formula_resultado && navigate(`/formulas/${pend.formula_resultado.id}/editar`)
            }
            atendendo={atender.isPending}
          />
        ))}
      </div>

      <ConcluirPendenciaModal
        open={!!concluindo}
        onClose={() => setConcluindo(null)}
        pendencia={concluindo}
      />
    </div>
  );
}
