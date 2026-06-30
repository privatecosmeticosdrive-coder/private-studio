import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, RotateCcw, FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/data/data-table';
import { NcmFormModal } from '@/components/data/ncm-form-modal'; // Peça 3 (ainda não existe)
import { useAuth } from '@/auth/auth-context';
import { cn } from '@/lib/utils';
import type { Ncm } from '@/lib/types';
import { ncmApi } from '@/lib/services/matriz-custo';

/** Acesso restrito (mesmo padrão de matriz-custo.tsx). */
function AcessoRestrito() {
  return (
    <div className="space-y-4">
      <PageHeader title="NCM" />
      <p className="text-sm text-muted-foreground">Acesso restrito.</p>
    </div>
  );
}

export default function NcmPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // GATE otimista (UX): a autoridade real é o AcessoCustoGuard no backend.
  const liberado = !!user && (user.pode_ver_custos || user.role === 'admin');

  const [q, setQ] = React.useState('');
  const [incluirInativos, setIncluirInativos] = React.useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['matriz-custo', 'ncm', incluirInativos],
    queryFn: () => ncmApi.listar(incluirInativos),
    enabled: liberado,
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<Ncm | null>(null);
  const [excluindo, setExcluindo] = React.useState<Ncm | null>(null);

  const novo = () => {
    setEditando(null);
    setFormOpen(true);
  };
  const editar = (n: Ncm) => {
    setEditando(n);
    setFormOpen(true);
  };

  const remover = useMutation({
    mutationFn: (id: number) => ncmApi.remover(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matriz-custo', 'ncm'] });
      toast.success('NCM excluída');
      setExcluindo(null);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Não foi possível excluir a NCM.');
    },
  });

  const reativar = useMutation({
    mutationFn: (id: number) => ncmApi.atualizar(id, { ativo: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matriz-custo', 'ncm'] });
      toast.success('NCM reativada');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Não foi possível reativar a NCM.');
    },
  });

  const columns = React.useMemo<ColumnDef<Ncm, unknown>[]>(
    () => [
      {
        accessorKey: 'ncm',
        header: 'NCM',
        cell: ({ row }) => {
          const n = row.original;
          return (
            <div className={cn('flex items-center gap-2', !n.ativo && 'opacity-50')}>
              <span className="font-mono font-medium text-ink">{n.ncm}</span>
              {n.provisorio && <Badge variant="warning">Provisório</Badge>}
              {!n.ativo && <Badge variant="neutral">Inativo</Badge>}
            </div>
          );
        },
      },
      {
        accessorKey: 'descricao',
        header: 'Descrição',
        cell: ({ row }) => (
          <span className={cn('text-ink', !row.original.ativo && 'opacity-50')}>
            {row.original.descricao}
          </span>
        ),
      },
      {
        accessorKey: 'ipi_pct',
        header: 'IPI',
        cell: ({ row }) => (
          <span className={cn('tnum text-warm-700', !row.original.ativo && 'opacity-50')}>
            {row.original.ipi_pct}%
          </span>
        ),
      },
      {
        accessorKey: 'monofasico',
        header: 'Monofásico',
        cell: ({ row }) => (
          <span className={cn('text-warm-700', !row.original.ativo && 'opacity-50')}>
            {row.original.monofasico ? 'Sim' : '—'}
          </span>
        ),
      },
      {
        id: 'acoes',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const n = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
              {n.ativo ? (
                <>
                  <Button variant="ghost" size="icon" onClick={() => editar(n)} aria-label="Editar NCM">
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setExcluindo(n)}
                    aria-label="Excluir NCM"
                    className="text-error hover:bg-error-soft"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => reativar.mutate(n.id)}
                  disabled={reativar.isPending}
                  aria-label="Reativar NCM"
                >
                  <RotateCcw className="size-4" /> Reativar
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [reativar],
  );

  // filtro client-side por código / descrição (lista pequena, sem paginação)
  const linhas = React.useMemo(() => {
    const todos = data ?? [];
    const termo = q.trim().toLowerCase();
    if (!termo) return todos;
    return todos.filter((n) =>
      [n.ncm, n.descricao].some((campo) => campo.toLowerCase().includes(termo)),
    );
  }, [data, q]);

  if (!liberado) return <AcessoRestrito />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="NCM"
        description="Códigos NCM, alíquota de IPI e regime monofásico usados no cálculo de custo."
        actions={
          <Button onClick={novo}>
            <Plus className="size-4" /> Novo NCM
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={linhas}
        loading={isLoading}
        error={isError ? true : undefined}
        onRetry={() => refetch()}
        emptyIcon={FileText}
        emptyTitle="Nenhuma NCM encontrada"
        emptyDescription={q ? 'Ajuste a busca.' : 'Cadastre a primeira NCM.'}
        emptyAction={
          !q && (
            <Button onClick={novo}>
              <Plus className="size-4" /> Novo NCM
            </Button>
          )
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-500" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por código ou descrição…"
                className="pl-9"
              />
            </div>
            <Button
              variant={incluirInativos ? 'gold' : 'secondary'}
              size="sm"
              onClick={() => setIncluirInativos((v) => !v)}
            >
              Incluir inativos
            </Button>
          </div>
        }
      />

      {/* Modais */}
      <NcmFormModal open={formOpen} ncm={editando} onClose={() => setFormOpen(false)} />

      <ConfirmDialog
        open={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={() => excluindo && remover.mutate(excluindo.id)}
        loading={remover.isPending}
        destructive
        title="Excluir NCM"
        confirmLabel="Excluir"
        description={
          excluindo && (
            <>
              Tem certeza que deseja excluir a NCM{' '}
              <strong className="text-ink">{excluindo.ncm}</strong>? Ela fica inativa (soft-delete) e
              pode ser reativada depois com o filtro “Incluir inativos”.
            </>
          )
        }
      />
    </div>
  );
}
