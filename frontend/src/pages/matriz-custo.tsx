import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { FieldErrors, FieldValues, Path, UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/auth/auth-context';
import { matrizCustoApi, parametroFiscalApi } from '@/lib/services/matriz-custo';
import type {
  MatrizCustoView,
  UpdateOperacionalPayload,
  UpdateFiscalPayload,
} from '@/lib/types';

const num = z.number({ message: 'Valor inválido' });

/** Campo numérico genérico (declarado fora do render — evita reset de estado). */
function Campo<T extends FieldValues>({
  register,
  errors,
  name,
  label,
  sufixo,
  step = '0.01',
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  name: Path<T>;
  label: string;
  sufixo?: string;
  step?: string;
}) {
  const msg = (errors as Record<string, { message?: string } | undefined>)[name]?.message;
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        <Input
          id={name}
          type="number"
          step={step}
          min="0"
          className={sufixo ? 'pr-14' : undefined}
          {...register(name, { valueAsNumber: true })}
        />
        {sufixo && (
          <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-caption text-warm-500">
            {sufixo}
          </span>
        )}
      </div>
      {msg && <p className="text-caption text-error">{msg}</p>}
    </div>
  );
}

/** Extrai a mensagem de erro da API (string | string[]) para o toast. */
function msgErro(err: AxiosError<{ message?: string | string[] }>, fallback: string) {
  const m = err.response?.data?.message;
  return Array.isArray(m) ? m[0] : m || fallback;
}

// ============================ FORM OPERACIONAL ============================

// eficiencia_linha é validada em % (0–100). O backend guarda fração (0–1):
// a conversão acontece no defaultValue (×100) e no submit (÷100). Ver abaixo.
const schemaOp = z.object({
  custo_fixo_mensal: num.min(0, 'Não pode ser negativo'),
  mo_dias_uteis: num.int('Use um inteiro').min(1, 'Mínimo 1').max(31, 'Máximo 31'),
  horas_dia: num.min(0, 'Não pode ser negativo').max(24, 'Máximo 24'),
  eficiencia_linha: num.min(0, 'Não pode ser negativo').max(100, 'Máximo 100'),
  desvio_mp_pct: num.min(0, 'Não pode ser negativo'),
  frete_un_brl: num.min(0, 'Não pode ser negativo'),
  margem_padrao_pct: num.min(0, 'Não pode ser negativo').max(99, 'Máximo 99'),
});
type OpValues = z.infer<typeof schemaOp>;

function FormOperacional({ op }: { op: MatrizCustoView['operacional'] }) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<OpValues>({
    resolver: zodResolver(schemaOp),
    defaultValues: {
      custo_fixo_mensal: op.custo_fixo_mensal ?? 0,
      mo_dias_uteis: op.mo_dias_uteis, // Int cru — sempre presente
      horas_dia: op.horas_dia ?? 0,
      // fração (0,75) -> % (75) para exibir. Sem isso o valor "anda" a cada save.
      eficiencia_linha: (op.eficiencia_linha ?? 0) * 100,
      desvio_mp_pct: op.desvio_mp_pct ?? 0,
      frete_un_brl: op.frete_un_brl ?? 0,
      margem_padrao_pct: op.margem_padrao_pct ?? 0,
    },
  });

  const mutation = useMutation({
    mutationFn: (p: UpdateOperacionalPayload) => matrizCustoApi.atualizarOperacional(p),
    onSuccess: (view) => {
      // o PATCH retorna o montarView completo -> semeia o cache (sem refetch).
      queryClient.setQueryData(['matriz-custo'], view);
      toast.success('Parâmetros operacionais atualizados');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      toast.error(msgErro(err, 'Falha ao salvar os parâmetros operacionais.'));
    },
  });

  return (
    <form
      // % -> fração (75 -> 0,75) antes de enviar. Contrapartida do ×100 no default.
      onSubmit={handleSubmit((d) => mutation.mutate({ ...d, eficiencia_linha: d.eficiencia_linha / 100 }))}
      className="space-y-4 rounded-lg border border-border bg-surface p-5"
      noValidate
    >
      <h3 className="font-medium text-ink">Operacional</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Campo register={register} errors={errors} name="custo_fixo_mensal" label="Custo fixo mensal" sufixo="R$" step="0.01" />
        <Campo register={register} errors={errors} name="mo_dias_uteis" label="Dias úteis/mês" step="1" />
        <Campo register={register} errors={errors} name="horas_dia" label="Horas/dia" sufixo="h" step="0.01" />
        <Campo register={register} errors={errors} name="eficiencia_linha" label="Eficiência da linha (%)" sufixo="%" step="0.01" />
        <Campo register={register} errors={errors} name="desvio_mp_pct" label="Desvio MP" sufixo="%" step="0.001" />
        <Campo register={register} errors={errors} name="frete_un_brl" label="Frete por unidade" sufixo="R$" step="0.0001" />
        <Campo register={register} errors={errors} name="margem_padrao_pct" label="Margem padrão" sufixo="%" step="0.01" />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending || !isDirty}>
          {mutation.isPending && <Spinner className="text-sand" />}
          Salvar operacional
        </Button>
      </div>
    </form>
  );
}

