import { useForm } from 'react-hook-form';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import type { SystemConfig } from '@/lib/types';
import { systemConfigApi } from '@/lib/services/system-config';

const num = z.number({ message: 'Valor inválido' });

const schema = z.object({
  mo_folha_mensal: num.min(0, 'Não pode ser negativo'),
  mo_dias_uteis: z.number({ message: 'Valor inválido' }).int('Use um inteiro').min(1, 'Mínimo 1'),
  imposto_mp_pct: num.min(0, 'Não pode ser negativo'),
  imposto_mo_pct: num.min(0, 'Não pode ser negativo'),
  ipi_pct: num.min(0, 'Não pode ser negativo'),
  desvio_mp_pct: num.min(0, 'Não pode ser negativo'),
  frete_un_brl: num.min(0, 'Não pode ser negativo'),
  alerta_aumento_mp_pct: num.min(0, 'Não pode ser negativo'),
  alertas_ativos: z.boolean(),
});
type FormValues = z.infer<typeof schema>;
type CampoNum = Exclude<keyof FormValues, 'alertas_ativos'>;

/** Campo numérico do form (declarado fora do render — evita reset de estado). */
function Campo({
  register,
  errors,
  name,
  label,
  sufixo,
  step = '0.01',
}: {
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
  name: CampoNum;
  label: string;
  sufixo?: string;
  step?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        <Input id={name} type="number" step={step} min="0" {...register(name, { valueAsNumber: true })} />
        {sufixo && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-warm-500">
            {sufixo}
          </span>
        )}
      </div>
      {errors[name] && <p className="text-caption text-error">{errors[name]?.message as string}</p>}
    </div>
  );
}

function ConfigForm({ config }: { config: SystemConfig }) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      mo_folha_mensal: Number(config.mo_folha_mensal),
      mo_dias_uteis: config.mo_dias_uteis,
      imposto_mp_pct: Number(config.imposto_mp_pct),
      imposto_mo_pct: Number(config.imposto_mo_pct),
      ipi_pct: Number(config.ipi_pct),
      desvio_mp_pct: Number(config.desvio_mp_pct),
      frete_un_brl: Number(config.frete_un_brl),
      alerta_aumento_mp_pct: Number(config.alerta_aumento_mp_pct),
      alertas_ativos: config.alertas_ativos,
    },
  });

  const mutation = useMutation({
    mutationFn: (d: FormValues) => systemConfigApi.atualizar(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-config'] });
      toast.success('Parâmetros atualizados');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao salvar os parâmetros.');
    },
  });

  return (
    <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-6" noValidate>
      <p className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-caption text-warning">
        <AlertTriangle className="size-4 shrink-0" />
        Estes valores afetam TODOS os cálculos de orçamento. Altere com cuidado.
      </p>

      {/* Parâmetros de custo */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-4 font-medium text-ink">Parâmetros de custo</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo register={register} errors={errors} name="mo_folha_mensal" label="Folha mensal (MO)" sufixo="R$" step="0.01" />
          <Campo register={register} errors={errors} name="mo_dias_uteis" label="Dias úteis/mês" step="1" />
          <Campo register={register} errors={errors} name="frete_un_brl" label="Frete por unidade" sufixo="R$" step="0.0001" />
          <Campo register={register} errors={errors} name="imposto_mp_pct" label="Imposto MP" sufixo="%" step="0.001" />
          <Campo register={register} errors={errors} name="imposto_mo_pct" label="Imposto MO" sufixo="%" step="0.001" />
          <Campo register={register} errors={errors} name="ipi_pct" label="IPI" sufixo="%" step="0.001" />
          <Campo register={register} errors={errors} name="desvio_mp_pct" label="Desvio MP" sufixo="%" step="0.001" />
        </div>
      </div>

      {/* Alertas de preço */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-4 font-medium text-ink">Alertas de preço</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo register={register} errors={errors} name="alerta_aumento_mp_pct" label="Aumento relevante de MP" sufixo="%" step="0.01" />
          <label className="flex cursor-pointer items-center gap-3 pt-7">
            <input type="checkbox" className="size-4 accent-gold-500" {...register('alertas_ativos')} />
            <span className="text-sm font-medium text-ink">Alertas ativos</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending || !isDirty}>
          {mutation.isPending && <Spinner className="text-sand" />}
          Salvar parâmetros
        </Button>
      </div>
    </form>
  );
}

export function AdminConfig() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => systemConfigApi.obter(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-muted-foreground">
        <Spinner /> <span className="text-sm">Carregando parâmetros…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-error">Não foi possível carregar os parâmetros do sistema.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return <ConfigForm config={data} />;
}
