import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { Bell, Check, Info, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import type { Alerta } from '@/lib/types';
import { alertasApi } from '@/lib/services/alertas';

type StatusFiltro = 'pendentes' | 'resolvidos' | 'todos';

const SEVERIDADE: Record<string, { icon: LucideIcon; cor: string; bg: string }> = {
  info: { icon: Info, cor: 'text-info', bg: 'bg-info-soft' },
  warn: { icon: AlertTriangle, cor: 'text-warning', bg: 'bg-warning-soft' },
  critical: { icon: ShieldAlert, cor: 'text-error', bg: 'bg-error-soft' },
};

function fmtData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const FILTROS: { id: StatusFiltro; label: string }[] = [
  { id: 'pendentes', label: 'Pendentes' },
  { id: 'resolvidos', label: 'Resolvidos' },
  { id: 'todos', label: 'Todos' },
];

export function AdminAlertas() {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<StatusFiltro>('pendentes');
  const [soNaoLidos, setSoNaoLidos] = React.useState(false);

  const resolvido = status === 'pendentes' ? false : status === 'resolvidos' ? true : undefined;
  const lido = soNaoLidos ? false : undefined;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['alertas', { resolvido, lido }],
    queryFn: () => alertasApi.listar({ resolvido, lido }),
  });

  const marcarLido = useMutation({
    mutationFn: (id: number) => alertasApi.marcarLido(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alertas'] }),
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao marcar como lido.');
    },
  });

  const resolver = useMutation({
    mutationFn: (id: number) => alertasApi.resolver(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertas'] });
      toast.success('Alerta resolvido');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao resolver o alerta.');
    },
  });

  const alertas = data ?? [];

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border p-0.5">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatus(f.id)}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                status === f.id ? 'bg-ink text-sand' : 'text-warm-600 hover:text-ink',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-warm-700">
          <input
            type="checkbox"
            className="size-4 accent-gold-500"
            checked={soNaoLidos}
            onChange={(e) => setSoNaoLidos(e.target.checked)}
          />
          Só não lidos
        </label>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Spinner /> <span className="text-sm">Carregando alertas…</span>
        </div>
      )}

      {isError && (
        <div className="space-y-3 py-12 text-center">
          <p className="text-sm text-error">Não foi possível carregar os alertas.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!isLoading && !isError && alertas.length === 0 && (
        <EmptyState
          icon={Bell}
          title="Nenhum alerta"
          description={status === 'pendentes' ? 'Nada pendente por aqui.' : 'Nenhum alerta encontrado.'}
        />
      )}

      {!isLoading &&
        !isError &&
        alertas.map((a: Alerta) => {
          const sev = SEVERIDADE[a.severidade] ?? SEVERIDADE.info;
          const Icon = sev.icon;
          return (
            <div
              key={a.id}
              className={cn(
                'flex items-start gap-4 rounded-lg border border-border bg-surface p-4',
                !a.lido && 'border-l-2 border-l-gold-500',
              )}
            >
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-md', sev.bg, sev.cor)}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{a.titulo}</span>
                  {!a.lido && <Badge variant="gold">Novo</Badge>}
                  {a.resolvido && <Badge variant="success">Resolvido</Badge>}
                </div>
                {a.mensagem && <p className="text-sm text-warm-700">{a.mensagem}</p>}
                <p className="text-caption text-warm-500">{fmtData(a.created_at)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!a.lido && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => marcarLido.mutate(a.id)}
                    disabled={marcarLido.isPending}
                  >
                    <Check className="size-4" /> Lido
                  </Button>
                )}
                {!a.resolvido && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resolver.mutate(a.id)}
                    disabled={resolver.isPending}
                  >
                    Resolver
                  </Button>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}
