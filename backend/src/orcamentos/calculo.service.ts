import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  calcularCustoPrivate,
  InputsCusto,
  ParametrosCusto,
} from './custo-engine';
import { scoreCotacao, faixaScore } from '../formulas/score.util';
import { CalcularDto } from './dto/calcular.dto';

type FormulaComCusto = {
  id: number;
  nome_produto: string;
  versao_codigo: string | null;
  status: string;
  origem: string;
  custo_mp_kg_atual: number;
  score_global: number;
  etapas_detectadas: number;
  ingredientes: any[];
  composicao_snapshot: any[];
} | null;

@Injectable()
export class CalculoService {
  private readonly logger = new Logger(CalculoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private temApiKey(): boolean {
    const k = this.config.get<string>('ANTHROPIC_API_KEY');
    return !!k && k.trim().length > 0;
  }

  /** Fase 1: monta inputs (MOCK ou REAL), roda o motor e devolve JSON_CALC travado. */
  async gerarCalculo(orcamentoId: string, overrides: CalcularDto) {
    const orc = await this.prisma.orcamento.findUnique({ where: { id: orcamentoId } });
    if (!orc) throw new NotFoundException('Orcamento nao encontrado');

    const cfg = await this.getParametros();
    const formula = orc.formula_id ? await this.carregarFormula(orc.formula_id) : null;

    // valores default razoaveis quando o briefing nao trouxe
    const volume_un = orc.volume_un != null ? Number(orc.volume_un) : 100;
    const quantidade = orc.quantidade ?? 1000;
    const margem_pct = overrides.margem_pct ?? (orc.margem_pct != null ? Number(orc.margem_pct) : 30);

    // estimativa dos inputs "fuzzy" (embalagem, fragrancia, etapas, mp base)
    const modoReal = this.temApiKey();
    const est = modoReal
      ? await this.estimarComIA(orc, formula, { volume_un, quantidade })
      : this.estimarMock(orc, formula, { volume_un });

    const inputs: InputsCusto = {
      cmp_base_mp_kg:
        overrides.cmp_base_mp_kg ??
        formula?.custo_mp_kg_atual ??
        est.cmp_base_mp_kg ??
        0,
      volume_un,
      quantidade,
      etapas: overrides.etapas ?? est.etapas ?? formula?.etapas_detectadas ?? 4,
      margem_pct,
      mp_frag_kg: overrides.mp_frag_kg ?? est.mp_frag_kg,
      embalagem_un: overrides.embalagem_un ?? est.embalagem_un,
    };

    const calc = calcularCustoPrivate(inputs, cfg);
    const score_global = formula ? formula.score_global : 55; // sem formula => baixa confianca

    const calculo = {
      _mode: est.modo,
      _modelo_versao: '1.0',
      _gerado_em: new Date().toISOString(),
      _aviso_mock:
        est.modo === 'mock'
          ? 'Inputs estimados por heuristica (ANTHROPIC_API_KEY ausente). Coerente, porem nao oficial.'
          : undefined,
      inputs,
      parametros: cfg,
      custo_mp: calc.custo_mp,
      mao_de_obra: calc.mao_de_obra,
      resultado: calc.resultado,
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
      ingredientes: formula?.ingredientes ?? [],
      estimativa: est.meta,
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
    return {
      mo_folha_mensal: c ? Number(c.mo_folha_mensal) : 75000,
      mo_dias_uteis: c ? c.mo_dias_uteis : 20,
      imposto_mp_pct: c ? Number(c.imposto_mp_pct) : 37.5,
      imposto_mo_pct: c ? Number(c.imposto_mo_pct) : 9.25,
      ipi_pct: c ? Number(c.ipi_pct) : 4.55,
      desvio_mp_pct: c ? Number(c.desvio_mp_pct) : 10,
      frete_un_brl: c ? Number(c.frete_un_brl) : 0.1,
    };
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
    const fases = new Set<string>();
    const ingredientes = f.composicao.map((c) => {
      const conc = c.concentracao_pct != null ? Number(c.concentracao_pct) : 0;
      const preco = c.mp?.preco_kg_brl != null ? Number(c.mp.preco_kg_brl) : null;
      const custo = preco != null ? (conc / 100) * preco : null;
      if (custo != null) custoAtual += custo;
      if (c.fase) fases.add(c.fase);
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
      etapas_detectadas: fases.size > 0 ? fases.size : 4,
      ingredientes,
      composicao_snapshot: ingredientes,
    };
  }

  // ---------------- estimativa MOCK (heuristica) ----------------
  private estimarMock(
    orc: any,
    formula: FormulaComCusto,
    ctx: { volume_un: number },
  ) {
    const jitter = (base: number, pct: number) =>
      Number((base * (1 + (Math.random() * 2 - 1) * pct)).toFixed(2));
    const nivel = orc.nivel ?? 'inter';
    const fragBase = nivel === 'premium' ? 180 : nivel === 'basic' ? 80 : 120;

    const embalagem_un = jitter(0.5 + ctx.volume_un * 0.004, 0.15);
    const mp_frag_kg = jitter(fragBase, 0.1);
    const etapas = formula?.etapas_detectadas ?? 4;
    const cmp_base_mp_kg = formula
      ? undefined
      : orc.budget_mp != null
        ? Number(orc.budget_mp)
        : jitter(60, 0.4);

    return {
      modo: 'mock' as const,
      embalagem_un,
      mp_frag_kg,
      etapas,
      cmp_base_mp_kg,
      meta: {
        fonte: 'heuristica',
        nivel,
        nota: 'embalagem ~ volume; fragrancia por nivel; etapas das fases da formula',
      },
    };
  }

  // ---------------- estimativa REAL (Anthropic API) ----------------
  private async estimarComIA(
    orc: any,
    formula: FormulaComCusto,
    ctx: { volume_un: number; quantidade: number },
  ) {
    const model = this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6';
    const key = this.config.get<string>('ANTHROPIC_API_KEY')!;

    const prompt = [
      'Voce e um analista de custos de cosmeticos da Private Cosmeticos.',
      'Estime APENAS os parametros de entrada (nao calcule preco final) e responda',
      'SOMENTE com um JSON valido, sem texto extra, no formato:',
      '{"etapas": <int 2-12>, "embalagem_un": <R$ por unidade>, "mp_frag_kg": <R$/kg fragrancia>,',
      ' "cmp_base_mp_kg": <R$/kg de MP, somente se NAO houver formula>, "justificativa": "<curto>"}',
      '',
      `Produto: ${orc.produto} | Categoria: ${orc.categoria ?? '-'} | Nivel: ${orc.nivel ?? '-'}`,
      `Volume por unidade: ${ctx.volume_un} mL | Quantidade do lote: ${ctx.quantidade}`,
      formula
        ? `Formula base: ${formula.nome_produto} (custo MP atual R$${formula.custo_mp_kg_atual}/kg, ${formula.etapas_detectadas} fases). NAO retorne cmp_base_mp_kg.`
        : 'Sem formula base — estime cmp_base_mp_kg coerente com a categoria/nivel.',
    ].join('\n');

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}`);
      const data: any = await resp.json();
      const texto: string = data?.content?.[0]?.text ?? '';
      const json = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
      return {
        modo: 'real' as const,
        embalagem_un: Number(json.embalagem_un) || undefined,
        mp_frag_kg: Number(json.mp_frag_kg) || undefined,
        etapas: Number(json.etapas) || undefined,
        cmp_base_mp_kg: formula ? undefined : Number(json.cmp_base_mp_kg) || undefined,
        meta: { fonte: 'anthropic', model, justificativa: json.justificativa ?? null },
      };
    } catch (e) {
      this.logger.warn(`Falha na IA, usando heuristica: ${(e as Error).message}`);
      const mock = this.estimarMock(orc, formula, { volume_un: ctx.volume_un });
      return { ...mock, modo: 'mock' as const, meta: { ...mock.meta, fallback_de: 'real', erro: (e as Error).message } };
    }
  }
}
