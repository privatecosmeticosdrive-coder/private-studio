import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { ArrowLeft, Calculator, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useCan } from '@/auth/use-can';
import { cn } from '@/lib/utils';
import type { OrcamentoDetalhe } from '@/lib/types';
import { orcamentosApi, type CriarOrcamentoPayload } from '@/lib/services/orcamentos';
import { ResultadoCalculo } from './resultado-calculo';
import type { EtapaProps, OrcamentoForm } from './wizard-types';

interface EtapaCalculoProps extends EtapaProps {
  onVoltar: () => void;
}

const PRESETS_UN_MIN = [8, 6, 4, 2, 1];

/** Converte campo string em número opcional (vazio → undefined). */
function num(s: string): number | undefined {
  const t = s.trim();
  if (t === '') return undefined;
  const v = Number(t);
  return Number.isNaN(v) ? undefined : v;
}

/** Monta o payload do briefing (CreateOrcamentoDto) a partir do formulário. */
function montarPayload(form: OrcamentoForm): CriarOrcamentoPayload {
  return {
    produto: form.produto.trim(),
    cliente_id: form.cliente_id || undefined,
    categoria: form.categoria || undefined,
    nivel: form.nivel || undefined,
    volume_un: num(form.volume_un),
    quantidade: num(form.quantidade),
    margem_pct: num(form.margem_pct),
    produto_referencia: form.produto_referencia || undefined,
    requer_amostra: form.requer_amostra,
    amostra_qtd: form.requer_amostra ? num(form.amostra_qtd) : undefined,
    modo_operacao: form.modo_operacao,
    un_min: num(form.un_min),
    formula_id: form.sem_formula ? undefined : form.formula_id ?? undefined,
    embalagem_id: form.sem_embalagem ? undefined : form.embalagem_id ?? undefined,
    sem_embalagem: form.sem_embalagem,
    budget_mp: form.sem_formula ? num(form.budget_mp) : undefined,
  };
}

/** Etapa 4 — Cálculo determinístico (Fase 1). */
export function EtapaCalculo({ form, patch, onVoltar }: EtapaCalculoProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const can = useCan();
  // id do orçamento já criado nesta sessão (recalcula no mesmo registro).
  const [orcId, setOrcId] = React.useState<string | null>(null);
  const [resultado, setResultado] = React.useState<OrcamentoDetalhe | null>(null);

  const unMin = num(form.un_min);
  const margem = num(form.margem_pct);
  const unMinValido = unMin != null && unMin >= 0.1 && unMin <= 60;
  const margemValida = margem != null && margem >= 0 && margem <= 99;
  // sem fórmula, o custo de MP só vem do budget — exige base > 0 para evitar preço sem base.
  const budget = num(form.budget_mp);
  const baseMpOk = !form.sem_formula || (budget != null && budget > 0);
  const podeCalcular = can('orcamento:escrever') && unMinValido && margemValida && baseMpOk;

  const calcular = useMutation({
    mutationFn: async () => {
      const payload = montarPayload(form);
      // cria na primeira vez; depois atualiza o briefing e recalcula o mesmo registro.
      const orc = orcId
        ? await orcamentosApi.atualizar(orcId, payload)
        : await orcamentosApi.criar(payload);
      const calculado = await orcamentosApi.calcular(orc.id, {
        un_min: unMin,
        margem_pct: margem,
      });
      return calculado;
    },
    onSuccess: (orc) => {
      setOrcId(orc.id);
      setResultado(orc);
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      toast.success(`Orçamento #${orc.numero} calculado.`);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao calcular o orçamento.');
    },
  });

  const calc = resultado?.calculo ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-h3 text-ink">Cálculo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajuste produtividade e margem. Impostos, IPI e frete vêm do sistema (somente leitura).
        </p>
      </div>

      {/* Inputs editáveis */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="un_min">Produtividade (un/min) *</Label>
          <div className="mb-2 flex flex-wrap gap-2">
            {PRESETS_UN_MIN.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={num(form.un_min) === p ? 'secondary' : 'ghost'}
                className={cn(num(form.un_min) === p && 'ring-1 ring-gold-500')}
                onClick={() => patch({ un_min: String(p) })}
              >
                {p}
              </Button>
            ))}
          </div>
          <Input
            id="un_min"
            type="number"
            step="0.1"
            min="0.1"
            max="60"
            value={form.un_min}
            onChange={(e) => patch({ un_min: e.target.value })}
            placeholder="unidades por minuto"
          />
          {form.un_min.trim() !== '' && !unMinValido && (
            <p className="text-caption text-error">Informe um valor entre 0,1 e 60.</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="margem_pct">Margem (%) *</Label>
          <Input
            id="margem_pct"
            type="number"
            step="0.5"
            min="0"
            max="99"
            value={form.margem_pct}
            onChange={(e) => patch({ margem_pct: e.target.value })}
          />
          {form.margem_pct.trim() !== '' && !margemValida && (
            <p className="text-caption text-error">Informe um valor entre 0 e 99.</p>
          )}
        </div>
      </div>

      <div>
        <Button onClick={() => calcular.mutate()} disabled={!podeCalcular || calcular.isPending}>
          {calcular.isPending ? <Spinner className="text-sand" /> : <Calculator className="size-4" />}
          {resultado ? 'Recalcular' : 'Calcular'}
        </Button>
        {!unMinValido && (
          <p className="mt-2 text-caption text-warm-500">
            Informe a produtividade (un/min) para calcular.
          </p>
        )}
        {unMinValido && margemValida && !baseMpOk && (
          <p className="mt-2 text-caption text-warning">
            Sem fórmula: informe o custo base de MP (R$/kg) na Etapa 2 para calcular.
          </p>
        )}
      </div>

      {/* Resultado (somente leitura) */}
      {calc && (
        <div className="border-t border-border pt-6">
          <ResultadoCalculo calc={calc} />
        </div>
      )}

      {/* Rodapé de ações */}
      <div className="mt-2 flex items-center justify-between border-t border-border pt-5">
        <Button variant="ghost" onClick={onVoltar}>
          <ArrowLeft className="size-4" /> Voltar
        </Button>
        <Button
          variant="gold"
          disabled={!resultado}
          onClick={() => resultado && navigate(`/orcamentos/${resultado.id}`)}
        >
          <Check className="size-4" /> Salvar e finalizar
        </Button>
      </div>
    </div>
  );
}
