import * as React from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search, Pencil, Tag, Package } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PrecoBadge } from '@/components/ui/status-badge';
import { DataTable } from '@/components/data/data-table';
import { AtualizarPrecoModal } from '@/components/data/atualizar-preco-modal';
import { EmbalagemFormModal } from '@/components/data/embalagem-form-modal';
import { EmbalagemDetailModal } from '@/components/data/embalagem-detail-modal';
import { useCan } from '@/auth/use-can';
import { brl } from '@/lib/utils';
import { TIPOS_EMBALAGEM, TIPO_EMBALAGEM_LABEL, type Embalagem } from '@/lib/types';
import { embalagensApi, type ListarEmbParams } from '@/lib/services/embalagens';

const PAGE_SIZE = 20;

/** Debounce simples para o campo de busca. */
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

export default function Embalagens() {
  const can = useCan();

  // filtros + paginacao
  const [q, setQ] = React.useState('');
  const [tipo, setTipo] = React.useState('');
  const [semCotacao, setSemCotacao] = React.useState(false);
  const [mostrarInativas, setMostrarInativas] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const qDebounced = useDebounced(q);

  // qualquer mudanca de filtro volta para a primeira pagina
  const aoBuscar = (v: string) => {
    setQ(v);
    setPage(1);
  };
  const aoTrocarTipo = (v: string) => {
    setTipo(v);
    setPage(1);
  };
  const alternarSemCotacao = () => {
    setSemCotacao((v) => !v);
    setPage(1);
  };
  const alternarInativas = () => {
    setMostrarInativas((v) => !v);
    setPage(1);
  };

  const params: ListarEmbParams = {
    q: qDebounced || undefined,
    tipo: tipo || undefined,
    sem_cotacao: semCotacao || undefined,
    ativo: mostrarInativas ? undefined : true,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['embalagens', 'lista', params],
    queryFn: () => embalagensApi.listar(params),
    placeholderData: keepPreviousData,
  });

  // estado dos modais
  const [formOpen, setFormOpen] = React.useState(false);
  const [editando, setEditando] = React.useState<Embalagem | null>(null);
  const [detalhe, setDetalhe] = React.useState<Embalagem | null>(null);
  const [preco, setPreco] = React.useState<Embalagem | null>(null);

  const novo = () => {
    setEditando(null);
    setFormOpen(true);
  };
  const editar = (e: Embalagem) => {
    setDetalhe(null);
    setEditando(e);
    setFormOpen(true);
  };
  const abrirPreco = (e: Embalagem) => {
    setDetalhe(null);
    setPreco(e);
  };

  const columns = React.useMemo<ColumnDef<Embalagem, unknown>[]>(
    () => [
      {
        accessorKey: 'codigo',
        header: 'Código',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-warm-600">{row.original.codigo || '—'}</span>
        ),
      },
      {
        accessorKey: 'nome',
        header: 'Nome',
        enableSorting: false,
        cell: ({ row }) => <span className="font-medium text-ink">{row.original.nome}</span>,
      },
      {
        accessorKey: 'tipo',
        header: 'Tipo',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant="neutral">
            {TIPO_EMBALAGEM_LABEL[row.original.tipo] ?? row.original.tipo}
          </Badge>
        ),
      },
      {
        accessorKey: 'volume_ml',
        header: 'Volume',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.volume_ml != null && row.original.volume_ml !== '' ? (
            <span className="tnum">{row.original.volume_ml} mL</span>
          ) : (
            '—'
          ),
      },
      {
        accessorKey: 'preco_un_brl',
        header: 'Preço/un',
        enableSorting: false,
        cell: ({ row }) => {
          const e = row.original;
          const semPreco = e.preco_un_brl == null || e.preco_un_brl === '';
          return (
            <span className="inline-flex items-center gap-2">
              <span className="tnum">{brl(e.preco_un_brl)}</span>
              <PrecoBadge estimado={e.preco_estimado} semPreco={semPreco} />
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
        cell: ({ row }) => <span className="tnum">{fmtData(row.original.data_cotacao)}</span>,
      },
      {
        id: 'acoes',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const e = row.original;
          if (!can('embalagem:escrever') && !can('embalagem:atualizar-preco')) return null;
          return (
            <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
              {can('embalagem:atualizar-preco') && (
                <Button variant="ghost" size="sm" onClick={() => abrirPreco(e)}>
                  <Tag className="size-4" /> Preço
                </Button>
              )}
              {can('embalagem:escrever') && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => editar(e)}
                  aria-label="Editar embalagem"
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

  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Embalagens"
        description="Catálogo de itens de embalagem, preços e cotações."
        actions={
          can('embalagem:escrever') && (
            <Button onClick={novo}>
              <Plus className="size-4" /> Nova embalagem
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading || (isFetching && !data)}
        error={isError ? true : undefined}
        onRetry={() => refetch()}
        onRowClick={(e) => setDetalhe(e)}
        emptyIcon={Package}
        emptyTitle="Nenhuma embalagem encontrada"
        emptyDescription={
          q || tipo || semCotacao
            ? 'Ajuste os filtros ou limpe a busca.'
            : 'Cadastre a primeira embalagem do catálogo.'
        }
        emptyAction={
          can('embalagem:escrever') &&
          !q &&
          !tipo &&
          !semCotacao && (
            <Button onClick={novo}>
              <Plus className="size-4" /> Nova embalagem
            </Button>
          )
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
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-500" />
              <Input
                value={q}
                onChange={(e) => aoBuscar(e.target.value)}
                placeholder="Buscar por nome…"
                className="pl-9"
              />
            </div>
            <div className="w-44">
              <Select value={tipo} onChange={(e) => aoTrocarTipo(e.target.value)}>
                <option value="">Todos os tipos</option>
                {TIPOS_EMBALAGEM.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_EMBALAGEM_LABEL[t] ?? t}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant={semCotacao ? 'gold' : 'secondary'}
              size="sm"
              onClick={alternarSemCotacao}
            >
              Sem cotação
            </Button>
            <Button
              variant={mostrarInativas ? 'gold' : 'secondary'}
              size="sm"
              onClick={alternarInativas}
            >
              Incluir inativas
            </Button>
          </div>
        }
      />

      {/* Modais */}
      <EmbalagemFormModal
        open={formOpen}
        embalagem={editando}
        onClose={() => setFormOpen(false)}
      />

      <EmbalagemDetailModal
        open={!!detalhe}
        embalagem={detalhe}
        onClose={() => setDetalhe(null)}
        onEditar={editar}
        onAtualizarPreco={abrirPreco}
      />

      {preco && (
        <AtualizarPrecoModal
          open={!!preco}
          onClose={() => setPreco(null)}
          tipo="embalagem"
          id={preco.id}
          nome={preco.nome}
          precoAtual={preco.preco_un_brl}
          fornecedorAtual={preco.fornecedor}
        />
      )}
    </div>
  );
}