// ============================== FORM FISCAL ==============================

const schemaFiscal = z.object({
  icms_regime: num.min(0, 'Não pode ser negativo'),
  encomendante_simples: z.boolean(),
  pis_cofins_monofasico_pct: num.min(0, 'Não pode ser negativo'),
  pis_cofins_servico_pct: num.min(0, 'Não pode ser negativo'),
});
type FiscalValues = z.infer<typeof schemaFiscal>;

function FormFiscal({ fiscal }: { fiscal: MatrizCustoView['fiscal'] }) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FiscalValues>({
    resolver: zodResolver(schemaFiscal),
    defaultValues: {
      icms_regime: fiscal.icms_regime ?? 0,
      encomendante_simples: fiscal.encomendante_simples,
      pis_cofins_monofasico_pct: fiscal.pis_cofins_monofasico_pct ?? 0,
      pis_cofins_servico_pct: fiscal.pis_cofins_servico_pct ?? 0,
    },
  });

  const mutation = useMutation({
    mutationFn: (p: UpdateFiscalPayload) => matrizCustoApi.atualizarFiscal(p),
    onSuccess: (view) => {
      queryClient.setQueryData(['matriz-custo'], view);
      toast.success('Parâmetros fiscais atualizados');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      toast.error(msgErro(err, 'Falha ao salvar os parâmetros fiscais.'));
    },
  });

  // fiscais_provisorios NÃO entra aqui — é o banner da Parte 3.
  return (
    <form
      onSubmit={handleSubmit((d) => mutation.mutate(d))}
      className="space-y-4 rounded-lg border border-border bg-surface p-5"
      noValidate
    >
      <h3 className="font-medium text-ink">Fiscal</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Campo register={register} errors={errors} name="icms_regime" label="ICMS do regime" sufixo="%" step="0.001" />
        <Campo register={register} errors={errors} name="pis_cofins_monofasico_pct" label="PIS/COFINS monofásico" sufixo="%" step="0.001" />
        <Campo register={register} errors={errors} name="pis_cofins_servico_pct" label="PIS/COFINS serviço" sufixo="%" step="0.001" />
        <label className="flex cursor-pointer items-center gap-3 pt-7">
          <input type="checkbox" className="size-4 accent-gold-500" {...register('encomendante_simples')} />
          <span className="text-sm font-medium text-ink">Encomendante Simples Nacional</span>
        </label>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending || !isDirty}>
          {mutation.isPending && <Spinner className="text-sand" />}
          Salvar fiscal
        </Button>
      </div>
    </form>
  );
}

// ================= PARÂMETROS FISCAIS VERSIONADOS (F4 Fase A) =================

