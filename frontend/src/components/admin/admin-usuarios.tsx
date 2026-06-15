import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { Plus, Pencil, UserX, UserCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data/data-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { UserFormModal } from '@/components/admin/user-form-modal';
import { useAuth } from '@/auth/auth-context';
import { ROLE_LABEL, type Usuario } from '@/lib/types';
import { usersApi } from '@/lib/services/users';

function RoleBadge({ role }: { role: Usuario['role'] }) {
  return <Badge variant={role === 'admin' ? 'gold' : 'neutral'}>{ROLE_LABEL[role]}</Badge>;
}

export function AdminUsuarios() {
  const queryClient = useQueryClient();
  const { user: atual } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.listar(),
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<Usuario | null>(null);
  const [alvoStatus, setAlvoStatus] = React.useState<Usuario | null>(null);

  const novo = () => {
    setEditando(null);
    setFormOpen(true);
  };
  const editar = (u: Usuario) => {
    setEditando(u);
    setFormOpen(true);
  };

  const mudarStatus = useMutation({
    mutationFn: (u: Usuario) => (u.ativo ? usersApi.desativar(u.id) : usersApi.reativar(u.id)),
    onSuccess: (_res, u) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(u.ativo ? 'Usuário desativado' : 'Usuário reativado');
      setAlvoStatus(null);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao alterar o status do usuário.');
    },
  });

  const columns = React.useMemo<ColumnDef<Usuario, unknown>[]>(
    () => [
      {
        accessorKey: 'nome',
        header: 'Nome',
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.nome}</span>,
      },
      {
        accessorKey: 'email',
        header: 'E-mail',
        cell: ({ row }) => <span className="text-warm-700">{row.original.email}</span>,
      },
      {
        accessorKey: 'role',
        header: 'Papel',
        cell: ({ row }) => <RoleBadge role={row.original.role} />,
      },
      {
        accessorKey: 'ativo',
        header: 'Status',
        cell: ({ row }) =>
          row.original.ativo ? (
            <Badge variant="success">Ativo</Badge>
          ) : (
            <Badge variant="neutral">Inativo</Badge>
          ),
      },
      {
        id: 'acoes',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original;
          const ehProprio = atual?.id === u.id;
          return (
            <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
              <Button variant="ghost" size="icon" onClick={() => editar(u)} aria-label="Editar usuário">
                <Pencil className="size-4" />
              </Button>
              {/* não permite desativar o próprio usuário (o backend também bloqueia) */}
              {!ehProprio &&
                (u.ativo ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAlvoStatus(u)}
                    aria-label="Desativar usuário"
                    className="text-error hover:bg-error-soft"
                  >
                    <UserX className="size-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAlvoStatus(u)}
                    aria-label="Reativar usuário"
                    className="text-success hover:bg-success-soft"
                  >
                    <UserCheck className="size-4" />
                  </Button>
                ))}
            </div>
          );
        },
      },
    ],
    [atual],
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={novo}>
          <Plus className="size-4" /> Novo usuário
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        loading={isLoading}
        error={isError ? true : undefined}
        onRetry={() => refetch()}
        emptyIcon={Users}
        emptyTitle="Nenhum usuário cadastrado"
        emptyDescription="Crie o primeiro acesso da equipe."
        emptyAction={
          <Button onClick={novo}>
            <Plus className="size-4" /> Novo usuário
          </Button>
        }
      />

      <UserFormModal open={formOpen} usuario={editando} onClose={() => setFormOpen(false)} />

      <ConfirmDialog
        open={!!alvoStatus}
        onClose={() => setAlvoStatus(null)}
        onConfirm={() => alvoStatus && mudarStatus.mutate(alvoStatus)}
        loading={mudarStatus.isPending}
        destructive={!!alvoStatus?.ativo}
        title={alvoStatus?.ativo ? 'Desativar usuário' : 'Reativar usuário'}
        confirmLabel={alvoStatus?.ativo ? 'Desativar' : 'Reativar'}
        description={
          alvoStatus && (
            <>
              {alvoStatus.ativo ? (
                <>
                  Desativar <strong className="text-ink">{alvoStatus.nome}</strong>? O acesso será
                  bloqueado, mas o histórico é preservado. Pode ser reativado depois.
                </>
              ) : (
                <>
                  Reativar <strong className="text-ink">{alvoStatus.nome}</strong>? O acesso ao
                  sistema será restaurado.
                </>
              )}
            </>
          )
        }
      />
    </div>
  );
}
