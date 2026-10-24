import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { FlaskConical, Plus, Search, Trash2, Undo2, Wand2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { brl, cn } from '@/lib/utils';
import type { AcaoFac, AjusteFac, OrcamentoDetalhe } from '@/lib/types';
import { formulasApi } from '@/lib/services/formulas';
import { mpsApi } from '@/lib/services/materias-primas';
import { orcamentosApi } from '@/lib/services/orcamentos';

/** Limites da FAC (espelham backend/src/orcamentos/fac.util.ts). */
const MAX_ITENS = 5;
const MAX_DELTA = 5;

type Linha = {
  mp_id: number | null;
  nome: string;
  concentracao_pct: number;
  preco_kg: number | null;
  fac?: AcaoFac | 'compensacao';
};

const num = (n: number, casas = 3) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Aplica a FAC gravada sobre a composição base (mesma regra do backend, só para exibir). */
function aplicar(base: Linha[], fac: AjusteFac | null, precosNovos: Map<number, number | null>): Linha[] {
  if (!fac) return base;
  const porMp = new Map(fac.itens.map((i) => [i.mp_id, i]));
  const saida: Linha[] = [];
  for (const l of base) {
    const it = l.mp_id != null ? porMp.get(l.mp_id) : undefined;
    if (it) {
      if (it.acao !== 'remover') saida.push({ ...l, concentracao_pct: it.para_pct, fac: it.acao });
      continue;
    }
    const c = fac.compensacao;
    if (c && (c.mp_id != null ? c.mp_id === l.mp_id : c.nome === l.nome)) {
      saida.push({ ...l, concentracao_pct: c.para_pct, fac: 'compensacao' });
      continue;
    }
    saida.push(l);
  }
  for (const it of fac.itens.filter((i) => i.acao === 'adicionar')) {
    saida.push({ mp_id: it.mp_id, nome: it.nome, concentracao_pct: it.para_pct, preco_kg: precosNovos.get(it.mp_id) ?? null, fac: 'adicionar' });
  }
  return saida;
}

const custoKg = (linhas: Linha[]) =>
  linhas.reduce((s, l) => s + (l.preco_kg != null ? (l.concentracao_pct / 100) * l.preco_kg : 0), 0);

const ROTULO_FAC: Record<string, string> = {
  alterar: 'alterada',
  adicionar: 'adicionada',
  remover: 'removida',
  compensacao: 'compensação',
};

/**
 * Fórmula do orçamento com preço das MPs (10/26) e o ajuste do comercial (FAC):
 * até 5 itens e até 5 pontos percentuais, compensando no maior item livre. A
 * fórmula do laboratório não muda; o lab recebe o aviso do que foi alterado.
 */
export function FormulaOrcamento({ orc, podeAjustar }: { orc: OrcamentoDetalhe; podeAjustar: boolean }) {
  const queryClient = useQueryClient();
  const [editando, setEditando] = React.useState(false);
  const [removendo, setRemovendo] = React.useState(false);

  const { data: formula, isLoading } = useQuery({
    queryKey: ['formulas', 'detalhe', orc.formula_id],
    queryFn: () => formulasApi.obter(orc.formula_id!),
    enabled: orc.formula_id != null,
  });

  // Preço das MPs adicionadas pela FAC (fora da fórmula base).
  const adicionadas = (orc.ajuste_fac?.itens ?? []).filter((i) => i.acao === 'adicionar');
  const { data: precosNovos } = useQuery({
    queryKey: ['mps', 'precos-fac', adicionadas.map((i) => i.mp_id).join(',')],
    queryFn: async () => {
      const m = new Map<number, number | null>();
      for (const i of adicionadas) {
        const r = await mpsApi.listar({ q: i.nome, pageSize: 5 });
        const mp = r.data.find((x) => x.id === i.mp_id);
        m.set(i.mp_id, mp?.preco_kg_brl != null ? Number(mp.preco_kg_brl) : null);
      }
      return m;
    },
    enabled: adicionadas.length > 0,
  });

  const remover = useMutation({
    mutationFn: () => orcamentosApi.removerFac(orc.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      toast.success('Ajuste removido: o orçamento voltou à fórmula do laboratório. Recalcule o preço.');
      setRemovendo(false);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao remover o ajuste.');
    },
  });

  if (orc.formula_id == null) return null;

  const base: Linha[] = (formula?.custo.ingredientes ?? []).map((i) => ({
    mp_id: i.mp_id,
    nome: i.nome ?? '(sem nome)',
    concentracao_pct: i.concentracao_pct,
    preco_kg: i.preco_kg_atual,
  }));
  const linhas = aplicar(base, orc.ajuste_fac, precosNovos ?? new Map());
  const fac = orc.ajuste_fac;
  const rascunho = orc.status === 'rascunho';

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-h3 text-ink">Fórmula</h2>
          {formula && (
            <span className="text-sm text-warm-600">
              {formula.nome_produto}
              {formula.versao_codigo ? ` v${formula.versao_codigo}` : ''}
            </span>
          )}
          {fac && (
            <Badge variant="gold" title="Fórmula Ajustada pelo Comercial">
              FAC · {fac.itens.length} {fac.itens.length === 1 ? 'item' : 'itens'} · {num(fac.delta_total_pct)} pts
            </Badge>
          )}
        </div>
        {podeAjustar && rascunho && formula && (
          <div className="flex gap-2">
            {fac && (
              <Button variant="ghost" size="sm" onClick={() => setRemovendo(true)}>
                <Undo2 className="size-4" /> Voltar à fórmula do lab
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
              <Wand2 className="size-4" /> {fac ? 'Editar ajuste (FAC)' : 'Ajustar fórmula (FAC)'}
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner className="text-warm-500" /> Carregando fórmula…
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-caption uppercase tracking-wide text-warm-500">
                  <th className="py-2 pr-3 font-medium">Matéria-prima</th>
                  <th className="py-2 pr-3 text-right font-medium">%</th>
                  <th className="py-2 pr-3 text-right font-medium">R$/kg</th>
                  <th className="py-2 text-right font-medium">Custo na fórmula</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={`${l.mp_id ?? l.nome}-${i}`} className={cn('border-b border-border/60', l.fac && 'bg-gold-500/5')}>
                    <td className="py-1.5 pr-3">
                      <span className="text-ink">{l.nome}</span>
                      {l.fac && (
                        <span className="ml-2 text-caption font-medium text-gold-700">{ROTULO_FAC[l.fac]}</span>
                      )}
                    </td>
                    <td className="tnum py-1.5 pr-3 text-right">{num(l.concentracao_pct)}</td>
                    <td className="tnum py-1.5 pr-3 text-right text-warm-700">
                      {l.preco_kg != null ? brl(l.preco_kg) : <span className="text-error">sem preço</span>}
                    </td>
                    <td className="tnum py-1.5 text-right">
                      {l.preco_kg != null ? brl((l.concentracao_pct / 100) * l.preco_kg) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-sm">
                  <td className="pt-2 font-medium text-ink">Total</td>
                  <td className="tnum pt-2 text-right">{num(linhas.reduce((s, l) => s + l.concentracao_pct, 0))}</td>
                  <td />
                  <td className="tnum pt-2 text-right font-semibold text-ink">{brl(custoKg(linhas))}/kg</td>
                </tr>
                {fac && (
                  <tr className="text-caption text-warm-600">
                    <td colSpan={3} className="pt-1">
                      Fórmula do laboratório, sem o ajuste
                    </td>
                    <td className="tnum pt-1 text-right">{brl(custoKg(base))}/kg</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-caption text-warm-500">
            Preço de cada matéria-prima pela cotação ou última compra vigente. O custo do orçamento é travado no cálculo.
            {fac && rascunho && !orc.calculo ? ' Recalcule o preço para aplicar o ajuste.' : ''}
          </p>
        </>
      )}

      {editando && formula && (
        <EditorFac
          orc={orc}
          base={base}
          onClose={() => setEditando(false)}
        />
      )}
      <ConfirmDialog
        open={removendo}
        onClose={() => setRemovendo(false)}
        onConfirm={() => remover.mutate()}
        loading={remover.isPending}
        title="Voltar à fórmula do laboratório"
        confirmLabel="Remover ajuste"
        description="O ajuste do comercial (FAC) sai deste orçamento, o cálculo é descartado e o laboratório é avisado."
      />
    </Card>
  );
}

type Edicao = { mp_id: number; nome: string; preco_kg: number | null; de: number; para: string; remover: boolean; nova: boolean };

/** Editor da FAC: altera, remove ou adiciona até 5 MPs, movendo até 5 pontos; a diferença vai para o veículo. */
function EditorFac({ orc, base, onClose }: { orc: OrcamentoDetalhe; base: Linha[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const inicial = React.useMemo<Edicao[]>(() => {
    const fac = orc.ajuste_fac;
    const linhas: Edicao[] = base
      .filter((b) => b.mp_id != null)
      .map((b) => {
        const it = fac?.itens.find((i) => i.mp_id === b.mp_id);
        return {
          mp_id: b.mp_id!,
          nome: b.nome,
          preco_kg: b.preco_kg,
          de: b.concentracao_pct,
          para: it && it.acao !== 'remover' ? String(it.para_pct) : String(b.concentracao_pct),
          remover: it?.acao === 'remover',
          nova: false,
        };
      });
    for (const it of fac?.itens.filter((i) => i.acao === 'adicionar') ?? []) {
      linhas.push({ mp_id: it.mp_id, nome: it.nome, preco_kg: null, de: 0, para: String(it.para_pct), remover: false, nova: true });
    }
    return linhas;
  }, [orc.ajuste_fac, base]);
  const [ed, setEd] = React.useState<Edicao[]>(inicial);
  const [busca, setBusca] = React.useState('');

  const { data: resultados } = useQuery({
    queryKey: ['mps', 'busca-fac', busca],
    queryFn: () => mpsApi.listar({ q: busca, pageSize: 8 }),
    enabled: busca.trim().length >= 3,
  });

  const lerPct = (v: string) => Number(v.replace(',', '.'));
  const tocados = ed.filter((e) => e.nova || e.remover || r3(lerPct(e.para)) !== r3(e.de));
  const delta = r3(tocados.reduce((s, e) => s + Math.abs((e.remover ? 0 : lerPct(e.para) || 0) - e.de), 0));
  const liquido = r3(tocados.reduce((s, e) => s + ((e.remover ? 0 : lerPct(e.para) || 0) - e.de), 0));
  const veiculo = base
    .filter((b) => b.mp_id == null || !tocados.some((t) => t.mp_id === b.mp_id))
    .sort((a, b) => b.concentracao_pct - a.concentracao_pct)[0];
  const invalido = tocados.some((e) => !e.remover && !(lerPct(e.para) > 0));
  const estoura = tocados.length > MAX_ITENS || delta > MAX_DELTA;

  const salvar = useMutation({
    mutationFn: () =>
      orcamentosApi.aplicarFac(
        orc.id,
        tocados.map((e) =>
          e.remover
            ? { mp_id: e.mp_id, acao: 'remover' as const }
            : { mp_id: e.mp_id, acao: (e.nova ? 'adicionar' : 'alterar') as AcaoFac, para_pct: r3(lerPct(e.para)) },
        ),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      toast.success('Fórmula ajustada (FAC). O laboratório foi avisado. Recalcule o preço.');
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao salvar o ajuste.');
    },
  });

  const atualizar = (mp_id: number, patch: Partial<Edicao>) =>
    setEd((lista) => lista.map((e) => (e.mp_id === mp_id ? { ...e, ...patch } : e)));

  return (
    <Modal
      open
      onClose={() => !salvar.isPending && onClose()}
      size="lg"
      title="Ajustar fórmula (FAC)"
      description={`Até ${MAX_ITENS} itens e até ${MAX_DELTA} pontos percentuais. A diferença vai para o maior item que você não mexer.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !tocados.length || estoura || invalido}>
            {salvar.isPending && <Spinner className="text-sand" />}
            Salvar ajuste e avisar o laboratório
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-caption">
          <span className={cn('rounded-md px-2 py-1', tocados.length > MAX_ITENS ? 'bg-error-soft text-error' : 'bg-warm-100 text-warm-700')}>
            Itens: <strong className="tnum">{tocados.length}</strong> de {MAX_ITENS}
          </span>
          <span className={cn('rounded-md px-2 py-1', delta > MAX_DELTA ? 'bg-error-soft text-error' : 'bg-warm-100 text-warm-700')}>
            Pontos movidos: <strong className="tnum">{num(delta)}</strong> de {MAX_DELTA}
          </span>
          {liquido !== 0 && veiculo && (
            <span className="rounded-md bg-gold-500/10 px-2 py-1 text-gold-700">
              Compensa em {veiculo.nome}: {num(veiculo.concentracao_pct)}% → {num(r3(veiculo.concentracao_pct - liquido))}%
            </span>
          )}
        </div>

        <div className="max-h-[46vh] overflow-y-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <tbody>
              {ed.map((e) => {
                const mudou = e.nova || e.remover || r3(lerPct(e.para)) !== r3(e.de);
                return (
                  <tr key={e.mp_id} className={cn('border-b border-border/60', mudou && 'bg-gold-500/5', e.remover && 'opacity-60')}>
                    <td className="px-3 py-1.5">
                      <span className={cn('text-ink', e.remover && 'line-through')}>{e.nome}</span>
                      {e.nova && <span className="ml-2 text-caption text-gold-700">nova</span>}
                    </td>
                    <td className="tnum px-2 py-1.5 text-right text-caption text-warm-500">{e.nova ? '—' : `${num(e.de)}%`}</td>
                    <td className="w-28 px-2 py-1">
                      <Input
                        inputMode="decimal"
                        value={e.remover ? '0' : e.para}
                        disabled={e.remover}
                        onChange={(ev) => atualizar(e.mp_id, { para: ev.target.value })}
                        className="h-8 text-right tnum"
                        aria-label={`Percentual de ${e.nome}`}
                      />
                    </td>
                    <td className="w-10 px-2 py-1 text-right">
                      {e.nova ? (
                        <Button variant="ghost" size="sm" onClick={() => setEd((l) => l.filter((x) => x.mp_id !== e.mp_id))} aria-label="Tirar">
                          <Trash2 className="size-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => atualizar(e.mp_id, { remover: !e.remover, para: String(e.de) })}
                          aria-label={e.remover ? 'Manter' : 'Remover da fórmula'}
                          title={e.remover ? 'Manter' : 'Remover da fórmula'}
                        >
                          {e.remover ? <Undo2 className="size-4" /> : <Trash2 className="size-4" />}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-500" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Adicionar matéria-prima: digite 3 letras…"
              className="pl-9"
            />
          </div>
          {busca.trim().length >= 3 && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border">
              {(resultados?.data ?? [])
                .filter((m) => !ed.some((e) => e.mp_id === m.id))
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-warm-100"
                    onClick={() => {
                      setEd((l) => [...l, { mp_id: m.id, nome: m.nome, preco_kg: m.preco_kg_brl != null ? Number(m.preco_kg_brl) : null, de: 0, para: '', remover: false, nova: true }]);
                      setBusca('');
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Plus className="size-3.5 text-gold-700" /> {m.nome}
                    </span>
                    <span className="tnum text-caption text-warm-600">
                      {m.preco_kg_brl != null ? `${brl(Number(m.preco_kg_brl))}/kg` : 'sem preço'}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>

        <p className="flex items-start gap-2 text-caption text-warm-600">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0" />
          A fórmula do laboratório não muda. O orçamento recebe a tag FAC, o laboratório é avisado agora e de novo quando o
          cliente assinar a proposta, para saber o que foi alterado.
        </p>
      </div>
    </Modal>
  );
}
