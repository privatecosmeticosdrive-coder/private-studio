import * as React from 'react';
import { createPortal } from 'react-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { brl, cn } from '@/lib/utils';
import type { Money } from '@/lib/types';
import { mpsApi } from '@/lib/services/materias-primas';

export interface MpSelecionada {
  id: number;
  codigo: number;
  nome: string;
  preco_kg_brl: Money;
}

interface MpAutocompleteProps {
  /** Texto exibido — nome da MP casada ou texto livre. */
  value: string;
  /** true quando há mp_id (casada via sugestão). */
  matched: boolean;
  /** Seleção de uma MP do catálogo (casa mp_id). */
  onSelect: (mp: MpSelecionada) => void;
  /** Digitação livre (vira mp_nome_original, limpa o match). */
  onText: (texto: string) => void;
  placeholder?: string;
}

/** Combobox de matéria-prima: aceita seleção do catálogo OU nome livre. */
export function MpAutocomplete({ value, matched, onSelect, onText, placeholder }: MpAutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState(value);
  const ref = React.useRef<HTMLDivElement>(null);
  // P2: dropdown via PORTAL (document.body) em position FIXED — nunca clipado
  // pelo overflow da tabela E imune a ancestral com transform (que fazia o
  // `fixed` renderizar deslocado do campo). Ancora na borda ESQUERDA do input,
  // imediatamente abaixo, com a MESMA largura; FLIPA pra cima quando não cabe.
  const ALTURA_MAX = 256; // max-h-64
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number } | null>(null);

  const medir = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cabeEmbaixo = r.bottom + 4 + ALTURA_MAX <= window.innerHeight;
    const top = cabeEmbaixo ? r.bottom + 4 : Math.max(8, r.top - 4 - ALTURA_MAX);
    setRect({ top, left: r.left, width: r.width });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    medir();
    window.addEventListener('scroll', medir, true); // true: captura scroll de containers
    window.addEventListener('resize', medir);
    return () => {
      window.removeEventListener('scroll', medir, true);
      window.removeEventListener('resize', medir);
    };
  }, [open, medir]);

  // debounce do termo de busca a partir do texto digitado
  React.useEffect(() => {
    const t = setTimeout(() => setQ(value), 200);
    return () => clearTimeout(t);
  }, [value]);

  // fecha ao clicar fora (o dropdown vive num portal — também conta como "dentro")
  const dropRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onClickFora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      const dentroDoCampo = ref.current?.contains(alvo) ?? false;
      const dentroDoDropdown = dropRef.current?.contains(alvo) ?? false;
      if (!dentroDoCampo && !dentroDoDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', onClickFora);
    return () => document.removeEventListener('mousedown', onClickFora);
  }, []);

  const termo = q.trim();
  const { data, isFetching } = useQuery({
    queryKey: ['mps', 'autocomplete', termo],
    queryFn: () => mpsApi.listar({ q: termo, pageSize: 20 }),
    enabled: open && termo.length >= 1,
    placeholderData: keepPreviousData,
  });

  const itens = data?.data ?? [];

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-warm-500" />
        <Input
          value={value}
          onChange={(e) => {
            onText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder={placeholder ?? 'Buscar matéria-prima…'}
          className={cn('h-9 pl-8 pr-7', matched && 'border-success/50')}
        />
        {matched && (
          <Check className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-success" />
        )}
      </div>

      {open && termo.length >= 1 && rect && createPortal(
        <div
          ref={dropRef}
          className="fixed z-50 max-h-64 overflow-auto rounded-md border border-border bg-card shadow-lg"
          style={{ top: rect.top, left: rect.left, width: rect.width }}
        >
          {isFetching && itens.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-3 text-caption text-warm-500">
              <Spinner /> Buscando…
            </div>
          ) : itens.length === 0 ? (
            <div className="px-3 py-3 text-caption text-warm-500">
              Nenhuma MP encontrada. O texto digitado será salvo como nome livre.
            </div>
          ) : (
            <ul className="py-1">
              {itens.map((mp) => (
                <li key={mp.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect({
                        id: mp.id,
                        codigo: mp.codigo,
                        nome: mp.nome,
                        preco_kg_brl: mp.preco_kg_brl,
                      });
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-sand/60"
                  >
                    <span className="min-w-0 truncate text-ink">
                      <span className="font-mono text-warm-500">{mp.codigo}</span> · {mp.nome}
                    </span>
                    <span className="tnum shrink-0 text-caption text-warm-600">
                      {brl(mp.preco_kg_brl)}/kg
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