const CHAVES_PF: { chave: string; rotulo: string }[] = [
  { chave: 'pis_monofasico_pct', rotulo: 'PIS monofásico (%)' },
  { chave: 'cofins_monofasico_pct', rotulo: 'COFINS monofásico (%)' },
  { chave: 'pis_comum_pct', rotulo: 'PIS comum (%)' },
  { chave: 'cofins_comum_pct', rotulo: 'COFINS comum (%)' },
  { chave: 'icms_carga_art34_pct', rotulo: 'ICMS carga art.34 (%)' },
  { chave: 'icms_nominal_padrao_pct', rotulo: 'ICMS nominal padrão (%)' },
  { chave: 'industrializacao_caracterizada', rotulo: 'Industrialização caracterizada (0/1)' },
];
const rotuloPF = (chave: string) => CHAVES_PF.find((c) => c.chave === chave)?.rotulo ?? chave;

const schemaPF = z.object({
  chave: z.string().min(1, 'Escolha o parâmetro'),
  valor: num.min(0, 'Não pode ser negativo').max(100, 'Máximo 100'),
  vigencia_inicio: z.string().min(10, 'Informe a data'),
  fundamento_legal: z.string().min(10, 'Fundamento legal obrigatório (mín. 10 caracteres)'),
});
type PFValues = z.infer<typeof schemaPF>;

