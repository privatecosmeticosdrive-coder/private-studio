import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';

export interface ServerPagination {
  page: number; // 1-based
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

interface DataTableProps<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  pagination?: ServerPagination;
  onRowClick?: (row: T) => void;
  toolbar?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  emptyAction?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  error,
  onRetry,
  pagination,
  onRowClick,
  toolbar,
  emptyTitle = 'Nada por aqui',
  emptyDescription,
  emptyIcon,
  emptyAction,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const nColunas = columns.length;
  const semDados = !loading && !error && data.length === 0;

  return (
    <div className="space-y-4">
      {toolbar}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border bg-sand/60">
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left font-mono text-caption uppercase tracking-wide text-warm-600"
                        style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 transition-colors hover:text-ink"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === 'asc' ? (
                              <ArrowUp className="size-3" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="size-3" />
                            ) : (
                              <ChevronsUpDown className="size-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          (flexRender(header.column.columnDef.header, header.getContext()) as React.ReactNode)
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {/* LOADING */}
              {loading && <SkeletonRows linhas={8} colunas={nColunas} />}

              {/* ERROR — `!!error` (error e `unknown`; `unknown &&` colapsaria o tipo do filho para unknown) */}
              {!loading && !!error && (
                <tr>
                  <td colSpan={nColunas} className="px-4 py-12">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="grid size-12 place-items-center rounded-lg bg-error-soft text-error">
                        <AlertTriangle className="size-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-ink">Não foi possível carregar</p>
                        <p className="text-sm text-muted-foreground">
                          Verifique a conexão e tente novamente.
                        </p>
                      </div>
                      {onRetry && (
                        <Button variant="outline" size="sm" onClick={onRetry}>
                          Tentar novamente
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {/* EMPTY */}
              {semDados && (
                <tr>
                  <td colSpan={nColunas}>
                    <EmptyState
                      icon={emptyIcon}
                      title={emptyTitle}
                      description={emptyDescription}
                      action={emptyAction}
                    />
                  </td>
                </tr>
              )}

              {/* DADOS */}
              {!loading &&
                !error &&
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(
                      'border-b border-border last:border-0 transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-sand/60',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3.5 text-ink">
                        {flexRender(cell.column.columnDef.cell, cell.getContext()) as React.ReactNode}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* PAGINACAO server-side */}
        {pagination && !error && (
          <PaginacaoFooter pagination={pagination} carregando={!!loading} qtdNaPagina={data.length} />
        )}
      </div>
    </div>
  );
}

/** Linhas de skeleton durante o loading. Componente nao-generico de proposito. */
function SkeletonRows({ linhas, colunas }: { linhas: number; colunas: number }) {
  return (
    <>
      {Array.from({ length: linhas }, (_, i) => (
        <tr key={`sk-${i}`} className="border-b border-border last:border-0">
          {Array.from({ length: colunas }, (_, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="h-3.5 w-full max-w-[140px] animate-pulse rounded bg-warm-100" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function PaginacaoFooter({
  pagination,
  carregando,
  qtdNaPagina,
}: {
  pagination: ServerPagination;
  carregando: boolean;
  qtdNaPagina: number;
}) {
  const { page, pageSize, total, totalPages, onPageChange } = pagination;
  const inicio = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const fim = (page - 1) * pageSize + qtdNaPagina;

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border bg-sand/40 px-4 py-3">
      <p className="text-caption text-warm-600 tnum">
        {carregando ? (
          <span className="inline-flex items-center gap-2">
            <Spinner /> Carregando…
          </span>
        ) : (
          <>
            {inicio}–{fim} de {total}
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1 || carregando}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4" /> Anterior
        </Button>
        <span className="text-caption text-warm-600 tnum">
          {page} / {Math.max(1, totalPages)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= totalPages || carregando}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
