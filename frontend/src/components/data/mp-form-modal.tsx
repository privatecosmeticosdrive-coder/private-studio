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
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import type { MateriaPrima } from '@/lib/types';
import { mpsApi, type MpPayload } from '@/lib/services/materias-primas';

// Numero opcional: '' / null viram undefined; o resto e coagido e validado >= 0.
const numeroOpcional = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number({ message: 'Valor numérico inválido' }).min(0, 'Não pode ser negativo').optional(),
);

const schema = z.object({
  codigo: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce
      .number({ message: 'Informe o código (número)' })
      .int('Deve ser um número inteiro')
      .min(0, 'Código inválido'),
  ),
  nome: z.string().min(2, 'Informe ao menos 2 caracteres'),
  preco_kg_brl: numeroOpcional,
  fornecedor: z.string().optional(),
  embalagem_minima: z.string().optional(),
  data_cotacao: z.string().optional(),
  validade_cotacao: z.string().optional(),
  observacoes: z.string().optional(),
});
type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

function isoDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

interface MpFormModalProps {
  open: boolean;
  onClose: () => void;
  /** quando presente, modo edicao (PATCH cadastral, sem preco/codigo) */
  mp?: MateriaPrima | null;
}

export function MpFormModal({ open, onClose, mp }: MpFormModalProps) {
  const queryClient = useQueryClient();
  const ehEdicao = !!mp;

  const valores: FormIn = React.useMemo(
    () => ({
      codigo: mp?.codigo != null ? String(mp.codigo) : '',
      nome: mp?.nome ?? '',
      preco_kg_brl: '',
      fornecedor: mp?.fornecedor ?? '',
      embalagem_minima: mp?.embalagem_minima ?? '',
      data_cotacao: '',
      validade_cotacao: isoDate(mp?.validade_cotacao ?? null),
      observacoes: mp?.observacoes ?? '',
    }),
    [mp],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(schema), values: valores });

  const mutation = useMutation({
    mutationFn: (d: FormOut) => {
      if (ehEdicao) {
        // PATCH cadastral — sem codigo, preco ou data_cotacao
        return mpsApi.atualizar(mp!.codigo, {
          nome: d.nome,
          fornecedor: d.fornecedor || undefined,
          embalagem_minima: d.embalagem_minima || undefined,
          validade_cotacao: d.validade_cotacao || undefined,
          observacoes: d.observacoes || undefined,
        });
      }
      const payload: MpPayload = {
        codigo: d.codigo,
        nome: d.nome,
        preco_kg_brl: d.preco_kg_brl,
        fornecedor: d.fornecedor || undefined,
        embalagem_minima: d.embalagem_minima || undefined,
        data_cotacao: d.data_cotacao || undefined,
        validade_cotacao: d.validade_cotacao || undefined,
        observacoes: d.observacoes || undefined,
      };
      return mpsApi.criar(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mps'] });
      toast.success(ehEdicao ? 'Matéria-prima atualizada' : 'Matéria-prima criada');
      reset();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao salvar a matéria-prima.');
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
      size="lg"
      title={ehEdicao ? 'Editar matéria-prima' : 'Nova matéria-prima'}
      description={ehEdicao ? mp!.nome : 'Cadastro de matéria-prima'}
      footer={
        <>
          <Button variant="ghost" onClick={fechar} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-mp" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="text-sand" />}
            {ehEdicao ? 'Salvar alterações' : 'Criar matéria-prima'}
          </Button>
        </>
      }
    >
      <form id="form-mp" onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4" noValidate>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="codigo">Código *</Label>
            <Input
              id="codigo"
              type="number"
              min="0"
              step="1"
              readOnly={ehEdicao}
              className={ehEdicao ? 'bg-warm-100 text-warm-600' : undefined}
              {...register('codigo')}
            />
            {errors.codigo && <p className="text-caption text-error">{errors.codigo.message}</p>}
            {ehEdicao && <p className="text-caption text-warm-500">Código não é editável.</p>}
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" {...register('nome')} />
            {errors.nome && <p className="text-caption text-error">{errors.nome.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fornecedor">Fornecedor</Label>
            <Input id="fornecedor" {...register('fornecedor')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="embalagem_minima">Embalagem mínima</Label>
            <Input id="embalagem_minima" placeholder="ex.: 25 kg" {...register('embalagem_minima')} />
          </div>
        </div>

        {!ehEdicao && (
          <div className="grid grid-cols-2 gap-4 rounded-md bg-sand/60 p-3">
            <div className="space-y-2">
              <Label htmlFor="preco_kg_brl">Preço inicial (R$/kg)</Label>
              <Input id="preco_kg_brl" type="number" step="0.0001" min="0" {...register('preco_kg_brl')} />
              {errors.preco_kg_brl && (
                <p className="text-caption text-error">{errors.preco_kg_brl.message}</p>
              )}
              <p className="text-caption text-warm-500">Em branco = sem cotação.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_cotacao">Data da cotação</Label>
              <Input id="data_cotacao" type="date" {...register('data_cotacao')} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="validade_cotacao">Validade da cotação</Label>
            <Input id="validade_cotacao" type="date" {...register('validade_cotacao')} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="observacoes">Observações</Label>
          <Textarea id="observacoes" rows={2} {...register('observacoes')} />
        </div>

        {ehEdicao && (
          <p className="rounded-md bg-info-soft px-3 py-2 text-caption text-info">
            O preço é alterado por “Atualizar preço” (gera histórico e alerta), não por este formulário.
          </p>
        )}
      </form>
    </Modal>
  );
}
