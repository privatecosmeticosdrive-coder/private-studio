import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import type { FormulaPendenteNcm } from '@/lib/types';
import { formulasApi } from '@/lib/services/formulas';
import { ncmApi } from '@/lib/services/matriz-custo';

interface RevisarNcmModalProps {
  open: boolean;
  onClose: () => void;
  formula: FormulaPendenteNcm | null;
}

export function RevisarNcmModal({ open, onClose, formula }: RevisarNcmModalProps) {
  const queryClient = useQueryClient();

  // NCMs ativos pro dropdown (sem arg = só ativos). Só busca com o modal aberto.
  const { data: ncms, isLoading: carregandoNcms } = useQuery({
    queryKey: ['ncm', 'ativos-select'],
    queryFn: () => ncmApi.listar(),
    enabled: open,
  });

  const [ncmId, setNcmId] = React.useState<number | null>(null);
  // Ao abrir (ou trocar de fórmula), pré-seleciona o NCM sugerido atual.
  React.useEffect(() => {
    setNcmId(formula?.ncm_id ?? null);
  }, [formula]);

  const mutation = useMutation({
    mutationFn: () => formulasApi.revisarNcm(formula!.id, { ncm_id: ncmId ?? undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formulas', 'pendentes-ncm'] });
      toast.success('NCM revisado');
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao revisar o NCM.');
    },
  });

  const sugerido = formula?.ncm;
  const trocando = ncmId != null && ncmId !== formula?.ncm_id;

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && onClose()}
      title="Revisar NCM da fórmula"
      description={
        formula
          ? `${formula.nome_produto}${formula.versao_codigo ? ` · v${formula.versao_codigo}` : ''}`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || ncmId == null}>
            {mutation.isPending && <Spinner className="text-sand" />}
            {trocando ? 'Trocar e confirmar' : 'Confirmar NCM'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* NCM sugerido em destaque */}
        {sugerido && (
          <div className="rounded-md bg-sand px-3 py-2 text-sm">
            <span className="text-warm-600">NCM sugerido (match automático): </span>
            <span className="font-mono font-medium text-ink">{sugerido.ncm}</span>
            <span className="text-warm-700"> — {sugerido.descricao} · IPI {sugerido.ipi_pct}%</span>
          </div>
        )}

        {/* Seletor de NCM ativo */}
        <div className="space-y-2">
          <Label htmlFor="ncm-select">NCM a associar</Label>
          <Select
            id="ncm-select"
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
            Confirmar mantém o sugerido; escolher outro troca a associação. Só NCMs ativos aparecem.
          </p>
        </div>
      </div>
    </Modal>
  );
}
