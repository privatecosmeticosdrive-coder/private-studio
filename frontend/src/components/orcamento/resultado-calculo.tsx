import * as React from 'react';
import { AlertTriangle, History } from 'lucide-react';
import { ScoreThermometer } from '@/components/data/score-thermometer';
import { brl, cn } from '@/lib/utils';
import type { CalculoJson, CalculoJsonLegacy } from '@/lib/types';
import { isCalculoV3 } from '@/lib/types';

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

const MODO_LABEL: Record<CalculoJson['modo_operacao'], string> = {
  full_service: 'Full service (venda do produto)',
  hibrido: 'Híbrido (material próprio + industrialização)',
  industrializacao: 'Industrialização (só mão de obra)',
};

const BASE_IPI_LABEL: Record<CalculoJson['resultado']['base_ipi'], string> = {
  total: 'valor total da operação',
  material: 'apenas material próprio',
  nao_aplica: 'não aplicável',
};

/** Cartão de uma parcela precificada (material ou MO). */
function CardParcela({
  titulo,
  parcela,
}: {
  titulo: string;
  parcela: { custo_un: number; taxa_pct: number; preco_un: number };
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="mb-2 font-medium text-ink">{titulo}</h3>
      <Linha rotulo="Custo/un" valor={brl(parcela.custo_un)} />
      <Linha rotulo="Tributos por dentro" valor={`${parcela.taxa_pct}%`} />
      <div className="mt-1 border-t border-border pt-1">
        <Linha rotulo="Preço/un (s/ IPI)" valor={brl(parcela.preco_un)} destaque />
      </div>
    </div>
  );
}

/**
 * Resultado LEGADO (engine pré-corte, v2.0). Orçamentos antigos guardam esta
 * forma e NUNCA são reescritos (fronteira fiscal×preço) — exibidos como
 * histórico, com aviso claro. Somente leitura.
 */
