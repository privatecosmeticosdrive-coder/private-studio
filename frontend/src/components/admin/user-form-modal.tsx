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
import { Spinner } from '@/components/ui/spinner';
import type { Role } from '@/auth/auth-context';
import { ROLES, ROLE_LABEL, type Usuario } from '@/lib/types';
import { usersApi } from '@/lib/services/users';

function makeSchema(ehEdicao: boolean) {
  return z.object({
    nome: z.string().min(2, 'Informe ao menos 2 caracteres'),
    email: z.string().email('E-mail inválido'),
    senha: ehEdicao
      ? z
          .string()
          .refine((v) => v === '' || v.length >= 6, 'A senha deve ter ao menos 6 caracteres')
      : z.string().min(6, 'A senha deve ter ao menos 6 caracteres'),
    role: z.string().refine((v) => (ROLES as string[]).includes(v), 'Selecione o papel'),
  });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  /** quando presente, modo edição (e-mail imutável) */
  usuario?: Usuario | null;
}

export function UserFormModal({ open, onClose, usuario }: UserFormModalProps) {
  const queryClient = useQueryClient();
  const ehEdicao = !!usuario;
  const schema = React.useMemo(() => makeSchema(ehEdicao), [ehEdicao]);

  const valores: FormValues = React.useMemo(
    () => ({
      nome: usuario?.nome ?? '',
      email: usuario?.email ?? '',
      senha: '',
      role: usuario?.role ?? '',
    }),
    [usuario],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), values: valores });

  const mutation = useMutation({
    mutationFn: (d: FormValues) => {
      if (ehEdicao) {
        return usersApi.atualizar(usuario!.id, {
          nome: d.nome,
          role: d.role as Role,
          ...(d.senha ? { senha: d.senha } : {}),
        });
      }
      return usersApi.criar({
        email: d.email,
        nome: d.nome,
        senha: d.senha,
        role: d.role as Role,
      });
    },
    onSuccess: (_res, d) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      if (ehEdicao) {
        toast.success('Usuário atualizado');
      } else {
        // Única chance de mostrar a senha — o backend nunca a retorna.
        toast.success(
          `Usuário criado. Senha inicial: ${d.senha} — anote e repasse ao funcionário, ela não será exibida novamente.`,
          { duration: Infinity },
        );
      }
      reset();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao salvar o usuário.');
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
      title={ehEdicao ? 'Editar usuário' : 'Novo usuário'}
      description={ehEdicao ? usuario!.email : 'Cadastro de acesso da equipe'}
      footer={
        <>
          <Button variant="ghost" onClick={fechar} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-user" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="text-sand" />}
            {ehEdicao ? 'Salvar alterações' : 'Criar usuário'}
          </Button>
        </>
      }
    >
      <form
        id="form-user"
        onSubmit={handleSubmit((d) => mutation.mutate(d))}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-2">
          <Label htmlFor="nome">Nome *</Label>
          <Input id="nome" {...register('nome')} />
          {errors.nome && <p className="text-caption text-error">{errors.nome.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-mail *</Label>
          <Input id="email" type="email" disabled={ehEdicao} {...register('email')} />
          {ehEdicao ? (
            <p className="text-caption text-warm-500">O e-mail não é editável.</p>
          ) : (
            errors.email && <p className="text-caption text-error">{errors.email.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="senha">{ehEdicao ? 'Nova senha' : 'Senha inicial *'}</Label>
            <Input
              id="senha"
              type="text"
              autoComplete="off"
              placeholder={ehEdicao ? 'deixe em branco para manter' : 'mín. 6 caracteres'}
              {...register('senha')}
            />
            {errors.senha && <p className="text-caption text-error">{errors.senha.message}</p>}
            <p className="text-caption text-warm-500">
              Oriente o funcionário a trocar no primeiro acesso.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Papel *</Label>
            <Select id="role" {...register('role')}>
              <option value="">Selecione…</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
            {errors.role && <p className="text-caption text-error">{errors.role.message}</p>}
          </div>
        </div>
      </form>
    </Modal>
  );
}