function SecaoParametrosFiscais({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['parametros-fiscais'],
    queryFn: () => parametroFiscalApi.listar(),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PFValues>({
    resolver: zodResolver(schemaPF),
    defaultValues: { chave: '', valor: 0, vigencia_inicio: '', fundamento_legal: '' },
  });

  const mutation = useMutation({
    mutationFn: (p: PFValues) => parametroFiscalApi.criar(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parametros-fiscais'] });
      reset();
      toast.success('Nova vigência registrada');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      toast.error(msgErro(err, 'Falha ao registrar a nova vigência.'));
    },
  });

  const visiveis = (data ?? []).filter((p) => mostrarHistorico || p.vigente);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-ink">Parâmetros fiscais versionados</h3>
          <p className="text-caption text-warm-500">
            Nova vigência cria uma linha nova — o histórico nunca é sobrescrito.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-warm-700">
          <input
            type="checkbox"
            className="size-4 accent-gold-500"
            checked={mostrarHistorico}
            onChange={(e) => setMostrarHistorico(e.target.checked)}
          />
          Mostrar histórico
        </label>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <Spinner /> <span className="text-sm">Carregando parâmetros fiscais…</span>
        </div>
      )}
      {isError && <p className="py-4 text-sm text-error">Não foi possível carregar os parâmetros fiscais.</p>}
      {!isLoading && !isError && visiveis.length === 0 && (
        <p className="py-4 text-sm text-muted-foreground">Sem parâmetros cadastrados.</p>
      )}

      {visiveis.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption text-warm-500">
                <th className="py-2 pr-4">Parâmetro</th>
                <th className="py-2 pr-4">Valor</th>
                <th className="py-2 pr-4">Vigência</th>
                <th className="py-2 pr-4">Fundamento legal</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium text-ink">{rotuloPF(p.chave)}</td>
                  <td className="py-2 pr-4">{p.valor.toLocaleString('pt-BR')}%</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {new Date(p.vigencia_inicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                    {' → '}
                    {p.vigencia_fim
                      ? new Date(p.vigencia_fim).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                      : 'aberta'}
                  </td>
                  <td className="max-w-md py-2 pr-4 text-warm-700">{p.fundamento_legal}</td>
                  <td className="py-2">
                    {p.vigente ? (
                      <span className="rounded bg-success-soft px-2 py-0.5 text-caption text-success">vigente</span>
                    ) : (
                      <span className="rounded bg-warm-100 px-2 py-0.5 text-caption text-warm-500">encerrada</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && (
        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="space-y-4 rounded-md border border-border/60 bg-warm-50/50 p-4"
          noValidate
        >
          <h4 className="text-sm font-medium text-ink">Nova vigência (admin)</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="chave">Parâmetro</Label>
              <select
                id="chave"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
                {...register('chave')}
              >
                <option value="">Selecione…</option>
                {CHAVES_PF.map((c) => (
                  <option key={c.chave} value={c.chave}>{c.rotulo}</option>
                ))}
              </select>
              {errors.chave && <p className="text-caption text-error">{errors.chave.message}</p>}
            </div>
            <Campo register={register} errors={errors} name="valor" label="Valor" sufixo="%" step="0.0001" />
            <div className="space-y-2">
              <Label htmlFor="vigencia_inicio">Início da vigência</Label>
              <Input id="vigencia_inicio" type="date" {...register('vigencia_inicio')} />
              {errors.vigencia_inicio && (
                <p className="text-caption text-error">{errors.vigencia_inicio.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fundamento_legal">Fundamento legal</Label>
              <Input
                id="fundamento_legal"
                placeholder="Lei/artigo/portaria que sustenta o valor"
                {...register('fundamento_legal')}
              />
              {errors.fundamento_legal && (
                <p className="text-caption text-error">{errors.fundamento_legal.message}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Spinner className="text-sand" />}
              Registrar vigência
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ============================ DERIVADOS (RO) ============================

/**
 * Cartão read-only. minutos_produtivos e custo_minuto são recalculados pelo
 * backend a cada save (DÍVIDA CONTROLADA F3/F4 — ponto único de verdade vem na F4).
 */
function CardDerivados({ derivados }: { derivados: MatrizCustoView['derivados'] }) {
  const { minutos_produtivos, custo_minuto } = derivados;
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="font-medium text-ink">Derivados</h3>
      <p className="mb-4 text-caption text-warm-500">
        Recalculados pelo sistema a cada salvamento — não editáveis.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-caption text-warm-500">Minutos produtivos/mês</span>
          <p className="text-sm font-medium text-ink">
            {minutos_produtivos == null
              ? '—'
              : minutos_produtivos.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="space-y-1">
          <span className="text-caption text-warm-500">Custo por minuto</span>
          <p className="text-sm font-medium text-ink">
            {custo_minuto == null
              ? '—'
              : `R$ ${custo_minuto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/min`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ================================ PÁGINA ================================

/** Mensagem de acesso restrito (padrão do admin.tsx — early-return inline). */
function AcessoRestrito() {
  return (
    <div className="space-y-4">
      <PageHeader title="Matriz de Custo" />
      <p className="text-sm text-muted-foreground">Acesso restrito.</p>
    </div>
  );
}

export default function MatrizCusto() {
  const { user } = useAuth();

  // GATE otimista (UX): flag em cache. A autoridade real é o AcessoCustoGuard
  // no backend — por isso o 403 também é tratado no isError abaixo.
  const liberado = !!user && (user.pode_ver_custos || user.role === 'admin');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['matriz-custo'],
    queryFn: () => matrizCustoApi.obter(),
    enabled: liberado, // não dispara o GET se o gate de UX já barrou
  });

  if (!liberado) return <AcessoRestrito />;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-muted-foreground">
        <Spinner /> <span className="text-sm">Carregando parâmetros…</span>
      </div>
    );
  }

  if (isError || !data) {
    // 401/403 = permissão revogada no banco (guard relê a cada request) -> restrito.
    const status = (error as AxiosError | null)?.response?.status;
    if (status === 401 || status === 403) return <AcessoRestrito />;
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-error">Não foi possível carregar a Matriz de Custo.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Matriz de Custo"
        description="Parâmetros operacionais e fiscais que alimentam o cálculo de custo."
      />
      <FormOperacional op={data.operacional} />
      <FormFiscal fiscal={data.fiscal} />
      <SecaoParametrosFiscais isAdmin={user?.role === 'admin'} />
      <CardDerivados derivados={data.derivados} />
    </div>
  );
}
