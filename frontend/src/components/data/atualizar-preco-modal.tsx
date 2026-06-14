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
import { brl } from '@/lib/utils';
import type { Money } from '@/lib/types';
import { mpsApi } from '@/lib/services/materias-primas';
import { embalagensApi } from '@/lib/services/embalagens';

const FONTES = [
  { v: 'ligacao', l: 'Ligação' },
  { v: 'email', l: 'E-mail' },
  { v: 'whatsapp', l: 'WhatsApp' },
  { v: 'pedido_formal', l: 'Pedido formal' },
  { v: 'painel_fornecedor', l: 'Painel do fornecedor' },
  { v: 'ultima_compra', l: 'Última compra' },
  { v: 'outro', l: 'Outro' },
] as const;

interface AtualizarPrecoModalProps {
  open: boolean;
  onClose: () => void;
  tipo: 'mp' | 'embalagem';
  /** mp: codigo · embalagem: id */
  id: number;
  nome: string;
  precoAtual?: Money;
  fornecedorAtual?: string | null;
}

export function AtualizarPrecoModal({
  open,
  onClose,
  tipo,
  id,
  nome,
  precoAtual,
  fornecedorAtual,
}: AtualizarPrecoModalProps) {
  const queryClient = useQueryClient();
  const ehMp = tipo === 'mp';
  const unidade = ehMp ? '/kg' : '/un';

  const schema = React.useMemo(
    () =>
      z
        .object({
          preco: z.coerce
            .number({ message: 'Informe um valor numérico' })
            .gt(0, 'O preço deve ser maior que zero'),
          fornecedor: z.string().optional(),
          data_cotacao: z.string().min(1, 'Informe a data da cotação'),
          fonte_info: z.string().optional(),
          observacoes: z.string().optional(),
        })
        .superRefine((val, ctx) => {
          // fornecedor + fonte sao obrigatorios apenas para MP (espelha o DTO do backend)
          if (ehMp && !val.fornecedor) {
            ctx.addIssue({ code: 'custom', path: ['fornecedor'], message: 'Informe o fornecedor' });
          }
          if (ehMp && !val.fonte_info) {
            ctx.addIssue({ code: 'custom', path: ['fonte_info'], message: 'Selecione a fonte da informação' });
          }
        }),
    [ehMp],
  );
  type FormIn = z.input<typeof schema>;
  type FormOut = z.output<typeof schema>;

  const hoje = new Date().toISOString().slice(0, 10);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    values: {
      preco: precoAtual != null && precoAtual !== '' ? Number(precoAtual) : '',
      fornecedor: fornecedorAtual ?? '',
      data_cotacao: hoje,
      fonte_info: '',
      observacoes: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (d: FormOut) => {
      if (ehMp) {
        return mpsApi.atualizarPreco(id, {
          preco_kg_brl: d.preco,
          fornecedor: d.fornecedor as string,
          data_cotacao: d.data_cotacao,
          fonte_info: d.fonte_info as string,
          observacoes: d.observacoes || undefined,
        });
      }
      return embalagensApi.atualizarPreco(id, {
        preco_un_brl: d.preco,
        fornecedor: d.fornecedor || undefined,
        data_cotacao: d.data_cotacao,
        fonte_info: d.fonte_info || undefined,
        observacoes: d.observacoes || undefined,
      });
    },
    onSuccess: (res: { variacao_pct?: number | null }) => {
      queryClient.invalidateQueries({ queryKey: [ehMp ? 'mps' : 'embalagens'] });
      const variacao = res?.variacao_pct;
      const sufixo =
        variacao != null && variacao !== 0
          ? ` (${variacao > 0 ? '+' : ''}${variacao}%)`
          : '';
      toast.success(`Preço atualizado${sufixo}`);
      reset();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao atualizar o preço.');
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
      title="Atualizar preço"
      description={nome}
      footer={
        <>
          <Button variant="ghost" onClick={fechar} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-atualizar-preco" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="text-sand" />}
            Salvar preço
          </Button>
        </>
      }
    >
      <form
        id="form-atualizar-preco"
        onSubmit={handleSubmit((d) => mutation.mutate(d))}
        className="space-y-4"
        noValidate
      >
        {precoAtual != null && precoAtual !== '' && (
          <p className="rounded-md bg-sand px-3 py-2 text-sm text-warm-700">
            Preço atual: <span className="font-medium text-ink tnum">{brl(precoAtual)}{unidade}</span>
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="preco">Novo preço ({ehMp ? 'R$/kg' : 'R$/un'}) *</Label>
          <Input id="preco" type="number" step="0.0001" min="0" {...register('preco')} />
          {errors.preco && <p className="text-caption text-error">{errors.preco.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="fornecedor">Fornecedor {ehMp && '*'}</Label>
          <Input id="fornecedor" {...register('fornecedor')} />
          {errors.fornecedor && <p className="text-caption text-error">{errors.fornecedor.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="data_cotacao">Data da cotação *</Label>
            <Input id="data_cotacao" type="date" {...register('data_cotacao')} />
            {errors.data_cotacao && (
              <p className="text-caption text-error">{errors.data_cotacao.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fonte_info">Fonte {ehMp && '*'}</Label>
            <Select id="fonte_info" {...register('fonte_info')}>
              <option value="">Selecione…</option>
              {FONTES.map((f) => (
                <option key={f.v} value={f.v}>
                  {f.l}
                </option>
              ))}
            </Select>
            {errors.fonte_info && (
              <p className="text-caption text-error">{errors.fonte_info.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="observacoes">Observações</Label>
          <Textarea id="observacoes" rows={2} {...register('observacoes')} />
        </div>
      </form>
    </Modal>
  );
}
