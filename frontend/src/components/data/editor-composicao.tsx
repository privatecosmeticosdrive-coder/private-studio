import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { Plus, Trash2, ArrowLeft, AlertTriangle, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { MpAutocomplete } from '@/components/data/mp-autocomplete';
import { brl, cn } from '@/lib/utils';
import type { ComposicaoItemInput, FormulaDetalhe, Money } from '@/lib/types';
import { formulasApi } from '@/lib/services/formulas';

/** Linha do editor (campos numéricos como string nos inputs controlados). */
interface LinhaComposicao {
  uid: string;
  fase: string;
  ordem: string;
  mp_id: number | null;
  mp_codigo: number | null;
  mp_nome: string;
  preco_kg: Money;
  concentracao_pct: string;
  funcao: string;
}

function novoUid(): string {
  return crypto.randomUUID();
}

function linhaVazia(): LinhaComposicao {
  return {
    uid: novoUid(),
    fase: '',
    ordem: '',
    mp_id: null,
    mp_codigo: null,
    mp_nome: '',
    preco_kg: null,
    concentracao_pct: '',
    funcao: '',
  };
}

/** Semeia as linhas a partir da composição da versão de origem. */
function semear(f: FormulaDetalhe): LinhaComposicao[] {
  if (f.composicao.length === 0) return [linhaVazia()];
  return f.composicao.map((c) => ({
    uid: novoUid(),
    fase: c.fase ?? '',
    ordem: c.ordem != null ? String(c.ordem) : '',
    mp_id: c.mp_id ?? null,
    mp_codigo: c.mp?.codigo ?? null,
    mp_nome: c.mp?.nome ?? c.mp_nome_original ?? '',
    preco_kg: c.mp?.preco_kg_brl ?? null,
    concentracao_pct: c.concentracao_pct != null ? String(c.concentracao_pct) : '',
    funcao: c.funcao ?? '',
  }));
}

/**
 * Editor Vivo de Composição — dois modos (P0-1):
 *  - 'nova-versao' (default): cria NOVA versão a partir de uma fórmula VALIDADA.
 *  - 'rascunho': edita a MESMA versão in-place (PATCH). Save PARCIAL permitido
 *    (soma fora da faixa OK — a faixa é exigida só na VALIDAÇÃO).
 */
export function EditorComposicao({
  formula,
  modo = 'nova-versao',
}: {
  formula: FormulaDetalhe;
  modo?: 'nova-versao' | 'rascunho';
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const emRascunho = modo === 'rascunho';
  // init lazy: o componente só monta com a fórmula já carregada
  const [linhas, setLinhas] = React.useState<LinhaComposicao[]>(() => semear(formula));
  const [descricao, setDescricao] = React.useState(
    emRascunho ? (formula.versao_descricao ?? '') : '',
  );

  const atualizar = (uid: string, patch: Partial<LinhaComposicao>) => {
    setLinhas((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  };
  const remover = (uid: string) => setLinhas((prev) => prev.filter((l) => l.uid !== uid));
  const adicionar = () => setLinhas((prev) => [...prev, linhaVazia()]);

  // --- validação e preview de custo (espelha o backend: Σ conc/100 × preço_kg) ---
  const soma = linhas.reduce((acc, l) => {
    const n = Number(l.concentracao_pct);
    return Number.isNaN(n) ? acc : acc + n;
  }, 0);
  const somaValida = soma >= 99.5 && soma <= 100.5;

  const custoMpKg = linhas.reduce((acc, l) => {
    const conc = Number(l.concentracao_pct);
    const preco = l.mp_id != null && l.preco_kg != null ? Number(l.preco_kg) : null;
    if (preco != null && preco > 0 && !Number.isNaN(conc)) return acc + (conc / 100) * preco;
    return acc;
  }, 0);

  // linhas com conteúdo que NÃO entram no custo (sem MP casada ou MP sem preço)
  const semPreco = linhas.filter((l) => {
    const temConteudo = l.mp_nome.trim() !== '' || l.concentracao_pct.trim() !== '';
    const entraNoCusto = l.mp_id != null && l.preco_kg != null && Number(l.preco_kg) > 0;
    return temConteudo && !entraNoCusto;
  }).length;

  // linha "real" = tem MP casada ou nome livre. Vazias são ignoradas no payload.
  const linhasComConteudo = linhas.filter((l) => l.mp_id != null || l.mp_nome.trim() !== '');
  // Rascunho salva PARCIAL (fórmula incompleta é estado natural); a faixa de
  // soma é exigida na VALIDAÇÃO (backend também barra lá). Nova versão mantém
  // a exigência no save (nasce completa a partir de uma validada).
  const podeSalvar = (emRascunho || somaValida) && linhasComConteudo.length >= 1;

  const montarComposicao = (): ComposicaoItemInput[] =>
    linhasComConteudo.map((l, i) => {
      const conc = Number(l.concentracao_pct);
      return {
        fase: l.fase.trim() || undefined,
        ordem: l.ordem.trim() !== '' ? Number(l.ordem) : i + 1,
        mp_id: l.mp_id ?? undefined,
        // nome livre só quando não há MP casada
        mp_nome_original: l.mp_id == null ? l.mp_nome.trim() || undefined : undefined,
        concentracao_pct: Number.isNaN(conc) ? 0 : conc,
        funcao: l.funcao.trim() || undefined,
      };
    });

  const salvar = useMutation({
    mutationFn: () =>
      emRascunho
        ? formulasApi.atualizar(formula.id, {
            versao_descricao: descricao.trim() || undefined,
            composicao: montarComposicao(),
          })
        : formulasApi.novaVersao(formula.id, {
            versao_descricao: descricao.trim() || undefined,
            composicao: montarComposicao(),
          }),
    onSuccess: (salva) => {
      queryClient.invalidateQueries({ queryKey: ['formulas'] });
      queryClient.invalidateQueries({ queryKey: ['pendencias-lab'] });
      toast.success(
        emRascunho
          ? 'Rascunho salvo (mesma versão).'
          : `Nova versão ${salva.versao_codigo ?? ''} criada.`,
      );
      navigate(`/formulas/${salva.id}`);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao salvar.');
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate(`/formulas/${formula.id}`)}
          className="mb-2 inline-flex items-center gap-1 text-caption text-warm-600 transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> {formula.nome_produto}
        </button>
        <h1 className="font-display text-h1 text-ink">
          {emRascunho ? 'Editar rascunho' : 'Nova versão'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {emRascunho ? (
            <>
              Editando a versão{' '}
              <span className="font-mono text-warm-600">{formula.versao_codigo ?? '—'}</span> em
              rascunho — salva na MESMA versão. Pode salvar parcial; a soma na faixa só é exigida
              ao validar.
            </>
          ) : (
            <>
              Editando a partir de{' '}
              <span className="font-mono text-warm-600">{formula.versao_codigo ?? '—'}</span>. A
              versão atual não é alterada — uma nova versão (rascunho) é criada.
            </>
          )}
        </p>
      </div>

      <div className="max-w-md space-y-2">
        <Label htmlFor="versao_descricao">Descrição da versão</Label>
        <Input
          id="versao_descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="opcional — ex.: redução de fragrância"
        />
      </div>

      {/* Tabela editável */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-sand/60 text-left">
              <th className="w-20 px-3 py-2.5 font-mono text-caption uppercase tracking-wide text-warm-600">Fase</th>
              <th className="w-20 px-3 py-2.5 font-mono text-caption uppercase tracking-wide text-warm-600">Ordem</th>
              <th className="px-3 py-2.5 font-mono text-caption uppercase tracking-wide text-warm-600">Matéria-prima</th>
              <th className="w-28 px-3 py-2.5 text-right font-mono text-caption uppercase tracking-wide text-warm-600">Conc. %</th>
              <th className="px-3 py-2.5 font-mono text-caption uppercase tracking-wide text-warm-600">Função</th>
              <th className="w-12 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.uid} className="border-b border-border last:border-0 align-top">
                <td className="px-3 py-2">
                  <Input
                    value={l.fase}
                    onChange={(e) => atualizar(l.uid, { fase: e.target.value })}
                    className="h-9"
                  />
                </td>
                <td className="px-3 py-2">
                  {/* inteiro SEM spinner nativo (o widget numa coluna estreita
                      cobria a área útil e "não aceitava" digitação). Só dígitos. */}
                  <Input
                    inputMode="numeric"
                    value={l.ordem}
                    onChange={(e) =>
                      atualizar(l.uid, { ordem: e.target.value.replace(/\D/g, '') })
                    }
                    placeholder="—"
                    className="h-9 text-right"
                  />
                </td>
                <td className="px-3 py-2">
                  <MpAutocomplete
                    value={l.mp_nome}
                    matched={l.mp_id != null}
                    onSelect={(mp) =>
                      atualizar(l.uid, {
                        mp_id: mp.id,
                        mp_codigo: mp.codigo,
                        mp_nome: mp.nome,
                        preco_kg: mp.preco_kg_brl,
                      })
                    }
                    onText={(t) =>
                      atualizar(l.uid, { mp_id: null, mp_codigo: null, mp_nome: t, preco_kg: null })
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={l.concentracao_pct}
                    onChange={(e) => atualizar(l.uid, { concentracao_pct: e.target.value })}
                    className="h-9 text-right"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={l.funcao}
                    onChange={(e) => atualizar(l.uid, { funcao: e.target.value })}
                    className="h-9"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remover(l.uid)}
                    aria-label="Remover linha"
                    className="text-error hover:bg-error-soft"
                    disabled={linhas.length === 1}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button variant="ghost" onClick={adicionar}>
        <Plus className="size-4" /> Adicionar ingrediente
      </Button>

      {/* Resumo: soma das concentrações + custo estimado */}
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface p-5 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-caption uppercase tracking-wide text-warm-500">Soma das concentrações</p>
          <p
            className={cn(
              'font-display text-h3 tnum',
              somaValida ? 'text-success' : 'text-error',
            )}
          >
            {soma.toFixed(2)}%
          </p>
          <p className="text-caption text-warm-500">
            {somaValida
              ? 'Dentro da faixa (99,5–100,5%).'
              : emRascunho
                ? 'Fora da faixa — pode salvar o rascunho; a validação exigirá 99,5–100,5%.'
                : 'Deve ficar entre 99,5% e 100,5%.'}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-caption uppercase tracking-wide text-warm-500">Custo MP estimado</p>
          <p className="font-display text-h3 text-ink tnum">{brl(custoMpKg)}/kg</p>
          {semPreco > 0 && (
            <p className="inline-flex items-center gap-1.5 text-caption text-warning">
              <AlertTriangle className="size-3.5 shrink-0" />
              {semPreco} ingrediente{semPreco === 1 ? '' : 's'} sem preço — não entra
              {semPreco === 1 ? '' : 'm'} no custo estimado.
            </p>
          )}
        </div>
      </div>

      {/* Ações */}
      <div className="flex items-center justify-between border-t border-border pt-5">
        <Button variant="ghost" onClick={() => navigate(`/formulas/${formula.id}`)}>
          <ArrowLeft className="size-4" /> Cancelar
        </Button>
        <div className="flex items-center gap-3">
          {!somaValida && !emRascunho && (
            <span className="text-caption text-warm-500">
              Ajuste a soma para 99,5–100,5% para salvar.
            </span>
          )}
          <Button onClick={() => salvar.mutate()} disabled={!podeSalvar || salvar.isPending}>
            {salvar.isPending ? <Spinner className="text-sand" /> : <Save className="size-4" />}
            {emRascunho ? 'Salvar rascunho' : 'Salvar nova versão'}
          </Button>
        </div>
      </div>
    </div>
  );
}
