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
  // F4 Fase A (D3) — perfil fiscal; '' = não informado (vai como undefined -> conservador)
  regime_fiscal: z.string().optional(),
  finalidade_padrao: z.string().optional(),
  uf: z
    .string()
    .optional()
    .refine((v) => !v || /^[A-Za-z]{2}$/.test(v), 'UF com 2 letras (ex.: SP)'),
  contribuinte_icms: z.string().optional(), // '' | 'sim' | 'nao' (preserva o "não informado")
});
type FormValues = z.infer<typeof schema>;

const REGIMES = [
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'lucro_real_presumido', label: 'Lucro Real / Presumido (RPA)' },
  { value: 'consumidor_final_cpf', label: 'Consumidor final (CPF)' },
];
const FINALIDADES = [
  { value: 'revenda', label: 'Revenda' },
  { value: 'industrializacao', label: 'Industrialização' },
  { value: 'uso_proprio', label: 'Uso próprio' },
];

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
      regime_fiscal: cliente?.regime_fiscal ?? '',
      finalidade_padrao: cliente?.finalidade_padrao ?? '',
      uf: cliente?.uf ?? '',
      contribuinte_icms:
        cliente?.contribuinte_icms == null ? '' : cliente.contribuinte_icms ? 'sim' : 'nao',
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
        regime_fiscal: d.regime_fiscal || undefined,
        finalidade_padrao: d.finalidade_padrao || undefined,
        uf: d.uf ? d.uf.toUpperCase() : undefined,
        contribuinte_icms: d.contribuinte_icms === '' ? undefined : d.contribuinte_icms === 'sim',
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

        {/* ---- Perfil fiscal (F4 Fase A) — decide benefícios no cálculo ---- */}
        <div className="space-y-4 rounded-md border border-border/60 bg-warm-50/50 p-4">
          <div>
            <p className="text-sm font-medium text-ink">Perfil fiscal</p>
            <p className="text-caption text-warm-500">
              Sem preenchimento, o cálculo assume o cenário conservador (sem benefícios de ICMS).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="regime_fiscal">Regime tributário</Label>
              <select
                id="regime_fiscal"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
                {...register('regime_fiscal')}
              >
                <option value="">Não informado</option>
                {REGIMES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="finalidade_padrao">Finalidade da compra</Label>
              <select
                id="finalidade_padrao"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
                {...register('finalidade_padrao')}
              >
                <option value="">Não informado</option>
                {FINALIDADES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="uf">UF</Label>
              <Input id="uf" placeholder="SP" maxLength={2} {...register('uf')} />
              {errors.uf && <p className="text-caption text-error">{errors.uf.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contribuinte_icms">Contribuinte de ICMS</Label>
              <select
                id="contribuinte_icms"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
                {...register('contribuinte_icms')}
              >
                <option value="">Não informado</option>
                <option value="sim">Sim (tem IE)</option>
                <option value="nao">Não</option>
              </select>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
