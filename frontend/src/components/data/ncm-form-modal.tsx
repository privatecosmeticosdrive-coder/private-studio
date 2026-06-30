import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import type { Ncm } from '@/lib/types';
import { ncmApi, type CreateNcmPayload } from '@/lib/services/matriz-custo';

const schema = z.object({
  ncm: z.string().min(2, 'Informe ao menos 2 caracteres'),
  descricao: z.string().min(1, 'Informe a descrição'),
  ipi_pct: z.number({ message: 'Valor inválido' }).min(0, 'Não pode ser negativo'),
  monofasico: z.boolean(),
  provisorio: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

interface NcmFormModalProps {
  open: boolean;
  onClose: () => void;
  /** quando presente, modo edição */
  ncm?: Ncm | null;
}

export function NcmFormModal({ open, onClose, ncm }: NcmFormModalProps) {
  const queryClient = useQueryClient();
  const ehEdicao = !!ncm;

  const valores: FormValues = React.useMemo(
    () => ({
      ncm: ncm?.ncm ?? '',
      descricao: ncm?.descricao ?? '',
      ipi_pct: ncm?.ipi_pct ?? 0,
      monofasico: ncm?.monofasico ?? false,
      provisorio: ncm?.provisorio ?? true,
    }),
    [ncm],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), values: valores });

  const mutation = useMutation({
    mutationFn: (d: FormValues) => {
      const payload: CreateNcmPayload = {
        ncm: d.ncm,
        descricao: d.descricao,
        ipi_pct: d.ipi_pct,
        monofasico: d.monofasico,
        provisorio: d.provisorio,
      };
      return ehEdicao ? ncmApi.atualizar(ncm!.id, payload) : ncmApi.criar(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matriz-custo', 'ncm'] });
      toast.success(ehEdicao ? 'NCM atualizada' : 'NCM criada');
      reset();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao salvar a NCM.');
    },
  });

  const fechar = () => {
    if (!mutation.isPending) {
      reset();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={fechar}
      size="md"
      title={ehEdicao ? 'Editar NCM' : 'Nova NCM'}
      description={ehEdicao ? ncm!.ncm : 'Cadastro de código NCM'}
      footer={
        <>
          <Button variant="ghost" onClick={fechar} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-ncm" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="text-sand" />}
            {ehEdicao ? 'Salvar alterações' : 'Criar NCM'}
          </Button>
        </>
      }
    >
      <form
        id="form-ncm"
        onSubmit={handleSubmit((d) => mutation.mutate(d))}
        className="space-y-4"
        noValidate
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ncm">NCM *</Label>
            <Input id="ncm" placeholder="0000.00.00" {...register('ncm')} />
            {errors.ncm && <p className="text-caption text-error">{errors.ncm.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ipi_pct">IPI (%) *</Label>
            <Input
              id="ipi_pct"
              type="number"
              step="0.001"
              min="0"
              {...register('ipi_pct', { valueAsNumber: true })}
            />
            {errors.ipi_pct && <p className="text-caption text-error">{errors.ipi_pct.message}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="descricao">Descrição *</Label>
          <Input id="descricao" {...register('descricao')} />
          {errors.descricao && (
            <p className="text-caption text-error">{errors.descricao.message}</p>
          )}
        </div>

        <div className="space-y-3 pt-1">
          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" className="size-4 accent-gold-500" {...register('monofasico')} />
            <span className="text-sm font-medium text-ink">Monofásico</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" className="size-4 accent-gold-500" {...register('provisorio')} />
            <span className="text-sm font-medium text-ink">
              Provisório (pendente de validação contábil)
            </span>
          </label>
        </div>
      </form>
    </Modal>
  );
}
