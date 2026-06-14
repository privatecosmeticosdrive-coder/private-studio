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
import type { Cliente } from '@/lib/types';
import { clientesApi, type ClientePayload } from '@/lib/services/clientes';

const schema = z.object({
  nome: z.string().min(2, 'Informe ao menos 2 caracteres'),
  cnpj: z.string().optional(),
  // email opcional, mas se preenchido precisa ser valido (espelha @IsEmail do backend)
  email: z
    .string()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, 'E-mail inválido'),
  telefone: z.string().optional(),
  observacoes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface ClienteFormModalProps {
  open: boolean;
  onClose: () => void;
  /** quando presente, modo edicao */
  cliente?: Cliente | null;
}

export function ClienteFormModal({ open, onClose, cliente }: ClienteFormModalProps) {
  const queryClient = useQueryClient();
  const ehEdicao = !!cliente;

  const valores: FormValues = React.useMemo(
    () => ({
      nome: cliente?.nome ?? '',
      cnpj: cliente?.cnpj ?? '',
      email: cliente?.email ?? '',
      telefone: cliente?.telefone ?? '',
      observacoes: cliente?.observacoes ?? '',
    }),
    [cliente],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), values: valores });

  const mutation = useMutation({
    mutationFn: (d: FormValues) => {
      const payload: ClientePayload = {
        nome: d.nome,
        cnpj: d.cnpj || undefined,
        email: d.email || undefined,
        telefone: d.telefone || undefined,
        observacoes: d.observacoes || undefined,
      };
      return ehEdicao ? clientesApi.atualizar(cliente!.id, payload) : clientesApi.criar(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast.success(ehEdicao ? 'Cliente atualizado' : 'Cliente criado');
      reset();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao salvar o cliente.');
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
      title={ehEdicao ? 'Editar cliente' : 'Novo cliente'}
      description={ehEdicao ? cliente!.nome : 'Cadastro de cliente'}
      footer={
        <>
          <Button variant="ghost" onClick={fechar} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-cliente" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="text-sand" />}
            {ehEdicao ? 'Salvar alterações' : 'Criar cliente'}
          </Button>
        </>
      }
    >
      <form
        id="form-cliente"
        onSubmit={handleSubmit((d) => mutation.mutate(d))}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-2">
          <Label htmlFor="nome">Nome *</Label>
          <Input id="nome" {...register('nome')} />
          {errors.nome && <p className="text-caption text-error">{errors.nome.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input id="cnpj" placeholder="00.000.000/0000-00" {...register('cnpj')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone</Label>
            <Input id="telefone" placeholder="(00) 00000-0000" {...register('telefone')} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" {...register('email')} />
          {errors.email && <p className="text-caption text-error">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="observacoes">Observações</Label>
          <Textarea id="observacoes" rows={3} {...register('observacoes')} />
        </div>
      </form>
    </Modal>
  );
}
