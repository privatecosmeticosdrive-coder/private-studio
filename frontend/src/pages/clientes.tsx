import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/data/data-table';
import { ClienteFormModal } from '@/components/data/cliente-form-modal';
import { ClienteDetailModal } from '@/components/data/cliente-detail-modal';
import { useCan } from '@/auth/use-can';
import type { Cliente } from '@/lib/types';
import { clientesApi } from '@/lib/services/clientes';

export default function Clientes() {
  const can = useCan();
  const queryClient = useQueryClient();

  const [q, setQ] = React.useState('');

  // Backend retorna array puro — busca a lista inteira e filtra no client.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['clientes', 'lista'],
    queryFn: () => clientesApi.listar(),
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<Cliente | null>(null);
  const [detalhe, setDetalhe] = React.useState<Cliente | null>(null);
  const [excluindo, setExcluindo] = React.useState<Cliente | null>(null);

  const novo = () => {
    setEditando(null);
    setFormOpen(true);
  };
  const editar = (c: Cliente) => {
    setDetalhe(null);
    setEditando(c);
    setFormOpen(true);
  };
  const pedirExclusao = (c: Cliente) => {
    setDetalhe(null);
    setExcluindo(c);
  };

  const remover = useMutation({
    mutationFn: (id: string) => clientesApi.remover(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast.success('Cliente excluído');
      setExcluindo(null);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Não foi possível excluir o cliente.');
    },
  });

  const columns = React.useMemo<ColumnDef<Cliente, unknown>[]>(
    () => [
      {
        accessorKey: 'nome',
        header: 'Nome',
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.nome}</span>,
      },
      {
        accessorKey: 'cnpj',
        header: 'CNPJ',
        cell: ({ row }) => (
          <span className="font-mono text-warm-600">{row.original.cnpj || '—'}</span>
        ),
      },
      {
        accessorKey: 'email',
        header: 'E-mail',
        cell: ({ row }) => row.original.email || '—',
      },
      {
        accessorKey: 'telefone',
        header: 'Telefone',
        enableSorting: false,
        cell: ({ row }) => <span className="tnum">{row.original.telefone || '—'}</span>,
      },
      {
        id: 'acoes',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const c = row.original;
          if (!can('cliente:escrever') && !can('cliente:remover')) return null;
          return (
            <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
              {can('cliente:escrever') && (
                <Button variant="ghost" size="icon" onClick={() => editar(c)} aria-label="Editar cliente">
                  <Pencil className="size-4" />
                </Button>
              )}
              {can('cliente:remover') && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => pedirExclusao(c)}
                  aria-label="Excluir cliente"
                  className="text-error hover:bg-error-soft"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [can],
  );

  // filtro client-side por nome / cnpj / email / telefone
  const linhas = React.useMemo(() => {
    const todos = data ?? [];
    const termo = q.trim().toLowerCase();
    if (!termo) return todos;
    return todos.filter((c) =>
      [c.nome, c.cnpj, c.email, c.telefone]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(termo)),
    );
  }, [data, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Cadastro de clientes e orçamentos vinculados."
        actions={
          can('cliente:escrever') && (
            <Button onClick={novo}>
              <Plus className="size-4" /> Novo cliente
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        data={linhas}
        loading={isLoading}
        error={isError ? true : undefined}
        onRetry={() => refetch()}
        onRowClick={(c) => setDetalhe(c)}
        emptyIcon={Users}
        emptyTitle="Nenhum cliente encontrado"
        emptyDescription={
          q ? 'Ajuste a busca.' : 'Cadastre o primeiro cliente.'
        }
        emptyAction={
          can('cliente:escrever') &&
          !q && (
            <Button onClick={novo}>
              <Plus className="size-4" /> Novo cliente
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
                placeholder="Buscar por nome, CNPJ, e-mail…"
                className="pl-9"
              />
            </div>
          </div>
        }
      />

      {/* Modais */}
      <ClienteFormModal open={formOpen} cliente={editando} onClose={() => setFormOpen(false)} />

      <ClienteDetailModal
        open={!!detalhe}
        cliente={detalhe}
        onClose={() => setDetalhe(null)}
        onEditar={editar}
        onExcluir={pedirExclusao}
      />

      <ConfirmDialog
        open={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={() => excluindo && remover.mutate(excluindo.id)}
        loading={remover.isPending}
        destructive
        title="Excluir cliente"
        confirmLabel="Excluir"
        description={
          excluindo && (
            <>
              Tem certeza que deseja excluir <strong className="text-ink">{excluindo.nome}</strong>? Esta
              ação não pode ser desfeita. Clientes com orçamentos ou fórmulas vinculados não podem ser
              excluídos.
            </>
          )
        }
      />
    </div>
  );
}
