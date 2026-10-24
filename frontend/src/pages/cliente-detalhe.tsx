import * as React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, FileDown, FileSignature, FileText, Pencil, PenLine, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatusOrcamentoBadge } from '@/components/ui/status-badge';
import { ClienteFormModal } from '@/components/data/cliente-form-modal';
import { useCan } from '@/auth/use-can';
import { brl, cn } from '@/lib/utils';
import type { CondicoesProposta, OrcamentoListItem, PropostaListItem } from '@/lib/types';
import { clientesApi } from '@/lib/services/clientes';
import { orcamentosApi } from '@/lib/services/orcamentos';
import { propostasApi } from '@/lib/services/propostas';

const STATUS_PROPOSTA: Record<string, { rotulo: string; variant: 'gold' | 'success' | 'neutral' }> = {
  emitida: { rotulo: 'Emitida — aguardando assinatura', variant: 'gold' },
  assinada: { rotulo: 'Assinada', variant: 'success' },
  cancelada: { rotulo: 'Cancelada', variant: 'neutral' },
};

const REGIME: Record<string, string> = {
  simples: 'Simples Nacional',
  lucro_real_presumido: 'Lucro real/presumido',
  consumidor_final_cpf: 'Consumidor final (CPF)',
};

function mensagemErro(err: unknown, padrao: string) {
  const m = (err as AxiosError<{ message?: string | string[] }>).response?.data?.message;
  return Array.isArray(m) ? m[0] : m || padrao;
}

/** Só pode entrar numa proposta: calculado, rascunho ou enviado. */
const elegivel = (o: OrcamentoListItem) => o.preco_sipi != null && ['rascunho', 'enviado'].includes(String(o.status));

/**
 * Página do cliente (10/26): todos os orçamentos dele (um por fórmula), seleção
 * dos que saem na proposta comercial e as propostas emitidas, com PDF e aceite.
 */
