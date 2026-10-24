import * as React from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { Search, Check, ArrowLeftRight, ClipboardCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/data/data-table';
import { RevisarNcmModal } from '@/components/data/revisar-ncm-modal';
import { useCan } from '@/auth/use-can';
import type { FormulaPendenteNcm } from '@/lib/types';
import { formulasApi } from '@/lib/services/formulas';
import { pctBR } from '@/lib/utils';

const PAGE_SIZE = 20;

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function AcessoRestrito() {
  return (
    <div className="space-y-4">
      <PageHeader title="Revisão de NCM" />
      <p className="text-sm text-muted-foreground">Acesso restrito.</p>
    </div>
  );
}

export default function RevisaoNcm() {
  const can = useCan();
  const queryClient = useQueryClient();

  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  // Abre só nas fórmulas já orçadas: as antigas do banco original entram sozinhas quando forem orçadas.
  const [emUso, setEmUso] = React.useState(true);
  const qDebounced = useDebounced(q);

  const aoBuscar = (v: string) => {
    setQ(v);
    setPage(1);
  };
  const aoFiltrar = (v: boolean) => {
    setEmUso(v);
    setPage(1);
  };

  const params = { q: qDebounced || undefined, page, pageSize: PAGE_SIZE, emUso };

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['formulas', 'pendentes-ncm', params],
    queryFn: () => formulasApi.listarPendentesNcm(params),
    placeholderData: keepPreviousData,
    enabled: can('formula:escrever'),
  });

  const [revisando, setRevisando] = React.useState<FormulaPendenteNcm | null>(null);
  const [confirmando, setConfirmando] = React.useState<FormulaPendenteNcm | null>(null);

  const confirmar = useMutation({
    mutationFn: (id: number) => formulasApi.revisarNcm(id, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formulas', 'pendentes-ncm'] });
      toast.success('NCM confirmado');
      setConfirmando(null);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao confirmar o NCM.');
    },
  });

  const columns = React.useMemo<ColumnDef<FormulaPendenteNcm, unknown>[]>(
    () => [
      {
        accessorKey: 'nome_produto',
        header: 'Fórmula',
        enableSorting: false,
        cell: ({ row }) => {
          const f = row.original;
          // Só o que ajuda a decidir o NCM: categoria (define o tipo de produto) e uso em orçamento (prioridade).
          const usos = f._count?.orcamentos ?? 0;
          const detalhe = [f.categoria, usos > 0 ? `${usos} orçamento${usos === 1 ? '' : 's'}` : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <div className="flex flex-col gap-0.5">
              <span className="inline-flex items-center gap-2">
                <span className="font-medium text-ink">{f.nome_produto}</span>
                {f.versao_codigo && (
                  <span className="text-caption text-warm-500">v{f.versao_codigo}</span>
                )}
              </span>
              {detalhe && <span className="text-caption text-warm-600">{detalhe}</span>}
            </div>
          );
        },
      },
      {
        id: 'ncm_sugerido',
        header: 'NCM sugerido',
        enableSorting: false,
        cell: ({ row }) => {
          const n = row.original.ncm;
          return (
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-ink">{n.ncm}</span>
              <span className="text-caption text-warm-600">
                {n.descricao} · IPI {pctBR(n.ipi_pct)}
              </span>
            </div>
          );
        },
      },
      {
        id: 'acoes',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const f = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
              <Button variant="ghost" size="sm" onClick={() => setConfirmando(f)}>
                <Check className="size-4" /> Confirmar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRevisando(f)}>
                <ArrowLeftRight className="size-4" /> Trocar
              </Button>
            </div>
          );
        },
      },
    ],
    [],
  );

  if (!can('formula:escrever')) return <AcessoRestrito />;

  const total = data?.total ?? 0;
  const contagem = data?.contagem;
  const plural = total === 1 ? '' : 's';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revisão de NCM"
        description={`${total} fórmula${plural} ${emUso ? 'já orçada' + plural + ' ' : ''}pendente${plural} de revisão · as mais orçadas primeiro`}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading || (isFetching && !data)}
        error={isError ? true : undefined}
        onRetry={() => refetch()}
        emptyIcon={ClipboardCheck}
        emptyTitle="Nada pendente"
        emptyDescription={
          q
            ? 'Ajuste a busca.'
            : emUso
              ? 'Todas as fórmulas já orçadas têm o NCM revisado.'
              : 'Todas as associações NCM foram revisadas.'
        }
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          totalPages: data?.totalPages ?? 1,
          onPageChange: setPage,
        }}
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-500" />
              <Input
                value={q}
                onChange={(e) => aoBuscar(e.target.value)}
                placeholder="Buscar por nome da fórmula…"
                className="pl-9"
              />
            </div>
            <Button variant={emUso ? 'gold' : 'secondary'} size="sm" onClick={() => aoFiltrar(true)}>
              Já orçadas{contagem ? ` (${contagem.em_uso.toLocaleString('pt-BR')})` : ''}
            </Button>
            <Button variant={emUso ? 'secondary' : 'gold'} size="sm" onClick={() => aoFiltrar(false)}>
              Todas{contagem ? ` (${contagem.todas.toLocaleString('pt-BR')})` : ''}
            </Button>
          </div>
        }
      />

      {/* Trocar NCM (3B) */}
      <RevisarNcmModal open={!!revisando} formula={revisando} onClose={() => setRevisando(null)} />

      {/* Confirmar NCM (inline) */}
      <ConfirmDialog
        open={!!confirmando}
        onClose={() => setConfirmando(null)}
        onConfirm={() => confirmando && confirmar.mutate(confirmando.id)}
        loading={confirmar.isPending}
        title="Confirmar NCM"
        confirmLabel="Confirmar"
        description={
          confirmando && (
            <>
              Confirmar o NCM <strong className="text-ink">{confirmando.ncm.ncm}</strong> (
              {confirmando.ncm.descricao}) para{' '}
              <strong className="text-ink">{confirmando.nome_produto}</strong>?
            </>
          )
        }
      />
    </div>
  );
}
