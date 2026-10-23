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
  if (Number.isNaN(d.getTime())) return '—';
  // Data só-dia (aaaa-mm-dd ou meia-noite UTC do @db.Date) é lida em UTC — senão aparece um dia antes no fuso de SP.
  const soDia = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(iso);
  return d.toLocaleDateString('pt-BR', soDia ? { timeZone: 'UTC' } : undefined);
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

          {/* Integração Omie — códigos do ERP e a última compra (NF de entrada) */}
          <section className="space-y-2">
            <h3 className="font-display text-h3 text-ink">Omie — códigos e última compra</h3>
            {(mp.omie_vinculos ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem código do Omie vinculado: o preço desta MP não vem de nota de compra.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {(mp.omie_vinculos ?? []).map((v) => {
                  const c = v.ultima_compra;
                  return (
                    <li key={v.codigo_omie} className="space-y-1 px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-ink">
                          <span className="font-mono text-warm-700">{v.codigo_omie}</span>
                          {' · '}
                          {v.descricao_omie}
                          {v.unidade_omie ? <span className="text-warm-500"> ({v.unidade_omie})</span> : null}
                        </span>
                        <span className="flex items-center gap-2">
                          {v.principal && <Badge variant="success">alimenta o preço</Badge>}
                          <Badge variant="neutral">
                            {v.origem === 'manual'
                              ? 'vínculo manual'
                              : v.origem === 'auto_exato'
                                ? 'nome igual'
                                : v.origem === 'auto_similar'
                                  ? 'nome semelhante'
                                  : v.origem === 'criado_do_omie'
                                    ? 'criada do Omie'
                                    : v.origem}
                          </Badge>
                        </span>
                      </div>
                      <p className="text-caption text-warm-600">
                        {c ? (
                          <>
                            Última compra {fmtData(c.data)} · NF {c.nf} · {c.fornecedor} ·{' '}
                            <span className="tnum">
                              {c.qtde.toLocaleString('pt-BR')} {c.un} a {brl(c.unitario)}/{c.un}
                            </span>{' '}
                            (com ICMS/IPI/ST)
                            {c.preco_kg != null ? (
                              <>
                                {' → '}
                                <span className="font-medium text-ink tnum">{brl(c.preco_kg)}/kg</span>
                                {c.conversao ? ` (${c.conversao})` : ''}
                              </>
                            ) : (
                              <span className="text-error"> · sem R$/kg: {v.motivo_sem_preco ?? 'sem conversão'}</span>
                            )}
                          </>
                        ) : (
                          <>Sem compra registrada no Omie{v.motivo_sem_preco ? ` (${v.motivo_sem_preco})` : ''}.</>
                        )}
                        {v.sincronizado_em ? ` · sincronizado em ${fmtData(v.sincronizado_em)}` : ''}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

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
                        {h.origem === 'integracao_omie' ? 'Omie (última compra) · ' : ''}
                        {h.fornecedor || 'fornecedor não informado'}
                        {h.registrador?.nome ? ` · ${h.registrador.nome}` : ''}
                        {h.observacoes ? ` · ${h.observacoes}` : ''}
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