function ResultadoLegado({ calc }: { calc: CalculoJsonLegacy }) {
  return (
    <div className="space-y-5">
      <p className="flex items-center gap-2 rounded-md border border-border bg-sand/40 px-3 py-2 text-caption text-warm-700">
        <History className="size-4 shrink-0 text-warm-500" />
        Calculado no modelo anterior (v{calc._modelo_versao}). Valores históricos preservados — não
        recalculados. Para o modelo fiscal atual, gere um novo cálculo.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-caption uppercase tracking-wide text-warm-500">Preço sem IPI</p>
          <p className="mt-1 font-display text-h2 text-ink tnum">{brl(calc.resultado.preco_sipi)}</p>
        </div>
        <div className="rounded-lg border border-gold-500 bg-gold-500/5 p-5">
          <p className="text-caption uppercase tracking-wide text-warm-500">Preço com IPI</p>
          <p className="mt-1 font-display text-h2 text-ink tnum">{brl(calc.resultado.preco_cipi)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h3 className="mb-2 font-medium text-ink">Custo de matéria-prima (modelo anterior)</h3>
          <Linha rotulo="MP base/un" valor={brl(calc.custo_mp.mp_base)} />
          <Linha rotulo={`Desvio (${calc.custo_mp.desvio_pct}%)`} valor={brl(calc.custo_mp.desvio)} />
          <Linha rotulo="Embalagem/un" valor={brl(calc.custo_mp.embalagem)} />
          <Linha rotulo="Frete/un" valor={brl(calc.custo_mp.frete)} />
          <div className="mt-1 border-t border-border pt-1">
            <Linha
              rotulo={`Custo MP c/ imposto (${calc.custo_mp.imposto_mp_pct}%)`}
              valor={brl(calc.custo_mp.cmp_cimp)}
              destaque
            />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <h3 className="mb-2 font-medium text-ink">Mão de obra (modelo anterior)</h3>
          <Linha rotulo="Produção diária" valor={`${calc.mao_de_obra.producao_diaria} un`} />
          <Linha rotulo="Dias necessários" valor={String(calc.mao_de_obra.dias_necessarios)} />
          <Linha rotulo="MO/un" valor={brl(calc.mao_de_obra.mo_un)} />
          <div className="mt-1 border-t border-border pt-1">
            <Linha
              rotulo={`Custo MO c/ imposto (${calc.mao_de_obra.imposto_mo_pct}%)`}
              valor={brl(calc.mao_de_obra.cmo_cimp)}
              destaque
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-sand/40 p-4">
        <Linha rotulo={`IPI (${calc.resultado.ipi_pct}%)`} valor={brl(calc.resultado.ipi_un)} />
      </div>
    </div>
  );
}

/** Resultado do cálculo — tolera a forma legada (v1) e a fiscal granular (v3). */
export function ResultadoCalculo({ calc }: { calc: CalculoJson | CalculoJsonLegacy }) {
  if (!isCalculoV3(calc)) return <ResultadoLegado calc={calc} />;
  const ncmLabel = `${calc.ncm.codigo}${calc.ncm.ex_tipi ? ' ' + calc.ncm.ex_tipi : ''}`;
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

      {/* Enquadramento fiscal */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-2 font-medium text-ink">Enquadramento fiscal</h3>
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <Linha rotulo="Modo de operação" valor={MODO_LABEL[calc.modo_operacao]} />
          <Linha rotulo="NCM" valor={ncmLabel} />
          <Linha
            rotulo="IPI"
            valor={`${calc.resultado.ipi_pct}% (${brl(calc.resultado.ipi_un)}/un)`}
          />
          <Linha rotulo="Base do IPI" valor={BASE_IPI_LABEL[calc.resultado.base_ipi]} />
          <Linha rotulo="Produto monofásico" valor={calc.ncm.monofasico ? 'Sim' : 'Não'} />
          {calc.resultado.icms_sobre_ipi > 0 && (
            <Linha rotulo="ICMS sobre o IPI" valor={brl(calc.resultado.icms_sobre_ipi)} />
          )}
        </div>
      </div>

      {/* Parcelas precificadas (material / MO conforme o modo) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {calc.parcelas.material && <CardParcela titulo="Material" parcela={calc.parcelas.material} />}
        {calc.parcelas.mo && <CardParcela titulo="Mão de obra / execução" parcela={calc.parcelas.mo} />}
      </div>

      {/* Detalhe de custo (material + MO físicos) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h3 className="mb-2 font-medium text-ink">Custo de material</h3>
          <Linha rotulo="MP base/un" valor={brl(calc.material.mp_base)} />
          <Linha rotulo="Desvio/un" valor={brl(calc.material.desvio)} />
          <Linha rotulo="Embalagem/un" valor={brl(calc.material.embalagem)} />
          <Linha rotulo="Frete/un" valor={brl(calc.material.frete)} />
          <div className="mt-1 border-t border-border pt-1">
            <Linha rotulo="Custo de material/un" valor={brl(calc.material.custo_material_un)} destaque />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <h3 className="mb-2 font-medium text-ink">Mão de obra</h3>
          <Linha rotulo="Produção diária" valor={`${calc.mao_de_obra.producao_diaria} un`} />
          <Linha rotulo="Dias necessários" valor={String(calc.mao_de_obra.dias_necessarios)} />
          <div className="mt-1 border-t border-border pt-1">
            <Linha rotulo="MO/un" valor={brl(calc.mao_de_obra.mo_un)} destaque />
          </div>
        </div>
      </div>

      {/* Fundamentos (auditoria — por que cada tributo) */}
      {calc.fundamentos?.length > 0 && (
        <div className="rounded-lg border border-dashed border-border bg-sand/40 p-4">
          <p className="mb-2 text-caption uppercase tracking-wide text-warm-500">
            Fundamentos fiscais aplicados
          </p>
          <ul className="space-y-1">
            {calc.fundamentos.map((f, i) => (
              <li key={i} className="text-caption text-warm-700">
                • {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
