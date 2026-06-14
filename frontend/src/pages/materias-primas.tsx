import * as React from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search, Pencil, Tag, Boxes, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { VencidaBadge } from '@/components/ui/status-badge';
import { DataTable } from '@/components/data/data-table';
import { AtualizarPrecoModal } from '@/components/data/atualizar-preco-modal';
import { MpFormModal } from '@/components/data/mp-form-modal';
import { MpDetailModal } from '@/components/data/mp-detail-modal';
import { useCan } from '@/auth/use-can';
import { brl, cotacaoVencida } from '@/lib/utils';
import type { MateriaPrima } from '@/lib/types';
import { mpsApi, type ListarMpParams } from '@/lib/services/materias-primas';

const PAGE_SIZE = 20;

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

export default function MateriasPrimas() {
  const can = useCan();

  const [q, setQ] = React.useState('');
  const [fornecedor, setFornecedor] = React.useState('');
  const [vencidas, setVencidas] = React.useState(false);
  const [soAumento, setSoAumento] = React.useState(false); // filtro client-side (sem suporte no backend)
  const [page, setPage] = React.useState(1);
  const qDebounced = useDebounced(q);
  const fornecedorDebounced = useDebounced(fornecedor);

  const aoBuscar = (v: string) => {
    setQ(v);
    setPage(1);
  };
  const aoFornecedor = (v: string) => {
    setFornecedor(v);
    setPage(1);
  };
  const alternarVencidas = () => {
    setVencidas((v) => !v);
    setPage(1);
  };

  const params: ListarMpParams = {
    q: qDebounced || undefined,
    fornecedor: fornecedorDebounced || undefined,
    vencidas: vencidas || undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['mps', 'lista', params],
    queryFn: () => mpsApi.listar(params),
    placeholderData: keepPreviousData,
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<MateriaPrima | null>(null);
  const [detalhe, setDetalhe] = React.useState<MateriaPrima | null>(null);
  const [preco, setPreco] = React.useState<MateriaPrima | null>(null);

  const novo = () => {
    setEditando(null);
    setFormOpen(true);
  };
  const editar = (mp: MateriaPrima) => {
    setDetalhe(null);
    setEditando(mp);
    setFormOpen(true);
  };
  const abrirPreco = (mp: MateriaPrima) => {
    setDetalhe(null);
    setPreco(mp);
  };

  const columns = React.useMemo<ColumnDef<MateriaPrima, unknown>[]>(
    () => [
      {
        accessorKey: 'codigo',
        header: 'Código',
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono text-warm-600 tnum">{row.original.codigo}</span>,
      },
      {
        accessorKey: 'nome',
        header: 'Nome',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2">
            <span className="font-medium text-ink">{row.original.nome}</span>
            {row.original.flag_aumento_relevante && (
              <Badge variant="error">
                <TrendingUp className="size-3" /> Aumento
              </Badge>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'preco_kg_brl',
        header: 'Preço/kg',
        enableSorting: false,
        cell: ({ row }) => {
          const mp = row.original;
          const semPreco = mp.preco_kg_brl == null || mp.preco_kg_brl === '';
          return <span className="tnum">{semPreco ? '—' : brl(mp.preco_kg_brl)}</span>;
        },
      },
      {
        accessorKey: 'aumento_pct',
        header: 'Variação',
        enableSorting: false,
        cell: ({ row }) => {
          const a =
            row.original.aumento_pct != null && row.original.aumento_pct !== ''
              ? Number(row.original.aumento_pct)
              : null;
          if (a == null || a === 0) return <span className="text-warm-500">—</span>;
          return (
            <span className={a > 0 ? 'text-error tnum' : 'text-success tnum'}>
              {a > 0 ? '+' : ''}
              {a}%
            </span>
          );
        },
      },
      {
        accessorKey: 'fornecedor',
        header: 'Fornecedor',
        enableSorting: false,
        cell: ({ row }) => row.original.fornecedor || '—',
      },
      {
        accessorKey: 'data_cotacao',
        header: 'Cotação',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2">
            <span className="tnum">{fmtData(row.original.data_cotacao)}</span>
            {cotacaoVencida(row.original.data_cotacao) && <VencidaBadge />}
          </span>
        ),
      },
      {
        accessorKey: 'n_formulas_uso',
        header: 'Fórmulas',
        enableSorting: false,
        cell: ({ row }) => <span className="tnum text-warm-700">{row.original.n_formulas_uso}</span>,
      },
      {
        id: 'acoes',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const mp = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
              {can('mp:atualizar-preco') && (
                <Button variant="ghost" size="sm" onClick={() => abrirPreco(mp)}>
                  <Tag className="size-4" /> Preço
                </Button>
              )}
              {can('mp:escrever') && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => editar(mp)}
                  aria-label="Editar matéria-prima"
                >
                  <Pencil className="size-4" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [can],
  );

  // "Aumento relevante" nao tem filtro no backend — aplicado a pagina atual.
  const linhas = React.useMemo(() => {
    const base = data?.data ?? [];
    return soAumento ? base.filter((mp) => mp.flag_aumento_relevante) : base;
  }, [data, soAumento]);

  const temFiltro = !!(q || fornecedor || vencidas || soAumento);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Matérias-primas"
        description="Catálogo de insumos, cotações e variações de preço."
        actions={
          can('mp:escrever') && (
            <Button onClick={novo}>
              <Plus className="size-4" /> Nova matéria-prima
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        data={linhas}
        loading={isLoading || (isFetching && !data)}
        error={isError ? true : undefined}
        onRetry={() => refetch()}
        onRowClick={(mp) => setDetalhe(mp)}
        emptyIcon={Boxes}
        emptyTitle="Nenhuma matéria-prima encontrada"
        emptyDescription={
          soAumento && (data?.data?.length ?? 0) > 0
            ? 'Nenhum item com aumento relevante nesta página.'
            : temFiltro
              ? 'Ajuste os filtros ou limpe a busca.'
              : 'Cadastre a primeira matéria-prima.'
        }
        emptyAction={
          can('mp:escrever') &&
          !temFiltro && (
            <Button onClick={novo}>
              <Plus className="size-4" /> Nova matéria-prima
            </Button>
          )
        }
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 1,
          onPageChange: setPage,
        }}
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-500" />
              <Input
                value={q}
                onChange={(e) => aoBuscar(e.target.value)}
                placeholder="Buscar por nome…"
                className="pl-9"
              />
            </div>
            <div className="w-48">
              <Input
                value={fornecedor}
                onChange={(e) => aoFornecedor(e.target.value)}
                placeholder="Fornecedor…"
              />
            </div>
            <Button variant={vencidas ? 'gold' : 'secondary'} size="sm" onClick={alternarVencidas}>
              Vencidas
            </Button>
            <Button
              variant={soAumento ? 'gold' : 'secondary'}
              size="sm"
              onClick={() => setSoAumento((v) => !v)}
              title="Filtra a página atual (sem suporte no backend)"
            >
              Aumento relevante
            </Button>
          </div>
        }
      />

      {/* Modais */}
      <MpFormModal open={formOpen} mp={editando} onClose={() => setFormOpen(false)} />

      <MpDetailModal
        open={!!detalhe}
        mp={detalhe}
        onClose={() => setDetalhe(null)}
        onEditar={editar}
        onAtualizarPreco={abrirPreco}
      />

      {preco && (
        <AtualizarPrecoModal
          open={!!preco}
          onClose={() => setPreco(null)}
          tipo="mp"
          id={preco.codigo}
          nome={preco.nome}
          precoAtual={preco.preco_kg_brl}
          fornecedorAtual={preco.fornecedor}
        />
      )}
    </div>
  );
}