export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const podeEscrever = can('orcamento:escrever');
  const [params, setParams] = useSearchParams();
  const aba = params.get('aba') === 'propostas' ? 'propostas' : 'orcamentos';
  const [editando, setEditando] = React.useState(false);

  const cliente = useQuery({ queryKey: ['clientes', id], queryFn: () => clientesApi.obter(id!), enabled: !!id });
  const propostas = useQuery({
    queryKey: ['propostas', 'cliente', id],
    queryFn: () => propostasApi.listar({ cliente_id: id }),
    enabled: !!id,
  });

  if (cliente.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Spinner className="text-warm-500" /> Carregando cliente…
      </div>
    );
  }
  if (cliente.isError || !cliente.data) {
    return <p className="py-20 text-center text-error">Não foi possível carregar o cliente.</p>;
  }
  const c = cliente.data;
  const perfilIncompleto = !c.regime_fiscal || !c.finalidade_padrao || !c.uf;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => navigate('/clientes')}
            className="mb-2 inline-flex items-center gap-1 text-caption text-warm-600 transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-3.5" /> Clientes
          </button>
          <h1 className="font-display text-h1 text-ink">{c.nome}</h1>
          <p className="mt-1 text-sm text-warm-600">
            {[c.cnpj, c.email, c.telefone].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-caption">
            <Badge variant={perfilIncompleto ? 'warning' : 'neutral'}>
              {c.regime_fiscal ? REGIME[c.regime_fiscal] ?? c.regime_fiscal : 'Regime não informado'}
              {c.uf ? ` · ${c.uf}` : ' · UF não informada'}
            </Badge>
            {perfilIncompleto && (
              <span className="text-warning">Perfil fiscal incompleto: o preço sai no pior caso.</span>
            )}
          </div>
        </div>
        {can('cliente:escrever') && (
          <Button variant="outline" onClick={() => setEditando(true)}>
            <Pencil className="size-4" /> Editar cliente
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {(
          [
            ['orcamentos', 'Orçamentos'],
            ['propostas', `Propostas${propostas.data ? ` (${propostas.data.length})` : ''}`],
          ] as const
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            type="button"
            onClick={() => setParams(chave === 'orcamentos' ? {} : { aba: chave }, { replace: true })}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              aba === chave ? 'border-gold-500 text-ink' : 'border-transparent text-warm-600 hover:text-ink',
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'orcamentos' ? (
        <AbaOrcamentos
          clienteId={c.id}
          podeEscrever={podeEscrever}
          onPropostaCriada={() => setParams({ aba: 'propostas' }, { replace: true })}
        />
      ) : (
        <AbaPropostas propostas={propostas.data ?? []} carregando={propostas.isLoading} podeEscrever={podeEscrever} />
      )}

      <ClienteFormModal open={editando} onClose={() => setEditando(false)} cliente={c} />
    </div>
  );
}

function AbaOrcamentos({
  clienteId,
  podeEscrever,
  onPropostaCriada,
}: {
  clienteId: string;
  podeEscrever: boolean;
  onPropostaCriada: () => void;
}) {
  const [verVersoes, setVerVersoes] = React.useState(false);
  const [selecionados, setSelecionados] = React.useState<string[]>([]);
  const [emitindo, setEmitindo] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['orcamentos', 'cliente', clienteId],
    queryFn: () => orcamentosApi.listar({ cliente_id: clienteId, pageSize: 200 }),
  });
  const todos = data?.data ?? [];
  // Uma linha por fórmula/produto: a versão mais nova de cada família (as anteriores sob demanda).
  const familia = (o: OrcamentoListItem) => o.versao_de_id ?? o.id;
  const ultima = new Map<string, OrcamentoListItem>();
  for (const o of todos) {
    const atual = ultima.get(familia(o));
    if (!atual || o.versao > atual.versao) ultima.set(familia(o), o);
  }
  const lista = verVersoes ? todos : todos.filter((o) => ultima.get(familia(o))?.id === o.id);
  const anteriores = todos.length - ultima.size;

  const alternar = (id: string) =>
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const escolhidos = selecionados.map((id) => todos.find((o) => o.id === id)).filter(Boolean) as OrcamentoListItem[];

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <p className="text-sm text-warm-600">
          Selecione os orçamentos calculados que vão na proposta. Cada fórmula é um orçamento.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {anteriores > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setVerVersoes((v) => !v)}>
              {verVersoes ? 'Só a versão mais nova' : `Mostrar versões anteriores (${anteriores})`}
            </Button>
          )}
          {podeEscrever && (
            <Button size="sm" disabled={!escolhidos.length} onClick={() => setEmitindo(true)}>
              <FileSignature className="size-4" /> Gerar proposta comercial{escolhidos.length ? ` (${escolhidos.length})` : ''}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-5 py-10 text-sm text-muted-foreground">
          <Spinner className="text-warm-500" /> Carregando orçamentos…
        </div>
      ) : !lista.length ? (
        <p className="px-5 py-10 text-center text-sm text-warm-600">Nenhum orçamento para este cliente.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption uppercase tracking-wide text-warm-500">
                <th className="w-10 px-5 py-2" />
                <th className="py-2 pr-3 font-medium">Orçamento</th>
                <th className="py-2 pr-3 font-medium">Produto</th>
                <th className="py-2 pr-3 text-right font-medium">Lote</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 text-right font-medium">s/ IPI</th>
                <th className="py-2 pr-5 text-right font-medium">c/ IPI</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((o) => {
                const pode = elegivel(o);
                const marcado = selecionados.includes(o.id);
                return (
                  <tr
                    key={o.id}
                    className={cn('border-b border-border/60', marcado && 'bg-gold-500/5', !pode && 'text-warm-500')}
                  >
                    <td className="px-5 py-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-[#b8832a]"
                        checked={marcado}
                        disabled={!pode || !podeEscrever}
                        onChange={() => alternar(o.id)}
                        aria-label={`Selecionar orçamento ${o.numero}`}
                        title={pode ? undefined : 'Calcule o orçamento (rascunho ou enviado) para incluir na proposta'}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Link to={`/orcamentos/${o.id}`} className="tnum font-medium text-ink hover:underline">
                        #{o.numero}
                      </Link>
                      {(o.versao > 1 || o.versao_de_id) && <span className="ml-1 text-caption text-warm-500">v{o.versao}</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-ink">{o.produto}</span>
                      {o.volume_un != null && <span className="text-warm-600"> · {Number(o.volume_un).toLocaleString('pt-BR')} mL/g</span>}
                      {o.ajuste_fac && (
                        <Badge variant="gold" className="ml-2">
                          FAC
                        </Badge>
                      )}
                    </td>
                    <td className="tnum py-2 pr-3 text-right">{o.quantidade?.toLocaleString('pt-BR') ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <StatusOrcamentoBadge status={o.status} />
                    </td>
                    <td className="tnum py-2 pr-3 text-right">{o.preco_sipi != null ? brl(o.preco_sipi) : '—'}</td>
                    <td className="tnum py-2 pr-5 text-right font-medium text-ink">
                      {o.preco_cipi != null ? brl(o.preco_cipi) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {emitindo && (
        <EmitirProposta
          clienteId={clienteId}
          orcamentos={escolhidos}
          onClose={() => setEmitindo(false)}
          onEmitida={() => {
            setEmitindo(false);
            setSelecionados([]);
            onPropostaCriada();
          }}
        />
      )}
    </Card>
  );
}

function EmitirProposta({
  clienteId,
  orcamentos,
  onClose,
  onEmitida,
}: {
  clienteId: string;
  orcamentos: OrcamentoListItem[];
  onClose: () => void;
  onEmitida: () => void;
}) {
  const queryClient = useQueryClient();
  const padrao = useQuery({ queryKey: ['propostas', 'condicoes-padrao'], queryFn: propostasApi.condicoesPadrao });
  // Padrão do servidor até o comercial mexer em algum campo.
  const [editado, setCond] = React.useState<CondicoesProposta | null>(null);
  const cond = editado ?? padrao.data ?? null;
  const [observacoes, setObservacoes] = React.useState('');

  const emitir = useMutation({
    mutationFn: async () => {
      const p = await propostasApi.criar({
        cliente_id: clienteId,
        orcamento_ids: orcamentos.map((o) => o.id),
        condicoes: cond ?? undefined,
        observacoes: observacoes.trim() || undefined,
      });
      await propostasApi.baixarPdf(p.id);
      return p;
    },
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ['propostas'] });
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      toast.success(`Proposta Nº ${p.numero} emitida. O PDF foi baixado; os orçamentos passaram para "enviado".`);
      onEmitida();
    },
    onError: (err) => toast.error(mensagemErro(err, 'Falha ao emitir a proposta.')),
  });

  const campo = (k: keyof CondicoesProposta, rotulo: string, linhas = 2) =>
    cond && (
      <div className="space-y-1">
        <Label>{rotulo}</Label>
        <Textarea rows={linhas} value={String(cond[k])} onChange={(e) => setCond({ ...cond, [k]: e.target.value })} />
      </div>
    );

  return (
    <Modal
      open
      size="lg"
      onClose={() => !emitir.isPending && onClose()}
      title="Gerar proposta comercial"
      description={`${orcamentos.length} ${orcamentos.length === 1 ? 'produto' : 'produtos'} · os textos abaixo vêm do modelo padrão e podem ser ajustados só nesta proposta.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={emitir.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => emitir.mutate()} disabled={emitir.isPending || !cond}>
            {emitir.isPending ? <Spinner className="text-sand" /> : <FileDown className="size-4" />}
            Emitir e baixar PDF
          </Button>
        </>
      }
    >
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <ul className="space-y-1 rounded-md border border-border p-3 text-sm">
          {orcamentos.map((o, i) => (
            <li key={o.id} className="flex flex-wrap justify-between gap-2">
              <span>
                {i + 1}. {o.produto} <span className="text-warm-500">#{o.numero}</span>
                {o.ajuste_fac && <span className="ml-1 text-caption text-gold-700">FAC</span>}
              </span>
              <span className="tnum text-warm-700">{brl(o.preco_cipi)} c/ IPI</span>
            </li>
          ))}
        </ul>
        {!cond ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="text-warm-500" /> Carregando condições…
          </div>
        ) : (
          <>
            {campo('pedido_minimo', 'Pedido mínimo', 1)}
            {campo('prazo_entrega', 'Prazo de entrega', 3)}
            {campo('forma_pagamento', 'Forma de pagamento', 2)}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Validade (dias)</Label>
                <Input
                  inputMode="numeric"
                  value={String(cond.validade_dias)}
                  onChange={(e) => setCond({ ...cond, validade_dias: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label>Frete</Label>
                <Input value={cond.frete} onChange={(e) => setCond({ ...cond, frete: e.target.value })} />
              </div>
            </div>
            {campo('amostras', 'Amostras (texto de ciência sobre possíveis encargos)', 4)}
            <div className="space-y-1">
              <Label>Observações desta proposta (opcional)</Label>
              <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            </div>
            <p className="text-caption text-warm-500">
              Reajustes e considerações finais (desenvolvimento de fórmula, ANVISA, laudos) entram no padrão.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

function AbaPropostas({
  propostas,
  carregando,
  podeEscrever,
}: {
  propostas: PropostaListItem[];
  carregando: boolean;
  podeEscrever: boolean;
}) {
  const queryClient = useQueryClient();
  const [baixando, setBaixando] = React.useState<string | null>(null);
  const [assinando, setAssinando] = React.useState<PropostaListItem | null>(null);
  const [cancelando, setCancelando] = React.useState<PropostaListItem | null>(null);

  const baixar = async (p: PropostaListItem) => {
    setBaixando(p.id);
    try {
      await propostasApi.baixarPdf(p.id);
    } catch {
      toast.error('Não foi possível gerar o PDF.');
    } finally {
      setBaixando(null);
    }
  };

  const cancelar = useMutation({
    mutationFn: (p: PropostaListItem) => propostasApi.cancelar(p.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propostas'] });
      toast.success('Proposta cancelada.');
      setCancelando(null);
    },
    onError: (err) => toast.error(mensagemErro(err, 'Falha ao cancelar.')),
  });

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Spinner className="text-warm-500" /> Carregando propostas…
      </div>
    );
  }
  if (!propostas.length) {
    return (
      <Card className="flex flex-col items-center gap-2 p-10 text-center">
        <FileText className="size-6 text-warm-500" />
        <p className="text-sm text-warm-600">Nenhuma proposta emitida. Selecione orçamentos na aba Orçamentos.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {propostas.map((p) => {
        const st = STATUS_PROPOSTA[p.status] ?? { rotulo: p.status, variant: 'neutral' as const };
        return (
          <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-h3 text-ink">Proposta Nº {p.numero}</span>
                <Badge variant={st.variant}>{st.rotulo}</Badge>
              </div>
              <p className="text-caption text-warm-600">
                {p._count.itens} {p._count.itens === 1 ? 'produto' : 'produtos'} · emitida em{' '}
                {new Date(p.emitida_em).toLocaleDateString('pt-BR')}
                {p.vendedor_nome ? ` por ${p.vendedor_nome}` : ''}
                {p.status === 'assinada' && p.assinada_em
                  ? ` · assinada em ${new Date(p.assinada_em).toLocaleDateString('pt-BR')} por ${p.assinada_por_nome}`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={baixando === p.id} onClick={() => baixar(p)}>
                {baixando === p.id ? <Spinner className="text-gold-500" /> : <FileDown className="size-4" />} PDF
              </Button>
              {podeEscrever && p.status === 'emitida' && (
                <>
                  <Button size="sm" onClick={() => setAssinando(p)}>
                    <PenLine className="size-4" /> Registrar assinatura
                  </Button>
                  <Button variant="ghost" size="sm" className="text-error hover:bg-error-soft" onClick={() => setCancelando(p)}>
                    <XCircle className="size-4" /> Cancelar
                  </Button>
                </>
              )}
            </div>
          </Card>
        );
      })}

      {assinando && <RegistrarAssinatura proposta={assinando} onClose={() => setAssinando(null)} />}
      <ConfirmDialog
        open={!!cancelando}
        onClose={() => setCancelando(null)}
        onConfirm={() => cancelando && cancelar.mutate(cancelando)}
        loading={cancelar.isPending}
        title={`Cancelar a proposta Nº ${cancelando?.numero ?? ''}`}
        confirmLabel="Cancelar proposta"
        description="Os orçamentos continuam como estão e podem entrar numa nova proposta."
      />
    </div>
  );
}

function RegistrarAssinatura({ proposta, onClose }: { proposta: PropostaListItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [nome, setNome] = React.useState('');
  const [documento, setDocumento] = React.useState('');
  const [data, setData] = React.useState(() => new Date().toISOString().slice(0, 10));

  const assinar = useMutation({
    mutationFn: () =>
      propostasApi.assinar(proposta.id, {
        assinada_por_nome: nome.trim(),
        assinada_por_documento: documento.trim() || undefined,
        assinada_em: data ? new Date(`${data}T12:00:00`).toISOString() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propostas'] });
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      toast.success('Assinatura registrada. Os orçamentos foram aprovados e a amostragem está liberada.');
      onClose();
    },
    onError: (err) => toast.error(mensagemErro(err, 'Falha ao registrar a assinatura.')),
  });

  return (
    <Modal
      open
      onClose={() => !assinar.isPending && onClose()}
      title={`Assinatura da proposta Nº ${proposta.numero}`}
      description="Registre quando o cliente devolver a proposta assinada. Só depois disso a amostra pode ser solicitada."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={assinar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => assinar.mutate()} disabled={assinar.isPending || nome.trim().length < 3}>
            {assinar.isPending && <Spinner className="text-sand" />}
            Registrar assinatura
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="ass-nome">Assinado por (nome)</Label>
          <Input id="ass-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ass-doc">CPF ou cargo (opcional)</Label>
          <Input id="ass-doc" value={documento} onChange={(e) => setDocumento(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ass-data">Data da assinatura</Label>
          <Input id="ass-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
