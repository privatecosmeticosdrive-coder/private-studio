import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ParametrosCusto } from './custo-engine';
import { scoreCotacao, faixaScore } from '../formulas/score.util';
import { lerParametrosCusto } from './params.util';
import { CalcularDto } from './dto/calcular.dto';
import { resolverNcmEfetivo } from './ncm-efetivo.util';
import { lerParametrosFiscaisVigentes } from './params-fiscais.util';
import { calcularCustoFiscal, InputsFiscal } from './custo-engine-fiscal';
import type { ModoOperacao, NcmFiscal, PerfilClienteFiscal } from './matriz-fiscal.util';
import { resolverTributosSaida } from './matriz-fiscal.util';

type FormulaComCusto = {
  id: number;
  nome_produto: string;
  versao_codigo: string | null;
  status: string;
  origem: string;
  custo_mp_kg_atual: number;
  score_global: number;
  ingredientes: any[];
  composicao_snapshot: any[];
} | null;

type EmbalagemResolvida = {
  embalagem_un: number;
  preliminar: boolean; // true = embalagem escolhida porem sem cotacao (custo R$0)
  snapshot: any | null;
};

@Injectable()
export class CalculoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * F4 FASE A (corte) — cálculo DETERMINÍSTICO com tributos granulares de SAÍDA.
   * Substituiu o engine dos 3 flats (37,5% MP / 9,25% MO / IPI 4,55% globais).
   * Agora: custo de material pela cotação (sem colchão); ICMS+PIS/COFINS por
   * dentro do preço, por parcela, conforme (modo_operacao × perfil do cliente ×
   * NCM/EX/tratamento × parâmetros fiscais VIGENTES). IPI por fora, na base do
   * modo. NCM efetivo é OBRIGATÓRIO (regra 6: sem NCM não há IPI conhecido —
   * falha visível, nunca imposto 0 silencioso). Não chama IA; sem escrita aqui.
   */
  async gerarCalculo(orcamentoId: string, overrides: CalcularDto) {
    const orc = await this.prisma.orcamento.findUnique({
      where: { id: orcamentoId },
      include: { cliente: true },
    });
    if (!orc) throw new NotFoundException('Orcamento nao encontrado');

    const cfg = await this.getParametros();
    const formula = orc.formula_id ? await this.carregarFormula(orc.formula_id) : null;

    const volume_un = orc.volume_un != null ? Number(orc.volume_un) : 100;
    const quantidade = orc.quantidade ?? 1000;
    const margem_pct = overrides.margem_pct ?? (orc.margem_pct != null ? Number(orc.margem_pct) : 30);

    // Produtividade direta (Doc 2d §A) — obrigatoria: do calculo OU ja no orcamento.
    const un_min = overrides.un_min ?? (orc.un_min != null ? Number(orc.un_min) : undefined);
    if (un_min == null) {
      throw new BadRequestException(
        'un_min (produtividade em unidades/minuto) e obrigatorio. Informe no calculo ou grave no orcamento.',
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
    const ncmRow = ncmId ? await this.prisma.ncm.findUnique({ where: { id: ncmId } }) : null;
    if (!ncmRow) {
      throw new BadRequestException(
        'Orcamento sem NCM efetivo (nem override, nem NCM na formula). O calculo fiscal exige NCM para o IPI — atribua um NCM ao orcamento ou a formula.',
      );
    }

    const { params: pf, caracterizacao } = await lerParametrosFiscaisVigentes(this.prisma);
    const modo = (orc.modo_operacao ?? 'full_service') as ModoOperacao;
    const perfil: PerfilClienteFiscal = {
      regime_fiscal: (orc.cliente?.regime_fiscal ?? null) as PerfilClienteFiscal['regime_fiscal'],
      finalidade: (orc.cliente?.finalidade_padrao ?? null) as PerfilClienteFiscal['finalidade'],
      uf: orc.cliente?.uf ?? null,
      contribuinte_icms: orc.cliente?.contribuinte_icms ?? null,
    };
    const ncmFiscal: NcmFiscal = {
      ncm: ncmRow.ncm,
      ex_tipi: ncmRow.ex_tipi,
      ipi_pct: Number(ncmRow.ipi_pct),
      monofasico: ncmRow.monofasico,
      tratamento: ncmRow.tratamento as NcmFiscal['tratamento'],
      icms_nominal_pct: ncmRow.icms_nominal_pct != null ? Number(ncmRow.icms_nominal_pct) : null,
    };
    const tributos = resolverTributosSaida(modo, perfil, ncmFiscal, pf, caracterizacao);

    const inputs: InputsFiscal = {
      cmp_base_mp_kg,
      volume_un,
      quantidade,
      un_min,
      margem_pct,
      embalagem_un: emb.embalagem_un,
    };
    const oper = {
      mo_folha_mensal: cfg.mo_folha_mensal,
      mo_dias_uteis: cfg.mo_dias_uteis,
      desvio_mp_pct: cfg.desvio_mp_pct,
      frete_un_brl: cfg.frete_un_brl,
    };
    const calc = calcularCustoFiscal(inputs, oper, tributos);
    const score_global = formula ? formula.score_global : 55; // sem formula => baixa confianca

    // Blindagem: sem base de MP (R$0/kg) o preco vira so MO — sinaliza preliminar.
    const semBaseMp = cmp_base_mp_kg === 0;
    const preliminar = emb.preliminar || semBaseMp;
    const aviso = semBaseMp
      ? 'Calculo sem base de materia-prima (R$0/kg). Defina uma formula ou informe o budget de MP para um valor real.'
      : emb.preliminar
        ? 'Embalagem sem cotacao — custo usa R$0 e o orcamento e preliminar (Doc 2d §B4).'
        : undefined;

    const calculo = {
      _mode: 'fiscal_granular',
      _modelo_versao: '3.0',
      _gerado_em: new Date().toISOString(),
      _preliminar: preliminar || undefined,
      _aviso: aviso,
      inputs,
      modo_operacao: modo,
      ncm: {
        codigo: ncmRow.ncm,
        ex_tipi: ncmRow.ex_tipi,
        ipi_pct: ncmFiscal.ipi_pct,
        monofasico: ncmFiscal.monofasico,
        tratamento: ncmFiscal.tratamento,
      },
      perfil_fiscal: perfil,
      parametros_operacionais: oper,
      parametros_fiscais: pf,
      material: calc.material,
      mao_de_obra: calc.mao_de_obra,
      parcelas: calc.parcelas,
      resultado: calc.resultado,
      fundamentos: calc.fundamentos,
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

    return {
      calculo,
      preco_sipi: calc.resultado.preco_sipi,
      preco_cipi: calc.resultado.preco_cipi,
      score_global,
      formula_versao_codigo: formula?.versao_codigo ?? null,
      formula_status_momento: formula?.status ?? null,
      formula_composicao_snapshot: formula?.composicao_snapshot ?? null,
    };
  }

  // ---------------- parametros de custo (system_config) ----------------
  private async getParametros(): Promise<ParametrosCusto> {
    const c = await this.prisma.systemConfig.findUnique({ where: { id: 1 } });
    return lerParametrosCusto(c);
  }

  // ---------------- embalagem do catalogo (Doc 2d §B4) ----------------
  private async resolverEmbalagem(orc: any): Promise<EmbalagemResolvida> {
    if (orc.sem_embalagem) return { embalagem_un: 0, preliminar: false, snapshot: null };

    // Snapshot ja gravado tem prioridade (preco travado no momento do orcamento).
    let snap = orc.embalagem_snapshot as any | null;
    if (!snap && orc.embalagem_id) {
      const e = await this.prisma.embalagem.findUnique({ where: { id: orc.embalagem_id } });
      if (e) {
        snap = {
          id: e.id,
          nome: e.nome,
          tipo: e.tipo,
          preco_un_brl: e.preco_un_brl != null ? Number(e.preco_un_brl) : null,
          fornecedor: e.fornecedor,
          preco_estimado: e.preco_estimado,
        };
      }
    }
    if (!snap) return { embalagem_un: 0, preliminar: false, snapshot: null };

    const preco = snap.preco_un_brl != null ? Number(snap.preco_un_brl) : null;
    // Sem cotacao -> usa R$0 e marca o orcamento como preliminar.
    return { embalagem_un: preco ?? 0, preliminar: preco == null, snapshot: snap };
  }

  // ---------------- carrega formula + custo atual + score ----------------
  private async carregarFormula(formulaId: number): Promise<FormulaComCusto> {
    const f = await this.prisma.formula.findUnique({
      where: { id: formulaId },
      include: {
        composicao: {
          orderBy: { ordem: 'asc' },
          include: { mp: { select: { codigo: true, nome: true, preco_kg_brl: true, data_cotacao: true } } },
        },
      },
    });
    if (!f) return null;

    let custoAtual = 0;
    const ingredientes = f.composicao.map((c) => {
      const conc = c.concentracao_pct != null ? Number(c.concentracao_pct) : 0;
      const preco = c.mp?.preco_kg_brl != null ? Number(c.mp.preco_kg_brl) : null;
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

    const somaPeso = ingredientes.reduce((a, i) => a + (i.custo_na_formula ?? 0), 0);
    const score =
      somaPeso > 0
        ? Math.round(ingredientes.reduce((a, i) => a + (i.custo_na_formula ?? 0) * i.score, 0) / somaPeso)
        : ingredientes.length
          ? Math.round(ingredientes.reduce((a, i) => a + i.score, 0) / ingredientes.length)
          : 50;

    return {
      id: f.id,
      nome_produto: f.nome_produto,
      versao_codigo: f.versao_codigo,
      status: f.status,
      origem: f.origem,
      custo_mp_kg_atual: Number(custoAtual.toFixed(4)),
      score_global: score,
      ingredientes,
      composicao_snapshot: ingredientes,
    };
  }
}
