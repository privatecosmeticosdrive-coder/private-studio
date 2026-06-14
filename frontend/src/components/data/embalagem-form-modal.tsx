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
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import {
  TIPOS_EMBALAGEM,
  TIPO_EMBALAGEM_LABEL,
  type Embalagem,
  type TipoEmbalagem,
} from '@/lib/types';
import { embalagensApi, type EmbalagemPayload } from '@/lib/services/embalagens';

// Numero opcional: '' / null viram undefined; o resto e coagido e validado >= 0.
const numeroOpcional = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number({ message: 'Valor numérico inválido' }).min(0, 'Não pode ser negativo').optional(),
);

const schema = z.object({
  codigo: z.string().optional(),
  nome: z.string().min(2, 'Informe ao menos 2 caracteres'),
  tipo: z
    .string()
    .refine((v) => (TIPOS_EMBALAGEM as readonly string[]).includes(v), 'Selecione o tipo'),
  volume_ml: numeroOpcional,
  material: z.string().optional(),
  cor: z.string().optional(),
  preco_un_brl: numeroOpcional,
  fornecedor: z.string().optional(),
  prazo_entrega: z.string().optional(),
  data_cotacao: z.string().optional(),
  observacoes: z.string().optional(),
});
type FormIn = z.input<typeof schema>;
type FormOut = z.output<typeof schema>;

interface EmbalagemFormModalProps {
  open: boolean;
  onClose: () => void;
  /** quando presente, modo edicao (PATCH cadastral, sem preco) */
  embalagem?: Embalagem | null;
}

export function EmbalagemFormModal({ open, onClose, embalagem }: EmbalagemFormModalProps) {
  const queryClient = useQueryClient();
  const ehEdicao = !!embalagem;

  const valores: FormIn = React.useMemo(
    () => ({
      codigo: embalagem?.codigo ?? '',
      nome: embalagem?.nome ?? '',
      tipo: embalagem?.tipo ?? '',
      volume_ml: embalagem?.volume_ml != null ? String(embalagem.volume_ml) : '',
      material: embalagem?.material ?? '',
      cor: embalagem?.cor ?? '',
      preco_un_brl: '',
      fornecedor: embalagem?.fornecedor ?? '',
      prazo_entrega: embalagem?.prazo_entrega ?? '',
      data_cotacao: '',
      observacoes: embalagem?.observacoes ?? '',
    }),
    [embalagem],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(schema), values: valores });

  const mutation = useMutation({
    mutationFn: (d: FormOut) => {
      // base cadastral compartilhada (sem codigo: imutavel na edicao)
      const base = {
        nome: d.nome,
        tipo: d.tipo as TipoEmbalagem,
        volume_ml: d.volume_ml,
        material: d.material || undefined,
        cor: d.cor || undefined,
        fornecedor: d.fornecedor || undefined,
        prazo_entrega: d.prazo_entrega || undefined,
        observacoes: d.observacoes || undefined,
      } satisfies Partial<EmbalagemPayload>;

      if (ehEdicao) {
        return embalagensApi.atualizar(embalagem!.id, base);
      }
      const payload: EmbalagemPayload = {
        ...base,
        codigo: d.codigo || undefined,
        preco_un_brl: d.preco_un_brl,
        data_cotacao: d.data_cotacao || undefined,
      };
      return embalagensApi.criar(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embalagens'] });
      toast.success(ehEdicao ? 'Embalagem atualizada' : 'Embalagem criada');
      reset();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao salvar a embalagem.');
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
      title={ehEdicao ? 'Editar embalagem' : 'Nova embalagem'}
      description={ehEdicao ? embalagem!.nome : 'Cadastro de item de embalagem'}
      footer={
        <>
          <Button variant="ghost" onClick={fechar} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-embalagem" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="text-sand" />}
            {ehEdicao ? 'Salvar alterações' : 'Criar embalagem'}
          </Button>
        </>
      }
    >
      <form
        id="form-embalagem"
        onSubmit={handleSubmit((d) => mutation.mutate(d))}
        className="space-y-4"
        noValidate
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="codigo">Código</Label>
            <Input id="codigo" placeholder="opcional" disabled={ehEdicao} {...register('codigo')} />
            {ehEdicao && <p className="text-caption text-warm-500">Código não é editável.</p>}
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" {...register('nome')} />
            {errors.nome && <p className="text-caption text-error">{errors.nome.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo *</Label>
            <Select id="tipo" {...register('tipo')}>
              <option value="">Selecione…</option>
              {TIPOS_EMBALAGEM.map((t) => (
                <option key={t} value={t}>
                  {TIPO_EMBALAGEM_LABEL[t] ?? t}
                </option>
              ))}
            </Select>
            {errors.tipo && <p className="text-caption text-error">{errors.tipo.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="volume_ml">Volume (mL)</Label>
            <Input id="volume_ml" type="number" step="0.01" min="0" {...register('volume_ml')} />
            {errors.volume_ml && (
              <p className="text-caption text-error">{errors.volume_ml.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cor">Cor</Label>
            <Input id="cor" {...register('cor')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="material">Material</Label>
            <Input id="material" placeholder="PET, vidro, alumínio…" {...register('material')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fornecedor">Fornecedor</Label>
            <Input id="fornecedor" {...register('fornecedor')} />
          </div>
        </div>

        {!ehEdicao && (
          <div className="grid grid-cols-2 gap-4 rounded-md bg-sand/60 p-3">
            <div className="space-y-2">
              <Label htmlFor="preco_un_brl">Preço inicial (R$/un)</Label>
              <Input
                id="preco_un_brl"
                type="number"
                step="0.0001"
                min="0"
                {...register('preco_un_brl')}
              />
              {errors.preco_un_brl && (
                <p className="text-caption text-error">{errors.preco_un_brl.message}</p>
              )}
              <p className="text-caption text-warm-500">Em branco = sem cotação (estimado).</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_cotacao">Data da cotação</Label>
              <Input id="data_cotacao" type="date" {...register('data_cotacao')} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="prazo_entrega">Prazo de entrega</Label>
            <Input id="prazo_entrega" placeholder="ex.: 15 dias úteis" {...register('prazo_entrega')} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="observacoes">Observações</Label>
          <Textarea id="observacoes" rows={2} {...register('observacoes')} />
        </div>

        {ehEdicao && (
          <p className="rounded-md bg-info-soft px-3 py-2 text-caption text-info">
            O preço é alterado por “Atualizar preço” (gera histórico), não por este formulário.
          </p>
        )}
      </form>
    </Modal>
  );
}
