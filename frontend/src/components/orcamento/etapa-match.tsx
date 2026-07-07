import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { Search, Sparkles, Check, FlaskConical, Ban, Beaker, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { StatusFormulaBadge } from '@/components/ui/status-badge';
import { faixaScore } from '@/components/data/score-thermometer';
import { useCan } from '@/auth/use-can';
import { brl, cn } from '@/lib/utils';
import type { Candidata } from '@/lib/types';
import { orcamentosApi } from '@/lib/services/orcamentos';
import type { EtapaProps } from './wizard-types';

function ScorePill({ score }: { score: number }) {
  const { cor, label } = faixaScore(score);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium"
      style={{ color: cor, backgroundColor: `${cor}1a` }}
    >
      <span className="tnum">{Math.round(score)}</span>
      {label}
    </span>
  );
}

/** Etapa 2 — Match de fórmulas (híbrido, custo R$0) + refinar com IA opcional. */
export function EtapaMatch({ form, patch }: EtapaProps) {
  const can = useCan();
  const [candidatas, setCandidatas] = React.useState<Candidata[]>([]);
  // Fallback HONESTO: as mais usadas quando NÃO há match real (rank_textual=0).
  // Nunca renderizadas como resultado — só sob clique explícito, rotuladas.
  const [sugestoes, setSugestoes] = React.useState<Candidata[]>([]);
  const [mostrarSugestoes, setMostrarSugestoes] = React.useState(false);
  const [matchId, setMatchId] = React.useState<number | null>(null);
  const [refinado, setRefinado] = React.useState(false);
  const [buscou, setBuscou] = React.useState(false);

  const buscar = useMutation({
    mutationFn: () =>
      orcamentosApi.matchFormulas({
        nome_projeto: form.produto || undefined,
        // categoria entra no texto (pesa no ts_rank) e NÃO como filtro estruturado:
        // a base importada tem categoria nula em 100% das fórmulas (zeraria o match).
        briefing_tecnico: form.categoria || undefined,
        nivel: form.nivel || undefined,
        budget_mp: form.budget_mp ? Number(form.budget_mp) : undefined,
      }),
    onSuccess: (r) => {
      setCandidatas(r.candidatas);
      setSugestoes(r.sugestoes_por_uso ?? []);
      setMostrarSugestoes(false);
      setMatchId(r.match_id);
      setRefinado(false);
      setBuscou(true);
      // sai do modo "sem fórmula" ao buscar — volta a exibir a lista de candidatas
      patch({ sem_formula: false, budget_mp: '' });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao buscar fórmulas.');
    },
  });

  const refinar = useMutation({
    mutationFn: () => orcamentosApi.refinarIa(matchId!),
    onSuccess: (r) => {
      setCandidatas(r.top_5_reranqueado);
      setMatchId(r.match_id);
      setRefinado(true);
      toast.success(
        r.custo_estimado_brl > 0
          ? `Refinado com IA (~${brl(r.custo_estimado_brl)}).`
          : 'Refinado (modo mock — sem custo).',
      );
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao refinar com IA.');
    },
  });

  const selecionar = (c: Candidata) => {
    patch({
      formula_id: c.formula_id,
      formula_nome: `${c.nome_produto}${c.versao_codigo ? ` ${c.versao_codigo}` : ''}`,
      sem_formula: false,
    });
  };

  const usarSemFormula = () => {
    patch({ sem_formula: true, formula_id: null, formula_nome: '' });
  };

  // HOOK da frente futura "Jornada de Laboratório": quando não há fórmula que
  // atenda o briefing, daqui nascerá a solicitação ao lab (urgência mesmo dia /
  // 2-3 dias / 7 dias + pendência pro time). Por ora, PLACEHOLDER deliberado.
  const solicitarLaboratorio = () => {
    toast.info(
      'Solicitar ao Laboratório — em breve: pedido de desenvolvimento de fórmula com prazo e acompanhamento.',
    );
  };

  /** Card de fórmula. Em modo sugestão NÃO mostra o score composto (ele é
   *  dominado por nº de usos quando rank=0 — leria como relevância falsa). */
  const renderCard = (c: Candidata, sugestao: boolean) => {
    const selecionada = form.formula_id === c.formula_id;
    return (
      <button
        type="button"
        key={c.formula_id}
        onClick={() => selecionar(c)}
        className={cn(
          'flex w-full items-start gap-4 rounded-lg border p-4 text-left transition-colors',
          selecionada
            ? 'border-gold-500 bg-gold-500/5 ring-1 ring-gold-500'
            : 'border-border bg-surface hover:border-warm-300',
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
            selecionada ? 'border-gold-500 bg-gold-500 text-ink' : 'border-border text-transparent',
          )}
        >
          <Check className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              <FlaskConical className="size-4 text-warm-500" />
              {c.nome_produto}
            </span>
            {c.versao_codigo && (
              <span className="font-mono text-caption text-warm-500">{c.versao_codigo}</span>
            )}
            <StatusFormulaBadge status={c.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-warm-600">
            <span>
              Custo MP: <span className="tnum text-ink">{brl(c.custo_mp_kg)}/kg</span>
            </span>
            <span>
              {c.n_orcamentos} orçamento{c.n_orcamentos === 1 ? '' : 's'}
            </span>
            {c.categoria && <span>{c.categoria}</span>}
            {c.validada_recente && <span className="text-success">Validada recente</span>}
          </div>
          {c.justificativa_ia && (
            <p className="text-caption italic text-warm-600">{c.justificativa_ia}</p>
          )}
        </div>
        {sugestao ? (
          <span className="inline-flex items-center rounded-full bg-warm-100 px-2.5 py-1 text-caption font-medium text-warm-600">
            {c.n_orcamentos} uso{c.n_orcamentos === 1 ? '' : 's'}
          </span>
        ) : (
          <ScorePill score={c.score} />
        )}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-h3 text-ink">Fórmula</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Match híbrido por briefing e categoria (custo R$0). A fórmula é usada como está — edição de
          composição chega em etapa futura.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {can('match-formulas') && (
          <Button onClick={() => buscar.mutate()} disabled={buscar.isPending}>
            {buscar.isPending ? <Spinner className="text-sand" /> : <Search className="size-4" />}
            {buscou ? 'Buscar novamente' : 'Buscar fórmulas'}
          </Button>
        )}
        {matchId != null && candidatas.length > 0 && can('match-formulas') && (
          <Button variant="outline" onClick={() => refinar.mutate()} disabled={refinar.isPending || refinado}>
            {refinar.isPending ? <Spinner /> : <Sparkles className="size-4" />}
            {refinado ? 'Refinado com IA' : 'Refinar com IA'}
          </Button>
        )}
        <Button
          variant={form.sem_formula ? 'secondary' : 'ghost'}
          onClick={usarSemFormula}
          className={cn(form.sem_formula && 'ring-1 ring-gold-500')}
        >
          <Ban className="size-4" /> Sem fórmula
        </Button>
      </div>

      {/* Sem fórmula: base de MP manual */}
      {form.sem_formula && (
        <div className="max-w-sm space-y-2 rounded-md border border-border bg-sand/40 p-4">
          <Label htmlFor="budget_mp">Custo base de MP (R$/kg)</Label>
          <Input
            id="budget_mp"
            type="number"
            step="0.01"
            min="0"
            value={form.budget_mp}
            onChange={(e) => patch({ budget_mp: e.target.value })}
            placeholder="ex.: 45.00"
          />
          <p className="text-caption text-warm-500">
            Sem fórmula, o cálculo usa este custo de matéria-prima por kg.
          </p>
        </div>
      )}

      {/* Lista de candidatas */}
      {!form.sem_formula && (
        <div className="space-y-3">
          {!buscou && !buscar.isPending && (
            <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Clique em “Buscar fórmulas” para ranquear candidatas pelo briefing.
            </p>
          )}

          {/* ESTADO VAZIO HONESTO: sem match real, nada de sequência-padrão como resultado. */}
          {buscou && candidatas.length === 0 && (
            <div className="space-y-4 rounded-md border border-dashed border-border px-6 py-10 text-center">
              <p className="text-sm font-medium text-ink">Nenhuma fórmula corresponde ao briefing.</p>
              <p className="text-caption text-warm-600">
                Ajuste o briefing, siga sem fórmula, ou solicite o desenvolvimento ao laboratório.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="outline" size="sm" onClick={solicitarLaboratorio}>
                  <Beaker className="size-4" /> Solicitar ao Laboratório
                </Button>
                {sugestoes.length > 0 && !mostrarSugestoes && (
                  <Button variant="ghost" size="sm" onClick={() => setMostrarSugestoes(true)}>
                    <ListOrdered className="size-4" /> Ver fórmulas mais usadas
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Sugestões por uso — reveladas SÓ por clique, rotuladas como não-match. */}
          {buscou && candidatas.length === 0 && mostrarSugestoes && sugestoes.length > 0 && (
            <div className="space-y-3">
              <p className="text-caption font-medium uppercase tracking-wide text-warm-500">
                Sugestões por uso — sem correspondência ao briefing
              </p>
              {sugestoes.map((c) => renderCard(c, true))}
            </div>
          )}

          {candidatas.map((c) => renderCard(c, false))}
        </div>
      )}
    </div>
  );
}
