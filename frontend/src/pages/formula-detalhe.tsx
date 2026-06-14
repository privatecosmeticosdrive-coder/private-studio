import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { StatusFormulaBadge, OrigemBadge } from '@/components/ui/status-badge';
import { ScoreThermometer } from '@/components/data/score-thermometer';
import { brl } from '@/lib/utils';
import type { Money } from '@/lib/types';
import { formulasApi } from '@/lib/services/formulas';

function pct(v: Money): string {
  if (v == null || v === '') return '—';
  return `${Number(v)}%`;
}

export default function FormulaDetalhe() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const idValido = Number.isInteger(id) && id > 0;

  const detalhe = useQuery({
    queryKey: ['formulas', id],
    queryFn: () => formulasApi.obter(id),
    enabled: idValido,
  });
  const versoes = useQuery({
    queryKey: ['formulas', id, 'versoes'],
    queryFn: () => formulasApi.versoes(id),
    enabled: idValido,
  });

  const voltar = (
    <Link
      to="/formulas"
      className="inline-flex items-center gap-1.5 text-sm text-warm-600 transition-colors hover:text-ink"
    >
      <ArrowLeft className="size-4" /> Fórmulas
    </Link>
  );

  if (!idValido) {
    return (
      <div className="space-y-6">
        {voltar}
        <p className="text-sm text-muted-foreground">Identificador de fórmula inválido.</p>
      </div>
    );
  }

  if (detalhe.isLoading) {
    return (
      <div className="space-y-6">
        {voltar}
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Spinner /> <span className="text-sm">Carregando fórmula…</span>
        </div>
      </div>
    );
  }

  if (detalhe.isError || !detalhe.data) {
    return (
      <div className="space-y-6">
        {voltar}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="grid size-12 place-items-center rounded-lg bg-error-soft text-error">
              <AlertTriangle className="size-6" />
            </div>
            <p className="font-medium text-ink">Não foi possível carregar a fórmula</p>
            <Button variant="outline" size="sm" onClick={() => detalhe.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const f = detalhe.data;
  const custo = f.custo;
  const familia = versoes.data?.versoes ?? [];

  return (
    <div className="space-y-6">
      {voltar}

      {/* Cabecalho */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-h1 text-ink">{f.nome_produto}</h1>
          {f.versao_codigo && (
            <span className="font-mono text-sm text-warm-500">{f.versao_codigo}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusFormulaBadge status={f.status} />
          <OrigemBadge origem={f.origem} />
          {f.categoria && <Badge variant="neutral">{f.categoria}</Badge>}
          {f.cliente && <span className="text-sm text-muted-foreground">Cliente: {f.cliente.nome}</span>}
          {f.formula_mae && (
            <Link
              to={`/formulas/${f.formula_mae.id}`}
              className="text-sm text-gold-600 underline-offset-2 hover:underline"
            >
              ← Fórmula-mãe: {f.formula_mae.nome_produto}
            </Link>
          )}
        </div>
      </div>

      {/* Custo */}
      <Card>
        <CardHeader>
          <CardTitle>Custo de matéria-prima</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-8">
          <ScoreThermometer score={custo.score_global} />
          <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            <div className="space-y-0.5">
              <p className="text-caption uppercase tracking-wide text-warm-500">Custo atual</p>
              <p className="font-display text-h3 text-ink tnum">{brl(custo.custo_mp_kg_atual)}/kg</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-caption uppercase tracking-wide text-warm-500">Snapshot gravado</p>
              <p className="text-h3 text-warm-700 tnum">
                {custo.custo_mp_kg_snapshot != null ? `${brl(custo.custo_mp_kg_snapshot)}/kg` : '—'}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-caption uppercase tracking-wide text-warm-500">Variação vs snapshot</p>
              <p className="text-h3 tnum">
                {custo.delta_pct != null ? (
                  <span
                    className={
                      custo.delta_pct > 0
                        ? 'text-error'
                        : custo.delta_pct < 0
                          ? 'text-success'
                          : 'text-warm-700'
                    }
                  >
                    {custo.delta_pct > 0 ? '+' : ''}
                    {custo.delta_pct}%
                  </span>
                ) : (
                  '—'
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Composicao */}
      <Card>
        <CardHeader>
          <CardTitle>Composição</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {f.composicao.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem composição registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-4 font-mono text-caption uppercase tracking-wide text-warm-600">Fase</th>
                    <th className="py-2 pr-4 font-mono text-caption uppercase tracking-wide text-warm-600">Ordem</th>
                    <th className="py-2 pr-4 font-mono text-caption uppercase tracking-wide text-warm-600">Matéria-prima</th>
                    <th className="py-2 pr-4 text-right font-mono text-caption uppercase tracking-wide text-warm-600">Conc. %</th>
                    <th className="py-2 font-mono text-caption uppercase tracking-wide text-warm-600">Função</th>
                  </tr>
                </thead>
                <tbody>
                  {f.composicao.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-4 text-warm-700">{c.fase || '—'}</td>
                      <td className="py-2.5 pr-4 text-warm-700 tnum">{c.ordem ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-ink">
                        {c.mp ? (
                          <span>
                            <span className="font-mono text-warm-500">{c.mp.codigo}</span> · {c.mp.nome}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            {c.mp_nome_original || '—'}
                            <Badge variant="warning">sem match</Badge>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-ink tnum">{pct(c.concentracao_pct)}</td>
                      <td className="py-2.5 text-warm-700">{c.funcao || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Versoes */}
      {familia.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Versões da família ({familia.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border">
              {familia.map((v) => {
                const atual = v.id === f.id;
                return (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    {atual ? (
                      <span className="inline-flex items-center gap-2 text-ink">
                        <span className="font-mono text-warm-500">{v.versao_codigo}</span>
                        {v.versao_descricao || f.nome_produto}
                        <Badge variant="gold">atual</Badge>
                      </span>
                    ) : (
                      <Link
                        to={`/formulas/${v.id}`}
                        className="inline-flex items-center gap-2 text-ink transition-colors hover:text-gold-600"
                      >
                        <span className="font-mono text-warm-500">{v.versao_codigo}</span>
                        {v.versao_descricao || f.nome_produto}
                      </Link>
                    )}
                    <span className="flex items-center gap-3">
                      {v.custo_mp_kg != null && (
                        <span className="tnum text-warm-700">{brl(v.custo_mp_kg)}/kg</span>
                      )}
                      <StatusFormulaBadge status={v.status} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
