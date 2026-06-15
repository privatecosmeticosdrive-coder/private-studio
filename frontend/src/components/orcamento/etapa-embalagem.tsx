import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Check, Package, Ban, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { PrecoBadge } from '@/components/ui/status-badge';
import { brl, cn } from '@/lib/utils';
import { TIPO_EMBALAGEM_LABEL, type Embalagem } from '@/lib/types';
import { embalagensApi } from '@/lib/services/embalagens';
import type { EtapaProps } from './wizard-types';

/** Embalagem sem preço cotado torna o orçamento preliminar (Doc 2d §B4). */
function semCotacao(e: Embalagem): boolean {
  return e.preco_un_brl == null || e.preco_estimado;
}

/** Etapa 3 — Embalagem do catálogo. */
export function EtapaEmbalagem({ form, patch }: EtapaProps) {
  const [q, setQ] = React.useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['embalagens', 'wizard', q],
    queryFn: () => embalagensApi.listar({ q: q || undefined, ativo: true, pageSize: 50 }),
  });

  const itens = data?.data ?? [];

  const selecionar = (e: Embalagem) => {
    patch({ embalagem_id: e.id, embalagem_nome: e.nome, sem_embalagem: false });
  };

  // toggle: liga/desliga "a granel". Ao alternar, limpa a embalagem selecionada.
  const toggleSemEmbalagem = () => {
    patch({ sem_embalagem: !form.sem_embalagem, embalagem_id: null, embalagem_nome: '' });
  };

  const selecionada = itens.find((e) => e.id === form.embalagem_id);
  const preliminar = !form.sem_embalagem && selecionada != null && semCotacao(selecionada);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-h3 text-ink">Embalagem</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecione um item do catálogo ou siga a granel. Embalagem sem cotação deixa o orçamento
          preliminar.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, tipo, fornecedor…"
            className="pl-9"
            disabled={form.sem_embalagem}
          />
        </div>
        <Button
          variant={form.sem_embalagem ? 'secondary' : 'ghost'}
          onClick={toggleSemEmbalagem}
          aria-pressed={form.sem_embalagem}
          className={cn(form.sem_embalagem && 'ring-1 ring-gold-500')}
        >
          <Ban className="size-4" />
          {form.sem_embalagem ? 'A granel (clique para escolher embalagem)' : 'Sem embalagem (a granel)'}
        </Button>
      </div>

      {preliminar && (
        <p className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-caption text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          Embalagem sem cotação — o custo entra como R$0 e o orçamento será preliminar.
        </p>
      )}

      {!form.sem_embalagem && (
        <div className="space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner className="text-warm-500" /> Carregando catálogo…
            </div>
          )}

          {isError && (
            <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-error">
              Falha ao carregar o catálogo de embalagens.
            </p>
          )}

          {!isLoading && !isError && itens.length === 0 && (
            <p className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              {q ? 'Nenhuma embalagem encontrada para a busca.' : 'Catálogo vazio.'}
            </p>
          )}

          {itens.map((e) => {
            const sel = form.embalagem_id === e.id;
            return (
              <button
                type="button"
                key={e.id}
                onClick={() => selecionar(e)}
                className={cn(
                  'flex w-full items-start gap-4 rounded-lg border p-4 text-left transition-colors',
                  sel
                    ? 'border-gold-500 bg-gold-500/5 ring-1 ring-gold-500'
                    : 'border-border bg-surface hover:border-warm-300',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                    sel ? 'border-gold-500 bg-gold-500 text-ink' : 'border-border text-transparent',
                  )}
                >
                  <Check className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                      <Package className="size-4 text-warm-500" />
                      {e.nome}
                    </span>
                    <span className="text-caption text-warm-500">
                      {TIPO_EMBALAGEM_LABEL[e.tipo] ?? e.tipo}
                    </span>
                    <PrecoBadge estimado={e.preco_estimado} semPreco={e.preco_un_brl == null} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-warm-600">
                    <span>
                      Preço: <span className="tnum text-ink">{brl(e.preco_un_brl)}/un</span>
                    </span>
                    {e.volume_ml != null && <span className="tnum">{String(e.volume_ml)} mL</span>}
                    {e.fornecedor && <span>{e.fornecedor}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
