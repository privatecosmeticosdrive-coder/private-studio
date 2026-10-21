import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ParametrosCusto } from './custo-engine';
import {
  scoreCotacao,
  faixaScore,
  scoreMaterialPonderado,
} from '../formulas/score.util';
import { lerParametrosCusto } from './params.util';
import { CalcularDto } from './dto/calcular.dto';
import { resolverNcmEfetivo } from './ncm-efetivo.util';
import { lerParametrosFiscaisVigentes } from './params-fiscais.util';
import { lerParametrosProducaoVigentes } from './params-producao.util';
import { calcularCustoFiscal, InputsFiscal } from './custo-engine-fiscal';
import {
  calcularCustoMotor2,
  MOTOR_2_ID,
  type InputsMotor2,
} from './custo-engine-motor2';
import {
  lerMotorPadrao,
  lerParametrosMotor2,
  type MotorPrecificacao,
} from './params-motor2.util';
import type {
  ModoOperacao,
  NcmFiscal,
  PerfilClienteFiscal,
} from './matriz-fiscal.util';
import { resolverTributosSaida } from './matriz-fiscal.util';

/** Tolerância da soma da composição (pontos percentuais) antes de normalizar. */
export const TOLERANCIA_SOMA_PCT = 0.5;

/** composição ≠ 100%: custo normalizado para 100% e o fato registrado (alerta). */
export interface ComposicaoNormalizada {
  soma_pct: number;
  fator: number;
  custo_mp_kg_bruto: number;
}

type FormulaComCusto = {
  id: number;
  nome_produto: string;
  versao_codigo: string | null;
  status: string;
  origem: string;
  custo_mp_kg_atual: number;
  score_global: number;
  mp_sem_preco: string[];
  composicao_normalizada: ComposicaoNormalizada | null;
  ingredientes: any[];
  composicao_snapshot: any[];
} | null;

type EmbalagemResolvida = {
  embalagem_un: number;
  preliminar: boolean; // true = embalagem escolhida porem sem cotacao (custo R$0)
  snapshot: any | null;
};

function alertaComposicao(n: ComposicaoNormalizada | null | undefined) {
  if (!n) return null;
  return {
    ...n,
    mensagem:
      `Composição da fórmula soma ${n.soma_pct}% (diferente de 100%). O custo de MP foi NORMALIZADO ` +
      `para 100% (fator ${n.fator}; bruto R$ ${n.custo_mp_kg_bruto.toFixed(4)}/kg). Revise a fórmula.`,
  };
}

