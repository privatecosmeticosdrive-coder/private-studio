import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import type { OrcamentoDetalhe } from '@/lib/types';
import { orcamentosApi } from '@/lib/services/orcamentos';
import { ncmApi } from '@/lib/services/matriz-custo';

interface EditarNcmOrcamentoModalProps {
  open: boolean;
  onClose: () => void;
  orcamento: OrcamentoDetalhe | null;
}

export function EditarNcmOrcamentoModal({ open, onClose, orcamento }: EditarNcmOrcamentoModalProps) {
  const queryClient = useQueryClient();

  const { data: ncms, isLoading: carregandoNcms } = useQuery({
    queryKey: ['ncm', 'ativos-select'],
    queryFn: () => ncmApi.listar(),
    enabled: open,
  });

  const [ncmId, setNcmId] = React.useState<number | null>(null);
  // Ao abrir (ou trocar de orçamento): pré-seleciona o override atual (ou vazio se herda).
  React.useEffect(() => {
    setNcmId(orcamento?.ncm_id ?? null);
  }, [orcamento]);

  const temOverride = orcamento?.ncm_efetivo_origem === 'orcamento';
  // NCM efetivo resolvido (objeto) para o destaque.
  const efetivoNcm = temOverride ? orcamento?.ncm : (orcamento?.formula?.ncm ?? null);

  const mutation = useMutation({
    mutationFn: (novo: number | null) => orcamentosApi.atualizar(orcamento!.id, { ncm_id: novo }),
    onSuccess: (_data, novo) => {
      queryClient.invalidateQueries({ queryKey: ['orcamentos', 'detalhe', orcamento!.id] });
      toast.success(
        novo === null ? 'Override removido — usando o NCM da fórmula' : 'NCM do orçamento atualizado',
      );
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao atualizar o NCM.');
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && onClose()}
      title="NCM do orçamento"
      description={orcamento?.produto}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          {temOverride && (
            <Button
              variant="secondary"
              onClick={() => mutation.mutate(null)}
              disabled={mutation.isPending}
            >
              Usar o NCM da fórmula
            </Button>
          )}
          <Button
            onClick={() => mutation.mutate(ncmId)}
            disabled={mutation.isPending || ncmId == null}
          >
            {mutation.isPending && <Spinner className="text-sand" />}
            Salvar override
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* NCM efetivo atual + origem */}
        <div className="rounded-md bg-sand px-3 py-2 text-sm">
          <span className="text-warm-600">NCM efetivo atual: </span>
          {efetivoNcm ? (
            <>
              <span className="font-mono font-medium text-ink">{efetivoNcm.ncm}</span>
              <span className="text-warm-700">
                {' '}
                — {efetivoNcm.descricao} · IPI {efetivoNcm.ipi_pct}%
              </span>
            </>
          ) : (
            <span className="text-warm-700">nenhum (sem fórmula/override)</span>
          )}
          <span className="ml-1 text-caption text-warm-500">
            (
            {temOverride
              ? 'definido neste orçamento'
              : orcamento?.ncm_efetivo_origem === 'formula'
                ? 'herdado da fórmula'
                : '—'}
            )
          </span>
        </div>

        {/* Seletor de override */}
        <div className="space-y-2">
          <Label htmlFor="ncm-orc-select">Definir NCM deste orçamento (override)</Label>
          <Select
            id="ncm-orc-select"
            value={ncmId ?? ''}
            onChange={(e) => setNcmId(e.target.value ? Number(e.target.value) : null)}
            disabled={carregandoNcms || mutation.isPending}
          >
            {carregandoNcms && <option value="">Carregando…</option>}
            {!carregandoNcms && <option value="">Selecione um NCM…</option>}
            {ncms?.map((n) => (
              <option key={n.id} value={n.id}>
                {n.ncm} — {n.descricao} (IPI {n.ipi_pct}%)
              </option>
            ))}
          </Select>
          <p className="text-caption text-warm-500">
            O NCM é usado para classificação fiscal e <strong>não recalcula o preço</strong> deste
            orçamento.
          </p>
        </div>
      </div>
    </Modal>
  );
}
