import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ScoreThermometer } from '@/components/data/score-thermometer';
import { brl, cn } from '@/lib/utils';
import type { CalculoJson } from '@/lib/types';

/** Linha de detalhe rótulo → valor. */
function Linha({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-caption text-warm-600">{rotulo}</span>
      <span className={cn('tnum text-sm', destaque ? 'font-semibold text-ink' : 'text-ink')}>
        {valor}
      </span>
    </div>
  );
}

/** Resultado do cálculo determinístico (somente leitura) — wizard e detalhe. */
export function ResultadoCalculo({ calc }: { calc: CalculoJson }) {
  return (
    <div className="space-y-5">
      {calc._preliminar && (
        <p className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-caption text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          {calc._aviso ?? 'Orçamento preliminar.'}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-caption uppercase tracking-wide text-warm-500">Preço sem IPI</p>
          <p className="mt-1 font-display text-h2 text-ink tnum">{brl(calc.resultado.preco_sipi)}</p>
          <p className="mt-1 text-caption text-warm-500">por unidade</p>
        </div>
        <div className="rounded-lg border border-gold-500 bg-gold-500/5 p-5">
          <p className="text-caption uppercase tracking-wide text-warm-500">Preço com IPI</p>
          <p className="mt-1 font-display text-h2 text-ink tnum">{brl(calc.resultado.preco_cipi)}</p>
          <p className="mt-1 text-caption text-warm-500">por unidade</p>
        </div>
        <div className="flex items-center justify-center rounded-lg border border-border bg-surface p-3">
          <ScoreThermometer score={calc.score_global} size={120} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h3 className="mb-2 font-medium text-ink">Custo de matéria-prima</h3>
          <Linha rotulo="MP base/un" valor={brl(calc.custo_mp.mp_base)} />
          <Linha rotulo={`Desvio (${calc.custo_mp.desvio_pct}%)`} valor={brl(calc.custo_mp.desvio)} />
          <Linha rotulo="Embalagem/un" valor={brl(calc.custo_mp.embalagem)} />
          <Linha rotulo="Frete/un" valor={brl(calc.custo_mp.frete)} />
          <Linha rotulo={`Imposto MP (${calc.custo_mp.imposto_mp_pct}%)`} valor="" />
          <div className="mt-1 border-t border-border pt-1">
            <Linha rotulo="Custo MP c/ imposto" valor={brl(calc.custo_mp.cmp_cimp)} destaque />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <h3 className="mb-2 font-medium text-ink">Mão de obra</h3>
          <Linha rotulo="Produção diária" valor={`${calc.mao_de_obra.producao_diaria} un`} />
          <Linha rotulo="Dias necessários" valor={String(calc.mao_de_obra.dias_necessarios)} />
          <Linha rotulo="MO/un" valor={brl(calc.mao_de_obra.mo_un)} />
          <Linha rotulo={`Imposto MO (${calc.mao_de_obra.imposto_mo_pct}%)`} valor="" />
          <div className="mt-1 border-t border-border pt-1">
            <Linha rotulo="Custo MO c/ imposto" valor={brl(calc.mao_de_obra.cmo_cimp)} destaque />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-sand/40 p-4">
        <p className="mb-2 text-caption uppercase tracking-wide text-warm-500">
          Parâmetros do sistema (somente leitura)
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <Linha rotulo="IPI" valor={`${calc.parametros.ipi_pct}%`} />
          <Linha rotulo="Frete/un" valor={brl(calc.parametros.frete_un_brl)} />
          <Linha rotulo="Imposto MP" valor={`${calc.parametros.imposto_mp_pct}%`} />
          <Linha rotulo="Imposto MO" valor={`${calc.parametros.imposto_mo_pct}%`} />
        </div>
      </div>
    </div>
  );
}
