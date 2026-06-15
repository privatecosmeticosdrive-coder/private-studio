import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { NIVEIS_ORCAMENTO, NIVEL_ORCAMENTO_LABEL } from '@/lib/types';
import { clientesApi } from '@/lib/services/clientes';
import type { EtapaProps } from './wizard-types';

/** Etapa 1 — Briefing do orçamento. */
export function EtapaBriefing({ form, patch }: EtapaProps) {
  const { data: clientes, isLoading: carregandoClientes } = useQuery({
    queryKey: ['clientes', 'lista'],
    queryFn: () => clientesApi.listar(),
  });

  const qtdInvalida = (() => {
    const n = parseInt(form.quantidade, 10);
    return !Number.isInteger(n) || n < 1;
  })();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-h3 text-ink">Briefing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dados do produto e do lote. A quantidade impacta diretamente o custo de mão de obra.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="produto">Produto *</Label>
          <Input
            id="produto"
            value={form.produto}
            onChange={(e) => patch({ produto: e.target.value })}
            placeholder="ex.: Sérum facial vitamina C"
          />
          {form.produto.trim().length > 0 && form.produto.trim().length < 2 && (
            <p className="text-caption text-error">Informe ao menos 2 caracteres.</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="nivel">Nível</Label>
          <Select
            id="nivel"
            value={form.nivel}
            onChange={(e) => patch({ nivel: e.target.value as typeof form.nivel })}
          >
            <option value="">Selecione…</option>
            {NIVEIS_ORCAMENTO.map((n) => (
              <option key={n} value={n}>
                {NIVEL_ORCAMENTO_LABEL[n]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cliente">Cliente</Label>
          <div className="relative">
            <Select
              id="cliente"
              value={form.cliente_id}
              onChange={(e) => patch({ cliente_id: e.target.value })}
              disabled={carregandoClientes}
            >
              <option value="">Sem cliente</option>
              {(clientes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
            {carregandoClientes && (
              <Spinner className="absolute right-9 top-1/2 -translate-y-1/2 text-warm-500" />
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="categoria">Categoria</Label>
          <Input
            id="categoria"
            value={form.categoria}
            onChange={(e) => patch({ categoria: e.target.value })}
            placeholder="ex.: skincare, cabelos, maquiagem"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="volume_un">Volume por unidade (mL/g)</Label>
          <Input
            id="volume_un"
            type="number"
            step="0.01"
            min="0"
            value={form.volume_un}
            onChange={(e) => patch({ volume_un: e.target.value })}
            placeholder="ex.: 30"
          />
          <p className="text-caption text-warm-500">Em branco assume 100 mL/g no cálculo.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="quantidade">Quantidade do lote *</Label>
          <Input
            id="quantidade"
            type="number"
            step="1"
            min="1"
            value={form.quantidade}
            onChange={(e) => patch({ quantidade: e.target.value })}
          />
          {qtdInvalida ? (
            <p className="text-caption text-error">Informe um número inteiro ≥ 1.</p>
          ) : (
            <p className="text-caption text-warm-500">Unidades do lote. Afeta o custo de MO.</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="produto_referencia">Produto de referência</Label>
        <Input
          id="produto_referencia"
          value={form.produto_referencia}
          onChange={(e) => patch({ produto_referencia: e.target.value })}
          placeholder="opcional — benchmark de mercado"
        />
      </div>

      <div className="rounded-md border border-border bg-sand/40 p-4">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-4 accent-gold-500"
            checked={form.requer_amostra}
            onChange={(e) => patch({ requer_amostra: e.target.checked })}
          />
          <span className="text-sm font-medium text-ink">Requer amostra</span>
        </label>
        {form.requer_amostra && (
          <div className="mt-3 max-w-xs space-y-2">
            <Label htmlFor="amostra_qtd">Quantidade de amostras</Label>
            <Input
              id="amostra_qtd"
              type="number"
              step="1"
              min="1"
              value={form.amostra_qtd}
              onChange={(e) => patch({ amostra_qtd: e.target.value })}
              placeholder="opcional"
            />
          </div>
        )}
      </div>
    </div>
  );
}