@Injectable()
export class CalculoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cálculo DETERMINÍSTICO com tributos granulares de SAÍDA — dois motores:
   *
   *  - Motor 1 (fiscal granular 3.1, F4 Fase A): custo de material pela cotação
   *    (sem colchão); ICMS+PIS/COFINS por dentro, por parcela; IPI por fora.
   *  - Motor 2 10/26: MP líquida de créditos (última compra × (1+perda) ×
   *    (1−crédito)), embalagem com taxa de gestão própria (sem margem do
   *    produto), escada de margem por lote, lote mínimo, fábrica na vigência
   *    2026-10. Ver custo-engine-motor2.ts e docs/precificacao/MOTOR-2-10-26.md.
   *
   * Seleção: `dto.motor` > parametro_producao.motor_precificacao vigente > 1.
   * Snapshots antigos são congelados: a troca de motor só afeta cálculos novos.
   *
   * SEM DEFAULTS SILENCIOSOS (pente fino 10/26): volume_un e quantidade
   * ausentes falham com 400 (antes caíam em 100 mL / 1.000 un sem aviso).
   * Não chama IA; sem escrita aqui.
   */
  async gerarCalculo(orcamentoId: string, overrides: CalcularDto) {
    const orc = await this.prisma.orcamento.findUnique({
      where: { id: orcamentoId },
      include: { cliente: true },
    });
    if (!orc) throw new NotFoundException('Orcamento nao encontrado');

    const cfg = await this.getParametros();
    const formula = orc.formula_id
      ? await this.carregarFormula(orc.formula_id)
      : null;

    // ---------- entradas obrigatórias (falha visível, nunca default) ----------
    if (orc.volume_un == null || Number(orc.volume_un) <= 0) {
      throw new BadRequestException(
        'volume_un (mL/g por unidade) e obrigatorio e deve ser > 0. Informe o volume no briefing — o custo de MP depende dele.',
      );
    }
    if (orc.quantidade == null || orc.quantidade <= 0) {
      throw new BadRequestException(
        'quantidade do lote e obrigatoria e deve ser > 0. Informe a quantidade no briefing.',
      );
    }
    const volume_un = Number(orc.volume_un);
    const quantidade = orc.quantidade;

    // ---------- motor ----------
    const motor: MotorPrecificacao =
      overrides.motor ?? (await lerMotorPadrao(this.prisma));

    // Margem: override do cálculo > gravada no orçamento > (Motor 2) escada automática.
    const margemManual: number | null =
      overrides.margem_pct ??
      (orc.margem_pct != null ? Number(orc.margem_pct) : null);
    if (motor === 1 && margemManual == null) {
      throw new BadRequestException(
        'margem_pct e obrigatoria no Motor 1. Informe a margem no calculo ou grave no orcamento (o Motor 2 aplica a escada por lote automaticamente).',
      );
    }

    // Embalagem via catalogo (Doc 2d §B): snapshot do orcamento, catalogo, ou sem embalagem.
    const emb = await this.resolverEmbalagem(orc);

    // Custo de MP base por kg: formula > override manual > budget do briefing > 0.
    // Fragrancia agora e MP da composicao (decisao A) — sem input separado.
    const cmp_base_mp_kg =
      formula?.custo_mp_kg_atual ??
      overrides.cmp_base_mp_kg ??
      (orc.budget_mp != null ? Number(orc.budget_mp) : 0);

    // ---------- CONTEXTO FISCAL (F4 Fase A) ----------
    const formulaNcm = orc.formula_id
      ? await this.prisma.formula.findUnique({
          where: { id: orc.formula_id },
          select: { ncm_id: true },
        })
      : null;
    const ncmId = resolverNcmEfetivo(orc.ncm_id, formulaNcm?.ncm_id ?? null);
    const ncmRow = ncmId
      ? await this.prisma.ncm.findUnique({ where: { id: ncmId } })
      : null;
    if (!ncmRow) {
      throw new BadRequestException(
        'Orcamento sem NCM efetivo (nem override, nem NCM na formula). O calculo fiscal exige NCM para o IPI — atribua um NCM ao orcamento ou a formula.',
      );
    }

    const { params: pf, caracterizacao } = await lerParametrosFiscaisVigentes(
      this.prisma,
    );
    const modo = (orc.modo_operacao ?? 'full_service') as ModoOperacao;
    const perfil: PerfilClienteFiscal = {
      regime_fiscal: (orc.cliente?.regime_fiscal ??
        null) as PerfilClienteFiscal['regime_fiscal'],
      finalidade: (orc.cliente?.finalidade_padrao ??
        null) as PerfilClienteFiscal['finalidade'],
      uf: orc.cliente?.uf ?? null,
      contribuinte_icms: orc.cliente?.contribuinte_icms ?? null,
    };
    const ncmFiscal: NcmFiscal = {
      ncm: ncmRow.ncm,
      ex_tipi: ncmRow.ex_tipi,
      ipi_pct: Number(ncmRow.ipi_pct),
      monofasico: ncmRow.monofasico,
      tratamento: ncmRow.tratamento as NcmFiscal['tratamento'],
      icms_nominal_pct:
        ncmRow.icms_nominal_pct != null
          ? Number(ncmRow.icms_nominal_pct)
          : null,
    };
    const tributos = resolverTributosSaida(
      modo,
      perfil,
      ncmFiscal,
      pf,
      caracterizacao,
    );

    // CORTE F3: a fábrica vem de parametro_producao (versionado, com fonte).
    const producao = await lerParametrosProducaoVigentes(this.prisma);

    // ---- SCORE do orçamento: MATERIAL INTEIRO (MP + embalagem) ----
    // Média PONDERADA pela participação de cada parte no custo de material,
    // com a MESMA régua de idade (score.util). Sem data em lugar nenhum: 50.
    const scoreMp = formula ? formula.score_global : 55; // sem formula => baixa confianca
    const custoMpUn = cmp_base_mp_kg * (volume_un / 1000);
    const custoEmbUn = emb.embalagem_un;
    const dataEmb = await this.resolverDataCotacaoEmbalagem(emb.snapshot);
    const scoreEmb = emb.snapshot ? scoreCotacao(dataEmb) : null;
    const score_global = scoreMaterialPonderado(
      scoreMp,
      custoMpUn,
      scoreEmb,
      custoEmbUn,
    );

    // Blindagem: sem base de MP (R$0/kg) o preco vira so MO — sinaliza preliminar.
    const semBaseMp = cmp_base_mp_kg === 0;
    const preliminar = emb.preliminar || semBaseMp;
    const aviso = semBaseMp
      ? 'Calculo sem base de materia-prima (R$0/kg). Defina uma formula ou informe o budget de MP para um valor real.'
      : emb.preliminar
        ? 'Embalagem sem cotacao — custo usa R$0 e o orcamento e preliminar (Doc 2d §B4).'
        : undefined;

    const comum = {
      _gerado_em: new Date().toISOString(),
      _preliminar: preliminar || undefined,
      _aviso: aviso,
      modo_operacao: modo,
      ncm: {
        codigo: ncmRow.ncm,
        ex_tipi: ncmRow.ex_tipi,
        ipi_pct: ncmFiscal.ipi_pct,
        monofasico: ncmFiscal.monofasico,
        tratamento: ncmFiscal.tratamento,
      },
      perfil_fiscal: perfil,
      parametros_fiscais: pf,
      score_global,
      faixa: faixaScore(score_global),
      formula_usada: formula
        ? {
            id: formula.id,
            nome: formula.nome_produto,
            versao: formula.versao_codigo,
            status: formula.status,
            origem: formula.origem,
          }
        : null,
      embalagem: emb.snapshot,
      ingredientes: formula?.ingredientes ?? [],
    };

    const retorno = (
      calculo: Record<string, unknown>,
      preco_sipi: number,
      preco_cipi: number,
    ) => ({
      calculo,
      preco_sipi,
      preco_cipi,
      score_global,
      formula_versao_codigo: formula?.versao_codigo ?? null,
      formula_status_momento: formula?.status ?? null,
      formula_composicao_snapshot: formula?.composicao_snapshot ?? null,
    });

    // ====================== MOTOR 2 10/26 ======================
    if (motor === 2) {
      const lidos = await lerParametrosMotor2(this.prisma, producao, {
        perda_mp_pct: cfg.desvio_mp_pct,
        frete_un_brl: cfg.frete_un_brl,
      });

      // un_min: cálculo > orçamento > padrão vigente (COM alerta) > 400.
      let un_min =
        overrides.un_min ??
        (orc.un_min != null ? Number(orc.un_min) : undefined);
      let alertaUnMinPadrao: { un_min: number; mensagem: string } | null = null;
      if (un_min == null) {
        if (lidos.un_min_padrao == null) {
          throw new BadRequestException(
            'un_min (produtividade em unidades/minuto) e obrigatorio. Informe no calculo ou grave no orcamento.',
          );
        }
        un_min = lidos.un_min_padrao;
        alertaUnMinPadrao = {
          un_min,
          mensagem: `Produtividade não informada: aplicada a velocidade PADRÃO de ${un_min} un/min (parametro_producao.un_min_padrao). Confirme com a produção antes de enviar.`,
        };
      }

      const inputs: InputsMotor2 = {
        cmp_base_mp_kg,
        volume_un,
        quantidade,
        un_min,
        margem_pct: margemManual,
        embalagem_un: emb.embalagem_un,
        mp_sem_preco: formula?.mp_sem_preco ?? [],
      };
      const calc = calcularCustoMotor2(inputs, lidos.params, tributos);

      const calculo = {
        _mode: 'motor2',
        // 4.0 = Motor 2 10/26. Carimbo DOCUMENTAL: renderer e PDF discriminam
        // por PRESENÇA do campo `motor`, nunca por esta string.
        _modelo_versao: '4.0',
        motor: MOTOR_2_ID,
        vigencias_parametros: lidos.vigencias,
        inputs,
        parametros_operacionais: {
          producao: lidos.params.producao,
          perda_mp_pct: lidos.params.perda_mp_pct,
          frete_un_brl: lidos.params.frete_un_brl,
          credito_mp_pct: lidos.params.credito_mp_pct,
          credito_emb_pct: lidos.params.credito_emb_pct,
          taxa_gestao_embalagem_pct: lidos.params.taxa_gestao_embalagem_pct,
          escada: lidos.params.escada,
          lote_minimo_un: lidos.params.lote_minimo_un,
        },
        ...comum,
        material: calc.material,
        mao_de_obra: calc.mao_de_obra,
        margem: calc.margem,
        embalagem_precificacao: calc.embalagem,
        alertas: {
          ...calc.alertas,
          un_min_padrao: alertaUnMinPadrao,
          composicao_normalizada: alertaComposicao(
            formula?.composicao_normalizada,
          ),
        },
        parcelas: calc.parcelas,
        resultado: calc.resultado,
        premissas: calc.premissas,
        fundamentos: calc.fundamentos,
      };
      return retorno(
        calculo,
        calc.resultado.preco_sipi,
        calc.resultado.preco_cipi,
      );
    }

    // ====================== MOTOR 1 (fiscal granular 3.1) ======================
    const un_min =
      overrides.un_min ?? (orc.un_min != null ? Number(orc.un_min) : undefined);
    if (un_min == null) {
      throw new BadRequestException(
        'un_min (produtividade em unidades/minuto) e obrigatorio. Informe no calculo ou grave no orcamento.',
      );
    }
    const inputs: InputsFiscal = {
      cmp_base_mp_kg,
      volume_un,
      quantidade,
      un_min,
      margem_pct: margemManual!,
      embalagem_un: emb.embalagem_un,
      mp_sem_preco: formula?.mp_sem_preco ?? [],
    };
    const oper = {
      producao,
      desvio_mp_pct: cfg.desvio_mp_pct,
      frete_un_brl: cfg.frete_un_brl,
    };
    const calc = calcularCustoFiscal(inputs, oper, tributos);

    const calculo = {
      _mode: 'fiscal_granular',
      // 3.1 = corte do modelo de MO (setup por ordem + corrida sobre capacidade
      // normal). Carimbo DOCUMENTAL (ver nota do Motor 2 acima).
      _modelo_versao: '3.1',
      motor: 'Motor 1',
      inputs,
      parametros_operacionais: oper,
      ...comum,
      material: calc.material,
      mao_de_obra: calc.mao_de_obra,
      alertas: {
        ...calc.alertas,
        composicao_normalizada: alertaComposicao(
          formula?.composicao_normalizada,
        ),
      },
      parcelas: calc.parcelas,
      resultado: calc.resultado,
      fundamentos: calc.fundamentos,
    };
    return retorno(
      calculo,
      calc.resultado.preco_sipi,
      calc.resultado.preco_cipi,
    );
  }

  // ---------------- parametros de custo (system_config) ----------------
  private async getParametros(): Promise<ParametrosCusto> {
    const c = await this.prisma.systemConfig.findUnique({ where: { id: 1 } });
    return lerParametrosCusto(c);
  }

  // ---------------- embalagem do catalogo (Doc 2d §B4) ----------------
  private async resolverEmbalagem(orc: any): Promise<EmbalagemResolvida> {
    if (orc.sem_embalagem)
      return { embalagem_un: 0, preliminar: false, snapshot: null };

    // Snapshot ja gravado tem prioridade (preco travado no momento do orcamento).
    let snap = orc.embalagem_snapshot as any | null;
    if (!snap && orc.embalagem_id) {
      const e = await this.prisma.embalagem.findUnique({
        where: { id: orc.embalagem_id },
      });
      if (e) {
        snap = {
          id: e.id,
          nome: e.nome,
          tipo: e.tipo,
          preco_un_brl: e.preco_un_brl != null ? Number(e.preco_un_brl) : null,
          fornecedor: e.fornecedor,
          preco_estimado: e.preco_estimado,
          // usada no score do orçamento (mesma régua de idade das MPs)
          data_cotacao: e.data_cotacao,
        };
      }
    }
    if (!snap) return { embalagem_un: 0, preliminar: false, snapshot: null };

    const preco = snap.preco_un_brl != null ? Number(snap.preco_un_brl) : null;
    // Sem cotacao -> usa R$0 e marca o orcamento como preliminar.
    return {
      embalagem_un: preco ?? 0,
      preliminar: preco == null,
      snapshot: snap,
    };
  }

  /**
   * FALLBACK DE LEITURA da data de cotação da embalagem (score).
   *
   * O snapshot preserva o PREÇO — esse é o valor econômico que a tese 2
   * congela. A data de cotação é metadado de CONFIANÇA, não valor: snapshots
   * anteriores à fatia do score simplesmente não têm o campo, e sem este
   * fallback todo orçamento antigo exibiria confiança falsamente baixa
   * (o #76 marcava 51 com a embalagem em dia no catálogo).
   *
   * Derivação na leitura, mesma disciplina do atraso da Fase 4 e do MOQ:
   * NUNCA reescreve o snapshot, NUNCA toca o preço (que segue vindo do snapshot).
   * Embalagem removida do catálogo -> null -> pontua 50, comportamento atual.
   */
  private async resolverDataCotacaoEmbalagem(
    snapshot: any | null,
  ): Promise<Date | null> {
    if (!snapshot) return null;
    if (snapshot.data_cotacao) return new Date(snapshot.data_cotacao);
    if (snapshot.id == null) return null;
    const cat = await this.prisma.embalagem.findUnique({
      where: { id: Number(snapshot.id) },
      select: { data_cotacao: true },
    });
    return cat?.data_cotacao ?? null;
  }

  // ---------------- carrega formula + custo atual + score ----------------
  private async carregarFormula(formulaId: number): Promise<FormulaComCusto> {
    const f = await this.prisma.formula.findUnique({
      where: { id: formulaId },
      include: {
        composicao: {
          orderBy: { ordem: 'asc' },
          include: {
            mp: {
              select: {
                codigo: true,
                nome: true,
                preco_kg_brl: true,
                data_cotacao: true,
              },
            },
          },
        },
      },
    });
    if (!f) return null;

    let custoAtual = 0;
    const ingredientes = f.composicao.map((c) => {
      const conc = c.concentracao_pct != null ? Number(c.concentracao_pct) : 0;
      const preco =
        c.mp?.preco_kg_brl != null ? Number(c.mp.preco_kg_brl) : null;
      const custo = preco != null ? (conc / 100) * preco : null;
      if (custo != null) custoAtual += custo;
      return {
        nome: c.mp?.nome ?? c.mp_nome_original,
        mp_codigo: c.mp?.codigo ?? null,
        concentracao_pct: conc,
        preco_kg_atual: preco,
        custo_na_formula: custo != null ? Number(custo.toFixed(4)) : null,
        score: c.mp ? scoreCotacao(c.mp.data_cotacao) : 50,
        fase: c.fase,
      };
    });

    const somaPeso = ingredientes.reduce(
      (a, i) => a + (i.custo_na_formula ?? 0),
      0,
    );
    const score =
      somaPeso > 0
        ? Math.round(
            ingredientes.reduce(
              (a, i) => a + (i.custo_na_formula ?? 0) * i.score,
              0,
            ) / somaPeso,
          )
        : ingredientes.length
          ? Math.round(
              ingredientes.reduce((a, i) => a + i.score, 0) /
                ingredientes.length,
            )
          : 50;

    // Regra 6 — MP sem preço entra valendo R$0: o custo sai SUBESTIMADO e isso
    // precisa ser visível (não basta o score baixo). Nomes vão para o alerta.
    const mp_sem_preco = ingredientes
      .filter((i) => i.preco_kg_atual == null)
      .map((i) => i.nome ?? '(sem nome)');

    // Pente fino 10/26 — composição ≠ 100%: o custo por kg de fórmula só faz
    // sentido sobre 100%. NORMALIZA (custo × 100/soma) e REGISTRA o fato como
    // alerta — nunca silenciosamente. Dentro da tolerância: custo inalterado.
    const { custo_mp_kg, composicao_normalizada } = normalizarCustoComposicao(
      custoAtual,
      ingredientes.map((i) => i.concentracao_pct),
    );

    return {
      id: f.id,
      nome_produto: f.nome_produto,
      versao_codigo: f.versao_codigo,
      status: f.status,
      origem: f.origem,
      custo_mp_kg_atual: Number(custo_mp_kg.toFixed(4)),
      score_global: score,
      mp_sem_preco,
      composicao_normalizada,
      ingredientes,
      composicao_snapshot: ingredientes,
    };
  }
}

/**
 * Normaliza o custo/kg de uma composição cuja soma ≠ 100% (fora da tolerância).
 * Pura e exportada para teste. soma <= 0 ou dentro da tolerância: inalterado.
 */
export function normalizarCustoComposicao(
  custo_bruto: number,
  concentracoes: number[],
): {
  custo_mp_kg: number;
  composicao_normalizada: ComposicaoNormalizada | null;
} {
  const soma_pct = Number(
    concentracoes
      .reduce((a, c) => a + (Number.isFinite(c) ? c : 0), 0)
      .toFixed(3),
  );
  if (soma_pct <= 0 || Math.abs(soma_pct - 100) <= TOLERANCIA_SOMA_PCT) {
    return { custo_mp_kg: custo_bruto, composicao_normalizada: null };
  }
  const fator = Number((100 / soma_pct).toFixed(6));
  return {
    custo_mp_kg: custo_bruto * (100 / soma_pct),
    composicao_normalizada: {
      soma_pct,
      fator,
      custo_mp_kg_bruto: Number(custo_bruto.toFixed(4)),
    },
  };
}
