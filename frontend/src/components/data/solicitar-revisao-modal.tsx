import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { pendenciasLabApi } from '@/lib/services/pendencias-lab';
import type { UrgenciaLab } from '@/lib/types';

const URGENCIAS: { value: UrgenciaLab; label: string }[] = [
  { value: 'mesmo_dia', label: 'Mesmo dia (urgente)' },
  { value: 'dois_tres_dias', label: '2–3 dias úteis' },
  { value: 'ate_sete_dias', label: 'Até 7 dias úteis' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** fórmula-base (validada) que será revisada — a nova versão nasce dela. */
  formulaBaseId: number;
  formulaNome: string;
  /** orçamento de origem (opcional): ao concluir, o rascunho oferece a nova versão. */
  orcamentoId?: string;
  onCriada?: () => void;
}

/**
 * Fase 2 (gatilho b) — SOLICITAR REVISÃO de uma fórmula selecionada (qualquer
 * usuário). ASSÍNCRONO: o orçamento NÃO trava; segue com o custo atual. Sem
 * NCM (a revisão herda o da base via fix D6).
 */
export function SolicitarRevisaoModal({
  open,
  onClose,
  formulaBaseId,
  formulaNome,
  orcamentoId,
  onCriada,
}: Props) {
  const queryClient = useQueryClient();
  const [urgencia, setUrgencia] = React.useState<UrgenciaLab>('dois_tres_dias');
  const [descricao, setDescricao] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setUrgencia('dois_tres_dias');
      setDescricao('');
    }
  }, [open]);

  const criar = useMutation({
    mutationFn: () =>
      pendenciasLabApi.criar({
        tipo: 'revisao',
        urgencia,
        descricao: descricao.trim(),
        formula_base_id: formulaBaseId,
        orcamento_id: orcamentoId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendencias-lab'] });
      toast.success('Revisão solicitada ao laboratório.');
      onCriada?.();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao solicitar a revisão.');
    },
  });

  const podeEnviar = descricao.trim().length >= 3;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Solicitar revisão ao Laboratório"
      description="O lab cria uma nova versão da fórmula (herda o NCM). Não trava o orçamento — segue com o custo atual até a revisão concluir."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => criar.mutate()} disabled={!podeEnviar || criar.isPending}>
            {criar.isPending && <Spinner className="text-sand" />}
            Enviar solicitação
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
          <span className="text-caption text-warm-500">Fórmula-base</span>
          <p className="font-medium text-ink">{formulaNome}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="urgencia-rev">Urgência</Label>
          <Select id="urgencia-rev" value={urgencia} onChange={(e) => setUrgencia(e.target.value as UrgenciaLab)}>
            {URGENCIAS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="descricao-rev">Motivo da revisão *</Label>
          <Textarea
            id="descricao-rev"
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="ex.: custo elevado — reduzir concentração do ativo X; trocar fornecedor…"
          />
        </div>
      </div>
    </Modal>
  );
}
