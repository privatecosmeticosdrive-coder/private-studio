import { useQuery } from '@tanstack/react-query';
import { Pencil, Tag, TrendingUp } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { StatusFormulaBadge, VencidaBadge } from '@/components/ui/status-badge';
import { PriceHistoryChart } from '@/components/data/price-history-chart';
import { brl, cotacaoVencida } from '@/lib/utils';
import { useCan } from '@/auth/use-can';
import type { MateriaPrima } from '@/lib/types';
import { mpsApi } from '@/lib/services/materias-primas';

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-caption uppercase tracking-wide text-warm-500">{label}</p>
      <p className="text-sm text-ink">{children}</p>
    </div>
  );
}

interface MpDetailModalProps {
  open: boolean;
  onClose: () => void;
  mp: MateriaPrima | null;
  onEditar: (mp: MateriaPrima) => void;
  onAtualizarPreco: (mp: MateriaPrima) => void;
}

export function MpDetailModal({ open, onClose, mp, onEditar, onAtualizarPreco }: MpDetailModalProps) {
  const can = useCan();
  const codigo = mp?.codigo;

  const grafico = useQuery({
    queryKey: ['mps', codigo, 'historico', 'grafico'],
    queryFn: () => mpsApi.historicoGrafico(codigo!),
    enabled: open && codigo != null,
  });
  const historico = useQuery({
    queryKey: ['mps', codigo, 'historico'],
    queryFn: () => mpsApi.historico(codigo!),
    enabled: open && codigo != null,
  });
  const formulas = useQuery({
    queryKey: ['mps', codigo, 'formulas'],
    queryFn: () => mpsApi.formulas(codigo!),
    enabled: open && codigo != null,
  });

  const semPreco = mp?.preco_kg_brl == null || mp?.preco_kg_brl === '';
  const vencida = mp ? cotacaoVencida(mp.data_cotacao) : false;
  const aumento = mp?.aumento_pct != null && mp?.aumento_pct !== '' ? Number(mp.aumento_pct) : null;
  const pontos = (grafico.data ?? []).map((p) => ({ data: p.data, preco: p.preco }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={mp?.nome ?? 'Matéria-prima'}
      description={mp ? `Código ${mp.codigo}` : undefined}
      footer={
        mp && (
          <>
            {can('mp:atualizar-preco') && (
              <Button variant="outline" onClick={() => onAtualizarPreco(mp)}>
                <Tag className="size-4" /> Atualizar preço
              </Button>
            )}
            {can('mp:escrever') && (
              <Button onClick={() => onEditar(mp)}>
                <Pencil className="size-4" /> Editar
              </Button>
            )}
          </>
        )
      }
    >
      {mp && (
        <div className="space-y-6">
          {/* badges de alerta */}
          {(vencida || mp.flag_aumento_relevante) && (
            <div className="flex flex-wrap gap-2">
              {vencida && <VencidaBadge />}
              {mp.flag_aumento_relevante && (
                <Badge variant="error">
                  <TrendingUp className="size-3" /> Aumento relevante
                </Badge>
              )}
            </div>
          )}

          {/* resumo */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Campo label="Preço/kg">
              <span className="font-medium tnum">{semPreco ? '—' : brl(mp.preco_kg_brl)}</span>
            </Campo>
            <Campo label="Preço anterior">{brl(mp.preco_anterior)}</Campo>
            <Campo label="Variação">
              {aumento != null ? (
                <span className={aumento > 0 ? 'text-error' : aumento < 0 ? 'text-success' : ''}>
                  {aumento > 0 ? '+' : ''}
                  {aumento}%
                </span>
              ) : (
                '—'
              )}
            </Campo>
            <Campo label="Fornecedor">{mp.fornecedor || '—'}</Campo>
            <Campo label="Embalagem mínima">{mp.embalagem_minima || '—'}</Campo>
            <Campo label="Fórmulas que usam">{mp.n_formulas_uso}</Campo>
            <Campo label="Última cotação">{fmtData(mp.data_cotacao)}</Campo>
            <Campo label="Validade da cotação">{fmtData(mp.validade_cotacao)}</Campo>
            <Campo label="Situação">
              {mp.ativo ? (
                <Badge variant="success">Ativa</Badge>
              ) : (
                <Badge variant="neutral">Inativa</Badge>
              )}
            </Campo>
          </div>

          {mp.observacoes && (
            <div className="rounded-md bg-sand/60 px-3 py-2 text-sm text-warm-700">{mp.observacoes}</div>
          )}

          {/* grafico */}
          <section className="space-y-2">
            <h3 className="font-display text-h3 text-ink">Evolução de preço</h3>
            {grafico.isLoading ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Spinner /> <span className="ml-2 text-sm">Carregando…</span>
              </div>
            ) : (
              <PriceHistoryChart pontos={pontos} unidade="/kg" />
            )}
          </section>

          {/* timeline de historico */}
          <section className="space-y-2">
            <h3 className="font-display text-h3 text-ink">Histórico de cotações</h3>
            {historico.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (historico.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma cotação registrada.</p>
            ) : (
              <ol className="space-y-3 border-l border-border pl-4">
                {(historico.data ?? []).map((h) => {
                  const v = h.variacao_pct != null && h.variacao_pct !== '' ? Number(h.variacao_pct) : null;
                  return (
                    <li key={h.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-gold-500" aria-hidden />
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-ink tnum">{brl(h.preco_kg_brl)}/kg</span>
                        <span className="text-caption text-warm-500 tnum">{fmtData(h.data_cotacao)}</span>
                      </div>
                      <p className="text-caption text-warm-600">
                        {v != null && v !== 0 && (
                          <span className={v > 0 ? 'text-error' : 'text-success'}>
                            {v > 0 ? '+' : ''}
                            {v}%{' · '}
                          </span>
                        )}
                        {h.fornecedor || 'fornecedor não informado'}
                        {h.registrador?.nome ? ` · ${h.registrador.nome}` : ''}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* formulas que usam */}
          <section className="space-y-2">
            <h3 className="font-display text-h3 text-ink">Fórmulas que usam</h3>
            {formulas.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (formulas.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma fórmula utiliza esta matéria-prima.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {(formulas.data ?? []).map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-ink">
                      {f.nome_produto}
                      {f.versao_codigo ? (
                        <span className="ml-1 font-mono text-warm-500">{f.versao_codigo}</span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-3">
                      {f.custo_mp_kg != null && (
                        <span className="tnum text-warm-700">{brl(f.custo_mp_kg)}/kg</span>
                      )}
                      <StatusFormulaBadge status={f.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
