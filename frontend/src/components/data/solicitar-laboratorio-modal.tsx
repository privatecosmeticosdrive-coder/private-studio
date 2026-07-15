import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { Search } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { ncmApi } from '@/lib/services/matriz-custo';
import { orcamentosApi } from '@/lib/services/orcamentos';
import { pendenciasLabApi } from '@/lib/services/pendencias-lab';
import type { Candidata, UrgenciaLab } from '@/lib/types';

const URGENCIAS: { value: UrgenciaLab; label: string }[] = [
  { value: 'mesmo_dia', label: 'Mesmo dia (urgente)' },
  { value: 'dois_tres_dias', label: '2–3 dias úteis' },
  { value: 'ate_sete_dias', label: 'Até 7 dias úteis' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** contexto opcional: orçamento de origem (destrava ao concluir) e produto sugerido. */
  orcamentoId?: string;
  produtoInicial?: string;
  onCriada?: () => void;
}

/**
 * Solicitação ao Laboratório (Jornada de Laboratório, fatia 1). Gatilho (a):
 * fórmula não existe → lab formula do zero. NCM proposto OBRIGATÓRIO (D6). A
 * fórmula-base é OPCIONAL (reusa a busca de match) — o lab pode partir dela.
 */
export function SolicitarLaboratorioModal({
  open,
  onClose,
  orcamentoId,
  produtoInicial,
  onCriada,
}: Props) {
  const queryClient = useQueryClient();
  const [urgencia, setUrgencia] = React.useState<UrgenciaLab>('dois_tres_dias');
  const [descricao, setDescricao] = React.useState('');
  const [ncmId, setNcmId] = React.useState<string>('');
  const [base, setBase] = React.useState<Candidata | null>(null);
  const [buscaBase, setBuscaBase] = React.useState('');

  // reset ao abrir
  React.useEffect(() => {
    if (open) {
      setUrgencia('dois_tres_dias');
      setDescricao(produtoInicial ? `Desenvolver fórmula para: ${produtoInicial}` : '');
      setNcmId('');
      setBase(null);
      setBuscaBase('');
    }
  }, [open, produtoInicial]);

  const { data: ncms, isLoading: carregandoNcms } = useQuery({
    queryKey: ['ncm', 'ativos-select'],
    queryFn: () => ncmApi.listar(),
    enabled: open,
  });

  const buscarBase = useMutation({
    mutationFn: () => orcamentosApi.matchFormulas({ nome_projeto: buscaBase || undefined }),
    onError: () => toast.error('Falha ao buscar fórmulas.'),
  });
  // candidatas + sugestões (a base pode ser qualquer fórmula, mesmo sem match textual)
  const opcoesBase: Candidata[] = [
    ...(buscarBase.data?.candidatas ?? []),
    ...(buscarBase.data?.sugestoes_por_uso ?? []),
  ];

  const criar = useMutation({
    mutationFn: () =>
      pendenciasLabApi.criar({
        tipo: 'formulacao_nova',
        urgencia,
        descricao: descricao.trim(),
        ncm_proposto_id: Number(ncmId),
        orcamento_id: orcamentoId,
        formula_base_id: base?.formula_id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendencias-lab'] });
      toast.success('Solicitação enviada ao laboratório.');
      onCriada?.();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const m = err.response?.data?.message;
      toast.error(Array.isArray(m) ? m[0] : m || 'Falha ao enviar a solicitação.');
    },
  });

  const podeEnviar = descricao.trim().length >= 3 && ncmId !== '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Solicitar ao Laboratório"
      description="Peça o desenvolvimento de uma fórmula. O NCM proposto é obrigatório — a fórmula nascerá com ele."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => criar.mutate()} disabled={!podeEnviar || criar.isPending}>
            {criar.isPending && <Spinner className="text-sand" />}
            Enviar solicitação
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="urgencia">Urgência</Label>
          <Select id="urgencia" value={urgencia} onChange={(e) => setUrgencia(e.target.value as UrgenciaLab)}>
            {URGENCIAS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="descricao">Descrição do pedido *</Label>
          <Textarea
            id="descricao"
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="O que o cliente pediu, referências, restrições…"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ncm">NCM proposto * (a fórmula nasce com ele)</Label>
          <div className="relative">
            <Select id="ncm" value={ncmId} onChange={(e) => setNcmId(e.target.value)} disabled={carregandoNcms}>
              <option value="">Selecione o NCM…</option>
              {(ncms ?? []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.ncm}
                  {n.ex_tipi ? ` ${n.ex_tipi}` : ''} — {n.descricao}
                </option>
              ))}
            </Select>
            {carregandoNcms && (
              <Spinner className="absolute right-9 top-1/2 -translate-y-1/2 text-warm-500" />
            )}
          </div>
        </div>

        {/* Fórmula-base OPCIONAL — o lab pode partir de uma existente. */}
        <div className="space-y-2 rounded-md border border-border/60 bg-warm-50/50 p-3">
          <Label>Fórmula-base (opcional)</Label>
          {base ? (
            <div className="flex items-center justify-between gap-2 rounded border border-border bg-surface px-3 py-2 text-sm">
              <span className="text-ink">
                {base.nome_produto}
                {base.versao_codigo ? ` ${base.versao_codigo}` : ''}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setBase(null)}>
                Remover
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  value={buscaBase}
                  onChange={(e) => setBuscaBase(e.target.value)}
                  placeholder="Buscar fórmula para usar como base…"
                />
                <Button variant="outline" onClick={() => buscarBase.mutate()} disabled={buscarBase.isPending}>
                  {buscarBase.isPending ? <Spinner /> : <Search className="size-4" />}
                </Button>
              </div>
              {opcoesBase.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {opcoesBase.slice(0, 8).map((c) => (
                    <button
                      key={c.formula_id}
                      type="button"
                      onClick={() => setBase(c)}
                      className="block w-full rounded px-2 py-1.5 text-left text-caption text-warm-700 hover:bg-warm-100"
                    >
                      {c.nome_produto}
                      {c.versao_codigo ? ` ${c.versao_codigo}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
