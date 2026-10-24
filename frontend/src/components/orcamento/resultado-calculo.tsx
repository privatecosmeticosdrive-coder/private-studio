import * as React from 'react';
import { AlertTriangle, History } from 'lucide-react';
import { ScoreThermometer } from '@/components/data/score-thermometer';
import { brl, cn, pctBR } from '@/lib/utils';
import type { CalculoJson, CalculoJsonLegacy, CalculoJsonMotor2, CalculoQualquer } from '@/lib/types';
import { isCalculoMotor2, isCalculoV3 } from '@/lib/types';

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
        <Linha rotulo={`IPI (${pctBR(calc.resultado.ipi_pct)})`} valor={brl(calc.resultado.ipi_un)} />
      </div>
    </div>
  );
}

/** Cliente fora de SP: o preço não tem alíquota interestadual nem DIFAL. Não bloqueia, mas fica acima do preço. */
function AlertaUfForaSp({ alerta }: { alerta?: { uf: string; mensagem: string } | null }) {
  if (!alerta) return null;
  return (
    <div className="rounded-lg border border-warning bg-warning-soft p-4">
      <p className="font-medium text-ink">Cliente em {alerta.uf} — preço calculado como venda dentro de SP</p>
      <p className="mt-1 text-sm text-warm-700">
        Alíquota interestadual e DIFAL não estão neste preço. Passe pelo financeiro antes de enviar ao cliente.
      </p>
    </div>
  );
}

/** Cartão de parcela do Motor 2: custo → tributos + markup (margem ou taxa de gestão) → preço. */
function CardParcelaM2({
  titulo,
  markupRotulo,
  parcela,
}: {
  titulo: string;
  markupRotulo: string;
  parcela: { custo_un: number; taxa_pct: number; markup_pct: number; preco_un: number };
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="mb-2 font-medium text-ink">{titulo}</h3>
      <Linha rotulo="Custo/un" valor={brl(parcela.custo_un)} />
      <Linha rotulo="Tributos por dentro" valor={`${parcela.taxa_pct}%`} />
      <Linha rotulo={markupRotulo} valor={`${parcela.markup_pct}%`} />
      <div className="mt-1 border-t border-border pt-1">
        <Linha rotulo="Preço/un (s/ IPI)" valor={brl(parcela.preco_un)} destaque />
      </div>
    </div>
  );
}

/**
 * Resultado do MOTOR 2 10/26 (shape 4.0): material líquido de créditos, embalagem
 * com taxa de gestão própria, escada de margem, lote mínimo (bloqueante) e as
 * vigências dos parâmetros usados. Snapshot congelado — somente leitura.
 */
