import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { AlertTriangle, ArrowLeft, Calculator, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useCan } from '@/auth/use-can';
import { cn } from '@/lib/utils';
import type { OrcamentoDetalhe } from '@/lib/types';
import { orcamentosApi } from '@/lib/services/orcamentos';
import { EditarNcmOrcamentoModal } from '@/components/data/editar-ncm-orcamento';
import { ResultadoCalculo } from './resultado-calculo';
import { montarPayloadOrcamento, num, type EtapaProps } from './wizard-types';

interface EtapaCalculoProps extends EtapaProps {
  onVoltar: () => void;
  /** retomada de rascunho (correção C/#4): recalcula o MESMO orçamento. */
  orcIdInicial?: string | null;
}

const PRESETS_UN_MIN = [8, 6, 4, 2, 1];

// num() e montarPayloadOrcamento() vivem em wizard-types (compartilhados com a
// solicitação ao lab da etapa 2 — P0-2).

/** Etapa 4 — Cálculo determinístico (Fase 1). */
export function EtapaCalculo({ form, patch, onVoltar, orcIdInicial }: EtapaCalculoProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const can = useCan();
  // id do orçamento já criado nesta sessão OU do rascunho reaberto (correção C/#4).
  const [orcId, setOrcId] = React.useState<string | null>(orcIdInicial ?? null);
  const [resultado, setResultado] = React.useState<OrcamentoDetalhe | null>(null);
  // bloqueio de NCM (F4): o calcular falhou por falta de NCM efetivo — oferece a saída.
  const [bloqueioNcm, setBloqueioNcm] = React.useState(false);
  const [ncmModalAberto, setNcmModalAberto] = React.useState(false);
  // detalhe completo do orçamento criado (contrato do modal de NCM — não relaxado).
  const [detalheNcm, setDetalheNcm] = React.useState<OrcamentoDetalhe | null>(null);

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
      const payload = montarPayloadOrcamento(form);
      // cria na primeira vez; depois atualiza o briefing e recalcula o mesmo registro.
      const orc = orcId
        ? await orcamentosApi.atualizar(orcId, payload)
        : await orcamentosApi.criar(payload);
      // Captura o id ANTES do calcular: se o cálculo falhar (ex.: sem NCM), o
      // retry REUSA este orçamento — sem isso, cada tentativa criava um
      // rascunho novo no banco (bug do rascunho duplicado).
      if (!orcId) {
        setOrcId(orc.id);
        // Correção C/#5: o rascunho existe MESMO se o calcular falhar — a lista
        // precisa mostrá-lo já (antes, só o sucesso do cálculo invalidava o cache
        // e rascunhos não-calculados "sumiam" até um refresh).
        queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      }
      const calculado = await orcamentosApi.calcular(orc.id, {
        un_min: unMin,
        margem_pct: margem,
      });
      return calculado;
    },
    onSuccess: (orc) => {
      setOrcId(orc.id);
      setResultado(orc);
      setBloqueioNcm(false);
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      toast.success(`Orçamento #${orc.numero} calculado.`);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      const msg = Array.isArray(m) ? m[0] : m || 'Falha ao calcular o orçamento.';
      // Bloqueio de NCM (F4, falha visível): oferece a saída no ponto do erro.
      // Qualquer OUTRO erro mantém o comportamento atual (toast, sem botão).
      setBloqueioNcm(/sem NCM efetivo/i.test(msg));
      toast.error(msg);
    },
  });

  /** Abre o modal de NCM com o detalhe completo do orçamento já criado (F5-D2). */
  const abrirModalNcm = async () => {
    if (!orcId) return;
    try {
      setDetalheNcm(await orcamentosApi.obter(orcId));
      setNcmModalAberto(true);
    } catch {
      toast.error('Não foi possível carregar o orçamento para editar o NCM.');
    }
  };

  /** Ao fechar o modal: se o NCM efetivo passou a existir, recalcula sozinho. */
  const fecharModalNcm = async () => {
    setNcmModalAberto(false);
    if (!orcId) return;
    try {
      const det = await orcamentosApi.obter(orcId);
      setDetalheNcm(det);
      if (det.ncm_efetivo_origem !== null) {
        setBloqueioNcm(false);
        calcular.mutate(); // re-dispara automaticamente após o override salvar
      }
    } catch {
      /* usuário cancelou/offline — mantém o bloqueio visível */
    }
  };

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
        {/* Bloqueio de NCM (F4): a saída no ponto do erro — só para ESTE erro. */}
        {bloqueioNcm && orcId && (
          <div className="mt-3 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-ink">Sem NCM — o cálculo fiscal precisa de um</p>
              <p className="text-caption text-warm-700">
                A fórmula selecionada não tem NCM e o orçamento não tem override. Atribua um NCM
                para destravar o cálculo (o orçamento já foi salvo como rascunho).
              </p>
            </div>
            <Button size="sm" onClick={abrirModalNcm}>
              Atribuir NCM
            </Button>
          </div>
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

      {/* Modal de override de NCM (F5-D2, reuso) — abre a partir do bloqueio acima. */}
      <EditarNcmOrcamentoModal
        open={ncmModalAberto}
        onClose={fecharModalNcm}
        orcamento={detalheNcm}
      />
    </div>
  );
}
