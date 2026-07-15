import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { BadgeCheck, FlaskConical } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { StatusFormulaBadge } from '@/components/ui/status-badge';
import { formulasApi } from '@/lib/services/formulas';
import { pendenciasLabApi } from '@/lib/services/pendencias-lab';
import type { PendenciaLab } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  pendencia: PendenciaLab | null;
}

/**
 * Conclui a pendência com A FÓRMULA VINCULADA (correção A — sem busca livre).
 * O vínculo nasce no Atender; o backend rejeita concluir sem/for a dela.
 * Rascunho -> botão "Validar e concluir" (valida a vinculada e conclui).
 * Validada -> só "Concluir".
 */
export function ConcluirPendenciaModal({ open, onClose, pendencia }: Props) {
  const queryClient = useQueryClient();
  const formula = pendencia?.formula_resultado ?? null;
  const precisaValidar = formula?.status === 'rascunho';

  const concluir = useMutation({
    mutationFn: async () => {
      if (!pendencia || !formula) throw new Error('sem fórmula vinculada');
      // D3: validação é explícita — aqui ela é parte do gesto "Validar e concluir".
      if (precisaValidar) await formulasApi.validar(formula.id);
      return pendenciasLabApi.concluir(pendencia.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendencias-lab'] });
      queryClient.invalidateQueries({ queryKey: ['formulas'] });
      toast.success('Pendência concluída — fórmula validada e disponível.');
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao concluir.');
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Concluir pendência"
      description="A conclusão usa a fórmula desta pendência (vinculada no Atender)."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={concluir.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => concluir.mutate()} disabled={!formula || concluir.isPending}>
            {concluir.isPending ? <Spinner className="text-sand" /> : <BadgeCheck className="size-4" />}
            {precisaValidar ? 'Validar e concluir' : 'Concluir'}
          </Button>
        </>
      }
    >
      {formula ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
            <FlaskConical className="size-4 text-warm-500" />
            {formula.nome_produto}
            {formula.versao_codigo ? ` ${formula.versao_codigo}` : ''}
          </span>
          <StatusFormulaBadge status={formula.status} />
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Esta pendência ainda não tem fórmula vinculada — use o Atender primeiro (a fórmula da
          pendência nasce lá).
        </p>
      )}
      {precisaValidar && (
        <p className="mt-3 text-caption text-warm-600">
          A fórmula está em rascunho: “Validar e concluir” valida esta fórmula (D3) e fecha a
          pendência num só gesto.
        </p>
      )}
    </Modal>
  );
}