function ResultadoMotor2({ calc }: { calc: CalculoJsonMotor2 }) {
  const ncmLabel = `${calc.ncm.codigo}${calc.ncm.ex_tipi ? ' ' + calc.ncm.ex_tipi : ''}`;
  const a = calc.alertas;
  const m = calc.margem;
  const mat = calc.material;
  const mo = calc.mao_de_obra;
  return (
    <div className="space-y-5">
      {/* Carimbo do motor + margem aplicada */}
      <div className="flex flex-wrap items-center gap-2 text-caption">
        <span className="rounded-md border border-gold-500 bg-gold-500/10 px-2 py-0.5 font-medium text-gold-700">
          {calc.motor}
        </span>
        <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-warm-700">
          Margem <strong className="tnum text-ink">{m.aplicada_pct}%</strong>{' '}
          {m.origem === 'escada'
            ? `pela escada de lote (${m.faixa_descricao})`
            : `MANUAL — a escada daria ${m.escada_pct}% (${m.faixa_descricao})`}
        </span>
        <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-warm-700">
          {calc.embalagem_precificacao.precificada
            ? `Embalagem com taxa de gestão ${calc.embalagem_precificacao.taxa_gestao_pct}% (sem margem do produto)`
            : 'Sem embalagem precificada'}
        </span>
      </div>

      {calc._preliminar && (
        <p className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-caption text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          {calc._aviso ?? 'Orçamento preliminar.'}
        </p>
      )}

      {/* BLOQUEANTE: lote abaixo do mínimo — acima do preço, impossível de ignorar */}
      {a.lote_minimo && (
        <div className="rounded-lg border-2 border-error bg-error-soft p-4">
          <p className="font-semibold text-error">
            BLOQUEANTE — lote de {a.lote_minimo.quantidade.toLocaleString('pt-BR')} un abaixo do mínimo
            aceito ({a.lote_minimo.lote_minimo_un.toLocaleString('pt-BR')} un)
          </p>
          <p className="mt-1 text-sm text-warm-700">{a.lote_minimo.mensagem}</p>
        </div>
      )}
      <AlertaUfForaSp alerta={a.uf_fora_sp} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
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
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="text-caption uppercase tracking-wide text-warm-500">Sem embalagem (s/ IPI)</p>
          <p className="mt-1 font-display text-h2 text-ink tnum">{brl(calc.resultado.preco_produto_sipi)}</p>
          <p className="mt-1 text-caption text-warm-500">
            embalagem {brl(calc.resultado.preco_embalagem_sipi)}
          </p>
        </div>
        <div className="flex items-center justify-center rounded-lg border border-border bg-surface p-3">
          <ScoreThermometer score={calc.score_global} size={120} />
        </div>
      </div>

      {/* Alertas não bloqueantes */}
      {a.mp_sem_preco && (
        <div className="rounded-lg border border-error bg-error-soft p-4">
          <p className="font-medium text-error">
            Custo de material SUBESTIMADO — {a.mp_sem_preco.quantidade} matéria-prima
            {a.mp_sem_preco.quantidade > 1 ? 's' : ''} sem preço
          </p>
          <p className="mt-1 text-sm text-warm-700">
            {a.mp_sem_preco.nomes.join(', ')} — entrou no cálculo valendo{' '}
            <strong className="text-ink">R$ 0,00</strong>. Cote antes de enviar ao cliente.
          </p>
        </div>
      )}
      {a.moq && (
        <div className="rounded-lg border border-warning bg-warning-soft p-4">
          <p className="font-medium text-ink">
            Abaixo do MOQ econômico — o setup pesa <span className="tnum">{a.moq.peso_setup_pct}%</span> deste lote
          </p>
          <p className="mt-1 text-sm text-warm-700">
            Custo do lote <span className="tnum">{brl(a.moq.custo_lote)}</span>. A partir de{' '}
            <strong className="text-ink tnum">{a.moq.quantidade_minima.toLocaleString('pt-BR')} un</strong> (lote de{' '}
            {brl(a.moq.lote_minimo_valor)}) o setup cai para 10% ou menos.
          </p>
        </div>
      )}
      {[a.embalagem_ignorada?.mensagem, a.un_min_padrao?.mensagem, a.composicao_normalizada?.mensagem]
        .filter((msg): msg is string => typeof msg === 'string' && msg.length > 0)
        .map((msg, i) => (
          <p key={i} className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-caption text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {msg}
          </p>
        ))}

      {/* Enquadramento fiscal */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-2 font-medium text-ink">Enquadramento fiscal</h3>
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <Linha rotulo="Modo de operação" valor={MODO_LABEL[calc.modo_operacao]} />
          <Linha rotulo="NCM" valor={ncmLabel} />
          <Linha rotulo="IPI" valor={`${pctBR(calc.resultado.ipi_pct)} (${brl(calc.resultado.ipi_un)}/un)`} />
          <Linha rotulo="Base do IPI" valor={BASE_IPI_LABEL[calc.resultado.base_ipi]} />
          <Linha rotulo="Produto monofásico" valor={calc.ncm.monofasico ? 'Sim' : 'Não'} />
          {calc.resultado.icms_sobre_ipi > 0 && (
            <Linha rotulo="ICMS sobre o IPI" valor={brl(calc.resultado.icms_sobre_ipi)} />
          )}
        </div>
      </div>

      {/* Parcelas precificadas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {calc.parcelas.produto && (
          <CardParcelaM2
            titulo={calc.modo_operacao === 'hibrido' ? 'Material próprio' : 'Produto (MP + frete + fábrica)'}
            markupRotulo="Margem"
            parcela={calc.parcelas.produto}
          />
        )}
        {calc.parcelas.embalagem && (
          <CardParcelaM2 titulo="Embalagem (repasse)" markupRotulo="Taxa de gestão" parcela={calc.parcelas.embalagem} />
        )}
        {calc.parcelas.mo && (
          <CardParcelaM2 titulo="Mão de obra / execução" markupRotulo="Margem" parcela={calc.parcelas.mo} />
        )}
      </div>

      {/* Detalhe de custo: material líquido de créditos + fábrica */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h3 className="mb-2 font-medium text-ink">Material (líquido de créditos de entrada)</h3>
          <Linha rotulo="MP última compra/un (bruta)" valor={brl(mat.mp_bruta)} />
          <Linha rotulo={`Perda (${mat.perda_pct}%)`} valor={brl(mat.perda)} />
          <Linha rotulo={`(−) Crédito MP (${mat.credito_mp_pct}%)`} valor={`− ${brl(mat.credito_mp)}`} />
          <Linha rotulo="MP líquida/un" valor={brl(mat.mp_liquida)} destaque />
          <Linha rotulo="Frete/un" valor={brl(mat.frete)} />
          {mat.embalagem_bruta > 0 ? (
            <>
              <Linha rotulo="Embalagem/un (bruta)" valor={brl(mat.embalagem_bruta)} />
              <Linha
                rotulo={`(−) Crédito embalagem (${mat.credito_emb_pct}%)`}
                valor={`− ${brl(mat.credito_emb)}`}
              />
              <Linha rotulo="Embalagem líquida/un" valor={brl(mat.embalagem_liquida)} destaque />
            </>
          ) : (
            <Linha rotulo="Embalagem/un" valor={mat.embalagem_informada > 0 ? 'fornecida pelo cliente' : '—'} />
          )}
          <div className="mt-1 border-t border-border pt-1">
            <Linha rotulo="Custo de material/un" valor={brl(mat.custo_material_un)} destaque />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <h3 className="mb-2 font-medium text-ink">Fábrica (setup diluído + corrida)</h3>
          <Linha rotulo="Taxa por minuto produtivo" valor={brl(mo.taxa_minuto!)} />
          <Linha rotulo="Setup por ordem" valor={brl(mo.custo_setup_ordem!)} />
          <Linha rotulo="Setup/un (ordem diluída no lote)" valor={brl(mo.setup_un!)} />
          <Linha rotulo="Corrida/un (tempo real)" valor={brl(mo.corrida_un!)} />
          <Linha rotulo="Produção diária/linha" valor={`${mo.producao_diaria} un`} />
          <div className="mt-1 border-t border-border pt-1">
            <Linha rotulo="Fábrica/un" valor={brl(mo.mo_un)} destaque />
          </div>
        </div>
      </div>

      {/* Fundamentos + premissas + vigências (auditoria) */}
      <div className="rounded-lg border border-dashed border-border bg-sand/40 p-4">
        <p className="mb-2 text-caption uppercase tracking-wide text-warm-500">Fundamentos fiscais aplicados</p>
        <ul className="space-y-1">
          {calc.fundamentos.map((f, i) => (
            <li key={i} className="text-caption text-warm-700">
              • {f}
            </li>
          ))}
        </ul>
        {calc.premissas?.length > 0 && (
          <>
            <p className="mb-1 mt-3 text-caption uppercase tracking-wide text-warm-500">Premissas</p>
            <ul className="space-y-1">
              {calc.premissas.map((f, i) => (
                <li key={i} className="text-caption text-warm-700">
                  • {f}
                </li>
              ))}
            </ul>
          </>
        )}
        {calc.vigencias_parametros?.length > 0 && (
          <>
            <p className="mb-1 mt-3 text-caption uppercase tracking-wide text-warm-500">
              Vigências dos parâmetros usados
            </p>
            <p className="text-caption text-warm-600">
              {calc.vigencias_parametros
                .map((v) => `${v.chave} = ${v.valor} (${new Date(v.vigencia_inicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' })})`)
                .join(' · ')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Resultado do cálculo — tolera a forma legada (v1), a fiscal granular (v3) e o Motor 2 (4.0). */
export function ResultadoCalculo({ calc }: { calc: CalculoQualquer }) {
  if (isCalculoMotor2(calc)) return <ResultadoMotor2 calc={calc} />;
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

      {/* ALERTAS (red team) — impossíveis de ignorar: ficam ACIMA dos blocos
          de detalhe, não escondidos no score. Não bloqueiam o orçamento. */}
      <AlertaUfForaSp alerta={calc.alertas?.uf_fora_sp} />
      {calc.alertas?.mp_sem_preco && (
        <div className="rounded-lg border border-error bg-error-soft p-4">
          <p className="font-medium text-error">
            Custo de material SUBESTIMADO — {calc.alertas.mp_sem_preco.quantidade} matéria-prima
            {calc.alertas.mp_sem_preco.quantidade > 1 ? 's' : ''} sem preço
          </p>
          <p className="mt-1 text-sm text-warm-700">
            {calc.alertas.mp_sem_preco.nomes.join(', ')} — entrou no cálculo valendo{' '}
            <strong className="text-ink">R$ 0,00</strong>. O preço abaixo está mais baixo que o
            real. Cote antes de enviar ao cliente.
          </p>
        </div>
      )}
      {calc.alertas?.moq && (
        <div className="rounded-lg border border-warning bg-warning-soft p-4">
          <p className="font-medium text-ink">
            Abaixo do MOQ econômico — o setup pesa{' '}
            <span className="tnum">{calc.alertas.moq.peso_setup_pct}%</span> deste lote
          </p>
          <p className="mt-1 text-sm text-warm-700">
            Custo do lote <span className="tnum">{brl(calc.alertas.moq.custo_lote)}</span>. A troca
            de SKU custa o mesmo em qualquer tamanho de lote, então em lote pequeno ela encarece
            cada unidade. A partir de{' '}
            <strong className="text-ink tnum">
              {calc.alertas.moq.quantidade_minima.toLocaleString('pt-BR')} un
            </strong>{' '}
            (lote de {brl(calc.alertas.moq.lote_minimo_valor)}) o setup cai para 10% ou menos.
          </p>
        </div>
      )}

      {/* Enquadramento fiscal */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-2 font-medium text-ink">Enquadramento fiscal</h3>
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <Linha rotulo="Modo de operação" valor={MODO_LABEL[calc.modo_operacao]} />
          <Linha rotulo="NCM" valor={ncmLabel} />
          <Linha
            rotulo="IPI"
            valor={`${pctBR(calc.resultado.ipi_pct)} (${brl(calc.resultado.ipi_un)}/un)`}
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
          <h3 className="mb-2 font-medium text-ink">Produção (mão de obra)</h3>
          {/* Forma 3.1 (corte F3): setup por ordem + corrida real. Snapshot
              antigo (3.0) não tem esses campos e cai no ramo histórico —
              nunca exibir campo ausente como se existisse (regra 7). */}
          {calc.mao_de_obra.setup_un != null ? (
            <>
              <Linha
                rotulo="Setup/un (ordem diluída no lote)"
                valor={brl(calc.mao_de_obra.setup_un)}
              />
              <Linha rotulo="Corrida/un (tempo real)" valor={brl(calc.mao_de_obra.corrida_un!)} />
              <Linha
                rotulo="Taxa por minuto produtivo"
                valor={brl(calc.mao_de_obra.taxa_minuto!)}
              />
              <Linha rotulo="Produção diária/linha" valor={`${calc.mao_de_obra.producao_diaria} un`} />
            </>
          ) : (
            <>
              <Linha rotulo="Produção diária" valor={`${calc.mao_de_obra.producao_diaria} un`} />
              {calc.mao_de_obra.dias_necessarios != null && (
                <Linha
                  rotulo="Dias necessários (modelo anterior)"
                  valor={String(calc.mao_de_obra.dias_necessarios)}
                />
              )}
            </>
          )}
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
