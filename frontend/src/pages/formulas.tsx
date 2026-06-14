import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, FlaskConical } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusFormulaBadge, OrigemBadge } from '@/components/ui/status-badge';
import { DataTable } from '@/components/data/data-table';
import { useCan } from '@/auth/use-can';
import { brl } from '@/lib/utils';
import type { Money } from '@/lib/types';
import { formulasApi, type ListarFormulasParams } from '@/lib/services/formulas';

const PAGE_SIZE = 50;

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Linha unificada para a tabela (cobre listagem paginada e busca GIN). */
interface LinhaFormula {
  id: number;
  nome_produto: string;
  versao_codigo: string | null;
  categoria: string | null;
  origem: string;
  status: string;
  custo_mp_kg?: Money;
  n_versoes?: number;
}

export default function Formulas() {
  const can = useCan();
  const navigate = useNavigate();

  const [q, setQ] = React.useState('');
  const [categoria, setCategoria] = React.useState('');
  const [origem, setOrigem] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [page, setPage] = React.useState(1);

  const qDebounced = useDebounced(q);
  const categoriaDebounced = useDebounced(categoria);
  const buscando = qDebounced.trim().length >= 2;

  const resetarPagina = () => setPage(1);

  // --- listagem paginada (maes) ---
  const params: ListarFormulasParams = {
    maes: true,
    categoria: categoriaDebounced || undefined,
    origem: origem || undefined,
    status: status || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const lista = useQuery({
    queryKey: ['formulas', 'lista', params],
    queryFn: () => formulasApi.listar(params),
    placeholderData: keepPreviousData,
    enabled: !buscando,
  });

  // --- busca GIN ---
  const busca = useQuery({
    queryKey: ['formulas', 'buscar', qDebounced],
    queryFn: () => formulasApi.buscar(qDebounced.trim()),
    enabled: buscando,
  });

  const columns = React.useMemo<ColumnDef<LinhaFormula, unknown>[]>(
    () => [
      {
        accessorKey: 'nome_produto',
        header: 'Produto',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="inline-flex items-baseline gap-2">
            <span className="font-medium text-ink">{row.original.nome_produto}</span>
            {row.original.versao_codigo && (
              <span className="font-mono text-caption text-warm-500">{row.original.versao_codigo}</span>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'categoria',
        header: 'Categoria',
        enableSorting: false,
        cell: ({ row }) => row.original.categoria || '—',
      },
      {
        accessorKey: 'origem',
        header: 'Origem',
        enableSorting: false,
        cell: ({ row }) => <OrigemBadge origem={row.original.origem} />,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => <StatusFormulaBadge status={row.original.status} />,
      },
      {
        accessorKey: 'n_versoes',
        header: 'Versões',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.n_versoes != null ? (
            <span className="tnum text-warm-700">{row.original.n_versoes}</span>
          ) : (
            '—'
          ),
      },
      {
        accessorKey: 'custo_mp_kg',
        header: 'Custo MP/kg',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.custo_mp_kg != null && row.original.custo_mp_kg !== '' ? (
            <span className="tnum">{brl(row.original.custo_mp_kg)}</span>
          ) : (
            '—'
          ),
      },
    ],
    [],
  );

  // normaliza a fonte ativa para LinhaFormula[]
  const linhas: LinhaFormula[] = React.useMemo(() => {
    if (buscando) {
      return (busca.data ?? []).map((f) => ({
        id: f.id,
        nome_produto: f.nome_produto,
        versao_codigo: f.versao_codigo,
        categoria: f.categoria,
        origem: f.origem,
        status: f.status,
      }));
    }
    return (lista.data?.data ?? []).map((f) => ({
      id: f.id,
      nome_produto: f.nome_produto,
      versao_codigo: f.versao_codigo,
      categoria: f.categoria,
      origem: f.origem,
      status: f.status,
      custo_mp_kg: f.custo_mp_kg,
      n_versoes: f._count?.versoes ?? 0,
    }));
  }, [buscando, busca.data, lista.data]);

  const carregando = buscando ? busca.isLoading : lista.isLoading;
  const erro = buscando ? busca.isError : lista.isError;
  const recarregar = () => (buscando ? busca.refetch() : lista.refetch());

  if (!can('formula:ler')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Fórmulas" />
        <p className="text-sm text-muted-foreground">Você não tem permissão para ver as fórmulas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fórmulas"
        description="Catálogo de fórmulas-mãe, versões e custo de matéria-prima."
      />

      <DataTable
        columns={columns}
        data={linhas}
        loading={carregando}
        error={erro ? true : undefined}
        onRetry={recarregar}
        onRowClick={(f) => navigate(`/formulas/${f.id}`)}
        emptyIcon={FlaskConical}
        emptyTitle={buscando ? 'Nenhuma fórmula encontrada' : 'Nenhuma fórmula'}
        emptyDescription={
          buscando
            ? `Sem resultados para “${qDebounced.trim()}”.`
            : categoria || origem || status
              ? 'Ajuste os filtros.'
              : 'Ainda não há fórmulas cadastradas.'
        }
        pagination={
          buscando
            ? undefined
            : {
                page,
                pageSize: PAGE_SIZE,
                total: lista.data?.total ?? 0,
                totalPages: lista.data?.totalPages ?? 1,
                onPageChange: setPage,
              }
        }
        toolbar={
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-500" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar fórmula por nome (busca textual)…"
                className="pl-9"
              />
            </div>

            {buscando ? (
              <p className="text-caption text-warm-500">
                Busca textual ativa — filtros e paginação não se aplicam. Mostrando os mais relevantes.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-48">
                  <Input
                    value={categoria}
                    onChange={(e) => {
                      setCategoria(e.target.value);
                      resetarPagina();
                    }}
                    placeholder="Categoria (exata)…"
                  />
                </div>
                <div className="w-44">
                  <Select
                    value={origem}
                    onChange={(e) => {
                      setOrigem(e.target.value);
                      resetarPagina();
                    }}
                  >
                    <option value="">Todas as origens</option>
                    <option value="banco_original">Banco original</option>
                    <option value="ia_gerada">IA</option>
                    <option value="pd_manual">P&D manual</option>
                  </Select>
                </div>
                <div className="w-40">
                  <Select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      resetarPagina();
                    }}
                  >
                    <option value="">Todos os status</option>
                    <option value="rascunho">Rascunho</option>
                    <option value="validada">Validada</option>
                    <option value="arquivada">Arquivada</option>
                  </Select>
                </div>
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}
