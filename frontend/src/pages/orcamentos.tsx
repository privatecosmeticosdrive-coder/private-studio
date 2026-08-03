import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search, FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DataTable } from '@/components/data/data-table';
import { StatusOrcamentoBadge } from '@/components/ui/status-badge';
import { useCan } from '@/auth/use-can';
import { brl } from '@/lib/utils';
import {
  MOTIVOS_RECUSA,
  MOTIVO_RECUSA_LABEL,
  STATUS_ORCAMENTO_LABEL,
  type OrcamentoListItem,
} from '@/lib/types';
import { orcamentosApi } from '@/lib/services/orcamentos';

const STATUS_OPCOES = Object.keys(STATUS_ORCAMENTO_LABEL);

export default function Orcamentos() {
  const navigate = useNavigate();
  const can = useCan();

  const [q, setQ] = React.useState('');
  const [status, setStatus] = React.useState('');
  // FASE 3 — filtro por motivo de recusa; só faz sentido com status=recusado.
  const [motivo, setMotivo] = React.useState('');
  const [page, setPage] = React.useState(1);
  const pageSize = 20;

  // filtros resetam a paginação para a primeira página
  const filtrarQ = (valor: string) => {
    setQ(valor);
    setPage(1);
  };
  const filtrarStatus = (valor: string) => {
    setStatus(valor);
    // sair de "recusado" zera o motivo — senão o filtro fica ativo e invisível,
    // e a lista viria vazia sem explicação (UI nunca mente).
    if (valor !== 'recusado') setMotivo('');
    setPage(1);
  };
  const filtrarMotivo = (valor: string) => {
    setMotivo(valor);
    setPage(1);
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['orcamentos', 'lista', { q, status, motivo, page }],
    queryFn: () =>
      orcamentosApi.listar({
        q: q || undefined,
        status: status || undefined,
        motivo: motivo || undefined,
        page,
        pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const columns = React.useMemo<ColumnDef<OrcamentoListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'numero',
        header: 'Nº',
        cell: ({ row }) => <span className="tnum font-medium text-ink">#{row.original.numero}</span>,
      },
      {
        accessorKey: 'produto',
        header: 'Produto',
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.produto}</span>,
      },
      {
        id: 'cliente',
        header: 'Cliente',
        enableSorting: false,
        cell: ({ row }) => row.original.cliente?.nome || '—',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => <StatusOrcamentoBadge status={row.original.status} />,
      },
      {
        accessorKey: 'preco_cipi',
        header: 'Preço c/ IPI',
        enableSorting: false,
        cell: ({ row }) => <span className="tnum">{brl(row.original.preco_cipi)}</span>,
      },
      {
        accessorKey: 'score_global',
        header: 'Score',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.score_global != null ? (
            <span className="tnum">{row.original.score_global}</span>
          ) : (
            '—'
          ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orçamentos"
        description="Orçamentos calculados e em rascunho."
        actions={
          can('orcamento:escrever') && (
            <Button onClick={() => navigate('/orcamentos/novo')}>
              <Plus className="size-4" /> Novo orçamento
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        error={isError ? true : undefined}
        onRetry={() => refetch()}
        onRowClick={(o) => navigate(`/orcamentos/${o.id}`)}
        emptyIcon={FileText}
        emptyTitle="Nenhum orçamento encontrado"
        emptyDescription={q || status ? 'Ajuste os filtros.' : 'Crie o primeiro orçamento.'}
        emptyAction={
          can('orcamento:escrever') &&
          !q &&
          !status && (
            <Button onClick={() => navigate('/orcamentos/novo')}>
              <Plus className="size-4" /> Novo orçamento
            </Button>
          )
        }
        pagination={
          data
            ? {
                page: data.page,
                pageSize: data.pageSize,
                total: data.total,
                totalPages: data.totalPages,
                onPageChange: setPage,
              }
            : undefined
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-500" />
              <Input
                value={q}
                onChange={(e) => filtrarQ(e.target.value)}
                placeholder="Buscar por produto…"
                className="pl-9"
              />
            </div>
            <Select
              value={status}
              onChange={(e) => filtrarStatus(e.target.value)}
              className="w-auto min-w-[180px]"
            >
              <option value="">Todos os status</option>
              {STATUS_OPCOES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_ORCAMENTO_LABEL[s]}
                </option>
              ))}
            </Select>
            {/* FASE 3 — aparece só em "recusado": em qualquer outro status
                filtrar por motivo de recusa não significaria nada. */}
            {status === 'recusado' && (
              <Select
                value={motivo}
                onChange={(e) => filtrarMotivo(e.target.value)}
                className="w-auto min-w-[180px]"
              >
                <option value="">Todos os motivos</option>
                {MOTIVOS_RECUSA.map((m) => (
                  <option key={m} value={m}>
                    {MOTIVO_RECUSA_LABEL[m]}
                  </option>
                ))}
              </Select>
            )}
          </div>
        }
      />
    </div>
  );
}
