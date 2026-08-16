import { Injectable } from '@nestjs/common';
// pdfmake 0.3 — API unificada server/browser. Roboto embutido (sem .ttf no repo).
// Default import: o pacote exporta uma INSTANCIA; `import * as` (importStar)
// perderia os metodos de prototipo. esModuleInterop entrega a instancia real.
import pdfmake from 'pdfmake';
import type {
  TDocumentDefinitions,
  Content,
  TableCell,
} from 'pdfmake/interfaces';

/**
 * PDF INTERNO do orcamento — decisao/controle documental (NAO vai pro cliente),
 * por isso mostra TUDO, inclusive fundamentos fiscais.
 *
 * ESTRUTURA FIXA DE 2 PAGINAS (v1 e v3 — consistencia documental):
 *  - Pagina 1: resumo da cotacao (briefing + calculo completo).
 *  - Pagina 2: SO formulacao (MPs da formula, por menor que seja) + embalagem.
 *
 * Acentuacao: a Roboto embarcada e a fonte COMPLETA (todos os glifos latinos);
 * o texto deste template usa acentuacao normal de PT-BR.
 *
 * Tolerancia v1/v3 (F4 corte): orcamento calculado no engine ANTERIOR (v2.0)
 * rende a pagina 1 no formato historico com banner "modelo anterior" — o
 * snapshot NUNCA e migrado/reescrito (fronteira fiscal x preco, tese 2).
 * Calculado no engine fiscal granular (3.0) rende o formato novo
 * (enquadramento, parcelas, fundamentos).
 *
 * Stream em memoria: devolve um Buffer, nada e persistido em disco.
 */

// ---- Shape v1 LEGADO do JSON_CALC (engine pre-corte, _modelo_versao 2.0) ----
interface CalcResultadoV1 {
  custo_total: number;
  margem_pct: number;
  preco_sipi: number;
  ipi_pct: number;
  ipi_un: number;
  preco_cipi: number;
}
interface CalcCustoMpV1 {
  mp_base: number;
  desvio_pct: number;
  desvio: number;
  embalagem: number;
  frete: number;
  imposto_mp_pct: number;
  cmp_cimp: number;
}
interface CalcMaoDeObraV1 {
  producao_diaria: number;
  dias_necessarios: number;
  mo_lote: number;
  mo_un: number;
  imposto_mo_pct: number;
  cmo_cimp: number;
}
interface CalcParametrosV1 {
  mo_folha_mensal: number;
  mo_dias_uteis: number;
  imposto_mp_pct: number;
  imposto_mo_pct: number;
  ipi_pct: number;
  desvio_mp_pct: number;
  frete_un_brl: number;
}

// ---- Shape v3 (engine fiscal granular; _modelo_versao 3.0 pré-corte de MO,
// 3.1 a partir dele). O carimbo é documental: a discriminação de forma é por
// PRESENÇA DE CAMPO (isCalculoV3 e mao_de_obra.setup_un), nunca pela string. ----
interface CalcResultadoV3 {
  margem_pct: number;
  preco_sipi: number;
  ipi_pct: number;
  base_ipi: 'total' | 'material' | 'nao_aplica';
  ipi_un: number;
  icms_sobre_ipi: number;
  preco_cipi: number;
}
interface CalcMaterialV3 {
  mp_base: number;
  desvio: number;
  embalagem: number;
  frete: number;
  custo_material_un: number;
}
/**
 * MO do v3 em DUAS formas (o PDF tolera as duas — fronteira tese 2):
 *  3.1 (corte F3): taxa_minuto + setup_un + corrida_un.
 *  3.0 (pré-corte): mo_diario + dias_necessarios (artefato do ceil).
 */
interface CalcMaoDeObraV3 {
  producao_diaria: number;
  mo_un: number;
  taxa_minuto?: number;
  custo_setup_ordem?: number;
  minutos_produtivos_dia_linha?: number;
  setup_un?: number;
  corrida_un?: number;
  mo_diario?: number;
  dias_necessarios?: number;
}
interface CalcParcelaV3 {
  custo_un: number;
  taxa_pct: number;
  preco_un: number;
}
interface CalcNcmV3 {
  codigo: string;
  ex_tipi: string;
  ipi_pct: number;
  monofasico: boolean;
  tratamento: string;
}
interface CalcOperV3 {
  // 3.0: folha/dias. 3.1 (corte F3): substituídos por `producao` (parâmetros
  // versionados) — opcionais para o PDF tolerar snapshots das duas formas.
  mo_folha_mensal?: number;
  mo_dias_uteis?: number;
  producao?: Record<string, number>;
  desvio_mp_pct: number;
  frete_un_brl: number;
}

// ---- Comum aos dois shapes ----
interface CalcIngrediente {
  nome: string | null;
  mp_codigo: string | null;
  concentracao_pct: number | null;
  preco_kg_atual: number | null;
  custo_na_formula: number | null;
  score: number | null;
  fase: string | null;
}
interface CalcFormulaUsada {
  nome: string;
  versao: string | null;
  status: string | null;
  origem: string | null;
}
interface CalculoJson {
  _mode?: string;
  _modelo_versao?: string;
  _gerado_em?: string;
  _preliminar?: boolean;
  _aviso?: string;
  score_global: number;
  faixa: string;
  formula_usada: CalcFormulaUsada | null;
  ingredientes: CalcIngrediente[];
  /** snap da embalagem resolvido no cálculo (v1 e v3) — fallback p/ históricos sem embalagem_snapshot (bug #50). */
  embalagem?: OrcamentoPdf['embalagem_snapshot'];
  // v1 (legado)
  resultado: CalcResultadoV1 & CalcResultadoV3; // uniao pratica: cada renderer le so o seu
  custo_mp?: CalcCustoMpV1;
  mao_de_obra: CalcMaoDeObraV1 & CalcMaoDeObraV3;
  parametros?: CalcParametrosV1;
  // v3 (fiscal granular)
  modo_operacao?: 'full_service' | 'hibrido' | 'industrializacao';
  ncm?: CalcNcmV3;
  material?: CalcMaterialV3;
  /** alertas derivados (red team): MOQ e MP sem preço. Ausente em snapshots antigos. */
  alertas?: {
    moq: {
      custo_lote: number;
      peso_setup_pct: number;
      lote_minimo_valor: number;
      quantidade_minima: number;
    } | null;
    mp_sem_preco: { quantidade: number; nomes: string[] } | null;
  };
  parcelas?: { material: CalcParcelaV3 | null; mo: CalcParcelaV3 | null };
  parametros_operacionais?: CalcOperV3;
  fundamentos?: string[];
}

/** Discrimina v3 (fiscal granular) de v1 legado — mesmo criterio da tela. */
function isCalculoV3(c: CalculoJson): boolean {
  return c.material !== undefined && c.ncm !== undefined;
}

/** Subconjunto do Orcamento (Prisma findOne) lido pelo PDF. */
interface OrcamentoPdf {
  numero: number;
  produto: string | null;
  status: string;
  categoria: string | null;
  nivel: string | null;
  volume_un: unknown;
  quantidade: number | null;
  margem_pct: unknown;
  un_min: unknown;
  preco_cipi: unknown;
  produto_referencia: string | null;
  requer_amostra: boolean;
  sem_embalagem: boolean;
  cliente: { nome: string } | null;
  formula: { nome_produto: string; versao_codigo: string | null } | null;
  embalagem_snapshot: {
    nome?: string;
    tipo?: string;
    preco_un_brl?: number | null;
    fornecedor?: string | null;
    preco_estimado?: boolean;
  } | null;
  calculo: unknown;
}

// --- Tokens visuais do design system "Atelier Tecnico" (frontend/src/index.css) ---
const COR = {
  ink: '#1C1712',
  sand: '#FAF7F2',
  gold: '#B8832A',
  goldText: '#8A6320',
  goldSoft: '#FBF4E6',
  border: '#E7DECF',
  warm500: '#94836A',
  warm600: '#6E5E47',
  warning: '#C2410C',
  warningSoft: '#FBEAE0',
};

const NIVEL_LABEL: Record<string, string> = {
  basic: 'Basic',
  inter: 'Intermediário',
  premium: 'Premium',
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  aprovado_interno: 'Aprovado interno',
  enviado: 'Enviado',
  aprovado_cliente: 'Aprovado cliente',
  recusado: 'Recusado',
};

const MODO_LABEL: Record<string, string> = {
  full_service: 'Full service (venda do produto)',
  hibrido: 'Híbrido (material próprio + industrialização)',
  industrializacao: 'Industrialização (só mão de obra)',
};

const BASE_IPI_LABEL: Record<string, string> = {
  total: 'valor total da operação',
  material: 'apenas material próprio',
  nao_aplica: 'não aplicável',
};

@Injectable()
export class PdfService {
  constructor() {
    // Registra o Roboto que acompanha o pacote (resolvido por modulo — robusto
    // apos `nest build`, independente do cwd/dist). Sem acesso a rede/FS externo.
    pdfmake.setUrlAccessPolicy(() => false);
    pdfmake.setLocalAccessPolicy(() => true);
    pdfmake.setFonts({
      Roboto: {
        normal: require.resolve('pdfmake/fonts/Roboto/Roboto-Regular.ttf'),
        bold: require.resolve('pdfmake/fonts/Roboto/Roboto-Medium.ttf'),
        italics: require.resolve('pdfmake/fonts/Roboto/Roboto-Italic.ttf'),
        bolditalics:
          require.resolve('pdfmake/fonts/Roboto/Roboto-MediumItalic.ttf'),
      },
    });
  }

  /** Gera o PDF a partir de um orcamento JA calculado (calculo != null). */
  async gerar(orcamento: unknown): Promise<Buffer> {
    const orc = orcamento as OrcamentoPdf;
    const pdf = pdfmake.createPdf(this.montarDoc(orc));
    return pdf.getBuffer();
  }

  // ---------------- helpers de formatacao ----------------
  private brl(n: number | null | undefined): string {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private num(n: unknown): string {
    return n === null || n === undefined ? '—' : String(Number(n));
  }

  // ---------------- montagem do documento (2 paginas FIXAS) ----------------
  private montarDoc(orcRaw: OrcamentoPdf): TDocumentDefinitions {
    const c = orcRaw.calculo as CalculoJson;
    const v3 = isCalculoV3(c);
    // BUG #50: orçamentos calculados antes do fix não têm embalagem_snapshot
    // persistido — o snap resolvido vive dentro do próprio JSON_CALC. Fallback
    // de leitura (não reescreve nada): snapshot da coluna > snap do cálculo.
    const orc: OrcamentoPdf = {
      ...orcRaw,
      embalagem_snapshot: orcRaw.embalagem_snapshot ?? c.embalagem ?? null,
    };

    // PAGINA 1 — resumo da cotacao (formato conforme a versao do calculo)
    const content: Content[] = [this.cabecalho(orc, c)];
    if (c._preliminar) content.push(this.bannerPreliminar(c._aviso));
    if (!v3) content.push(this.bannerHistorico(c._modelo_versao));
    content.push(this.secaoBriefing(orc));
    content.push(this.cardsPreco(c));

    if (v3) {
      content.push(this.secaoEnquadramentoV3(c));
      // material e MO em UMA coluna cada: custo fisico + origem da MO (folha/
      // dias uteis) + parcela precificada — sem bloco separado de parametros.
      content.push(this.blocosMaterialMoV3(c));
      content.push(this.secaoFundamentosV3(c.fundamentos ?? []));
    } else {
      if (c.custo_mp) content.push(this.blocosCustoV1(c.custo_mp, c.mao_de_obra));
      if (c.parametros) content.push(this.secaoParametrosV1(c.parametros));
    }

    // PAGINA 2 — SEMPRE e SO: formulacao + embalagem (pageBreak forcado).
    // Nunca sai vazia: sem ingredientes rende o texto honesto; embalagem
    // sempre tem um estado (snapshot / a granel / sem registro).
    content.push(this.pagina2(orc, c));

    return {
      pageSize: 'A4',
      pageMargins: [40, 48, 40, 56],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 9,
        color: COR.ink,
        lineHeight: 1.15,
      },
      info: {
        title: `Orçamento ${this.num(orc.numero)}`,
        author: 'Private Cosmeticos',
        subject: orc.produto ?? undefined,
      },
      content,
      footer: (pagina: number, total: number): Content => ({
        margin: [40, 12, 40, 0],
        columns: [
          {
            text: [
              'Documento interno de controle — Private Studio. ',
              c._gerado_em
                ? `Cálculo gerado em ${this.dataHora(c._gerado_em)}. `
                : '',
              c._modelo_versao ? `Modelo ${c._modelo_versao}` : '',
              c._mode ? ` (${c._mode})` : '',
            ].join(''),
            fontSize: 7,
            color: COR.warm500,
          },
          {
            text: `${pagina}/${total}`,
            alignment: 'right',
            fontSize: 7,
            color: COR.warm500,
          },
        ],
      }),
      styles: {
        h1: { fontSize: 17, bold: true, color: COR.ink },
        secao: {
          fontSize: 11,
          bold: true,
          color: COR.goldText,
          margin: [0, 10, 0, 4],
        },
        rotulo: { fontSize: 7, color: COR.warm500, characterSpacing: 0.4 },
        th: { fontSize: 7.5, bold: true, color: COR.warm600 },
        // avisos do red team (MP sem preço, MOQ) — precisam saltar da página
        aviso: { fontSize: 7.5, bold: true, color: COR.warning },
      },
    };
  }

  // ================= blocos comuns (pagina 1) =================

  private cabecalho(orc: OrcamentoPdf, c: CalculoJson): Content {
    const preco =
      c.resultado?.preco_cipi ??
      (orc.preco_cipi != null ? Number(orc.preco_cipi) : null);
    return {
      columns: [
        {
          width: '*',
          stack: [
            {
              text: `#${this.num(orc.numero)} · ${orc.produto ?? ''}`,
              style: 'h1',
            },
            {
              text: STATUS_LABEL[orc.status] ?? orc.status,
              fontSize: 8,
              color: COR.warm600,
              margin: [0, 4, 0, 0],
            },
          ],
        },
        {
          width: 'auto',
          stack: [
            { text: 'PREÇO C/ IPI', style: 'rotulo', alignment: 'right' },
            {
              text: this.brl(preco),
              fontSize: 16,
              bold: true,
              color: COR.goldText,
              alignment: 'right',
            },
            {
              text: 'por unidade',
              fontSize: 7,
              color: COR.warm500,
              alignment: 'right',
            },
          ],
        },
      ],
    };
  }

  private bannerPreliminar(aviso?: string): Content {
    return {
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: `⚠  ${aviso ?? 'Orçamento preliminar.'}`,
              fontSize: 8,
              color: COR.warning,
              fillColor: COR.warningSoft,
              margin: [8, 6, 8, 6],
            },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 12, 0, 0],
    };
  }

  /** Banner de HISTORICO (calculo v1, pre-corte F4) — espelha o aviso da tela. */
  private bannerHistorico(versao?: string): Content {
    return {
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: `Calculado no modelo anterior (v${versao ?? '2.0'}). Valores históricos preservados — não recalculados. Para o modelo fiscal atual, gere um novo cálculo.`,
              fontSize: 8,
              color: COR.warm600,
              fillColor: COR.sand,
              margin: [8, 6, 8, 6],
            },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 12, 0, 0],
    };
  }

  private secaoBriefing(orc: OrcamentoPdf): Content {
    const f = orc.formula
      ? `${orc.formula.nome_produto}${orc.formula.versao_codigo ? ` ${orc.formula.versao_codigo}` : ''}`
      : 'Sem fórmula';
    const emb = orc.sem_embalagem
      ? 'A granel (sem embalagem)'
      : (orc.embalagem_snapshot?.nome ?? '—');

    const campos: Array<[string, string]> = [
      ['Produto', orc.produto ?? '—'],
      ['Cliente', orc.cliente?.nome ?? '—'],
      ['Categoria', orc.categoria ?? '—'],
      ['Nível', orc.nivel ? (NIVEL_LABEL[orc.nivel] ?? orc.nivel) : '—'],
      [
        'Volume/un',
        orc.volume_un != null ? `${this.num(orc.volume_un)} mL/g` : '—',
      ],
      [
        'Quantidade do lote',
        orc.quantidade != null ? this.num(orc.quantidade) : '—',
      ],
      ['Fórmula', f],
      ['Embalagem', emb],
      [
        'Produtividade',
        orc.un_min != null ? `${this.num(orc.un_min)} un/min` : '—',
      ],
      ['Margem', orc.margem_pct != null ? `${this.num(orc.margem_pct)}%` : '—'],
      ['Produto de referência', orc.produto_referencia ?? '—'],
      ['Requer amostra', orc.requer_amostra ? 'Sim' : 'Não'],
    ];

    // 3 colunas de pares rotulo/valor
    const linhas: TableCell[][] = [];
    for (let i = 0; i < campos.length; i += 3) {
      const linha: TableCell[] = campos.slice(i, i + 3).map(([r, v]) => ({
        stack: [
          { text: r.toUpperCase(), style: 'rotulo' },
          { text: v, fontSize: 9, margin: [0, 1, 0, 0] },
        ],
        margin: [0, 2, 8, 2],
      }));
      while (linha.length < 3) linha.push({ text: '' });
      linhas.push(linha);
    }

    return {
      stack: [
        { text: 'Briefing', style: 'secao' },
        {
          table: { widths: ['*', '*', '*'], body: linhas },
          layout: this.layoutSuave(),
        },
      ],
    };
  }

  private cardsPreco(c: CalculoJson): Content {
    const res = c.resultado;
    const card = (
      rotulo: string,
      valor: string,
      destaque?: boolean,
    ): TableCell => ({
      stack: [
        { text: rotulo, style: 'rotulo' },
        {
          text: valor,
          fontSize: 15,
          bold: true,
          color: destaque ? COR.goldText : COR.ink,
          margin: [0, 3, 0, 0],
        },
        { text: 'por unidade', fontSize: 7, color: COR.warm500 },
      ],
      margin: [10, 7, 10, 7],
      fillColor: destaque ? COR.goldSoft : COR.sand,
    });

    return {
      stack: [
        { text: 'Cálculo', style: 'secao' },
        {
          table: {
            widths: ['*', '*', '*'],
            body: [
              [
                card('PREÇO SEM IPI', this.brl(res.preco_sipi)),
                card('PREÇO COM IPI', this.brl(res.preco_cipi), true),
                {
                  stack: [
                    { text: 'CONFIANÇA DA COTAÇÃO', style: 'rotulo' },
                    {
                      text: `${this.num(c.score_global)}/100`,
                      fontSize: 15,
                      bold: true,
                      margin: [0, 3, 0, 0],
                    },
                    { text: c.faixa ?? '', fontSize: 7, color: COR.warm500 },
                  ],
                  margin: [10, 7, 10, 7],
                  fillColor: COR.sand,
                },
              ],
            ],
          },
          layout: 'noBorders',
        },
      ],
    };
  }

  // linha rotulo -> valor (tabelas de 2 colunas)
  private linhaRV(r: string, v: string, destaque?: boolean): TableCell[] {
    return [
      { text: r, fontSize: 8, color: COR.warm600, margin: [0, 1.5, 0, 1.5] },
      {
        text: v,
        fontSize: 8.5,
        bold: !!destaque,
        color: COR.ink,
        alignment: 'right',
        margin: [0, 1.5, 0, 1.5],
      },
    ];
  }

  // par rotulo/valor empilhado (grades de parametros)
  private itemRV(r: string, v: string): TableCell {
    return {
      stack: [
        { text: r.toUpperCase(), style: 'rotulo' },
        { text: v, fontSize: 9, margin: [0, 1, 0, 0] },
      ],
      margin: [0, 2, 8, 2],
    };
  }

  // ================= pagina 1 — renderer v3 (fiscal granular) =================

  private secaoEnquadramentoV3(c: CalculoJson): Content {
    const ncm = c.ncm!;
    const res = c.resultado;
    const ncmLabel = `${ncm.codigo}${ncm.ex_tipi ? ` ${ncm.ex_tipi}` : ''}`;
    const body: TableCell[][] = [
      [
        this.itemRV('Modo de operação', MODO_LABEL[c.modo_operacao ?? ''] ?? c.modo_operacao ?? '—'),
        this.itemRV('NCM', ncmLabel),
        this.itemRV('Produto monofásico', ncm.monofasico ? 'Sim' : 'Não'),
        this.itemRV('Tratamento IPI', ncm.tratamento),
      ],
      [
        this.itemRV('IPI', `${this.num(res.ipi_pct)}% (${this.brl(res.ipi_un)}/un)`),
        this.itemRV('Base do IPI', BASE_IPI_LABEL[res.base_ipi] ?? res.base_ipi),
        this.itemRV(
          'ICMS sobre o IPI',
          res.icms_sobre_ipi > 0 ? this.brl(res.icms_sobre_ipi) : '—',
        ),
        { text: '' },
      ],
    ];
    return {
      stack: [
        { text: 'Enquadramento fiscal', style: 'secao' },
        {
          table: { widths: ['*', '*', '*', '*'], body },
          layout: this.layoutSuave(),
        },
      ],
    };
  }

  /**
   * Material e MO lado a lado. A MO carrega a PROPRIA ORIGEM do custo (folha
   * mensal + dias úteis — decisao do Gabriel: ficam aqui, nao num bloco
   * separado). Desvio e frete ja aparecem no material — sem redundancia.
   */
  private blocosMaterialMoV3(c: CalculoJson): Content {
    const mat = c.material!;
    const mo = c.mao_de_obra;
    const oper = c.parametros_operacionais;

    const bodyMat: TableCell[][] = [
      [{ text: 'Material (custo sem colchão de imposto)', style: 'th', colSpan: 2 }, {}],
      this.linhaRV('MP base/un', this.brl(mat.mp_base)),
      this.linhaRV('Desvio/un', this.brl(mat.desvio)),
      this.linhaRV('Embalagem/un', this.brl(mat.embalagem)),
      this.linhaRV('Frete/un', this.brl(mat.frete)),
      this.linhaRV('Custo de material/un', this.brl(mat.custo_material_un), true),
    ];
    // Aviso AGREGADO de MP sem preço: a linha da MP já aparece na formulação,
    // mas o impacto no custo tem que estar junto do número (regra 7).
    const semPreco = c.alertas?.mp_sem_preco;
    if (semPreco) {
      bodyMat.push([
        {
          text:
            `ATENCAO: ${semPreco.quantidade} materia-prima(s) SEM PRECO ` +
            `(${semPreco.nomes.join(', ')}) entraram valendo R$ 0,00. ` +
            `O custo de material acima esta SUBESTIMADO.`,
          colSpan: 2,
          style: 'aviso',
        },
        {},
      ]);
    }
    if (c.parcelas?.material) {
      bodyMat.push(
        this.linhaRV('Tributos por dentro', `${this.num(c.parcelas.material.taxa_pct)}%`),
        this.linhaRV('Preço da parcela/un (s/ IPI)', this.brl(c.parcelas.material.preco_un), true),
      );
    }

    const bodyMo: TableCell[][] = [
      [{ text: 'Mão de obra / execução', style: 'th', colSpan: 2 }, {}],
    ];
    // Forma 3.1 (corte F3) vs 3.0 (histórico): só imprime o que o snapshot tem.
    if (mo.setup_un != null) {
      bodyMo.push(
        this.linhaRV('Setup/un (ordem diluída no lote)', this.brl(mo.setup_un)),
        this.linhaRV('Corrida/un (tempo real)', this.brl(mo.corrida_un!)),
        this.linhaRV('Taxa por minuto produtivo', this.brl(mo.taxa_minuto!)),
        this.linhaRV('Produção diária/linha', `${this.num(mo.producao_diaria)} un`),
      );
    } else {
      if (oper?.mo_folha_mensal != null) {
        bodyMo.push(
          this.linhaRV('Folha mensal', this.brl(oper.mo_folha_mensal)),
          this.linhaRV('Dias úteis/mês', this.num(oper.mo_dias_uteis!)),
        );
      }
      bodyMo.push(this.linhaRV('Produção diária', `${this.num(mo.producao_diaria)} un`));
      if (mo.dias_necessarios != null) {
        bodyMo.push(
          this.linhaRV('Dias necessários (modelo anterior)', this.num(mo.dias_necessarios)),
        );
      }
    }
    bodyMo.push(this.linhaRV('MO/un', this.brl(mo.mo_un), true));
    // MOQ econômico: o setup pesa demais neste lote — informa, não bloqueia.
    const moq = c.alertas?.moq;
    if (moq) {
      bodyMo.push([
        {
          text:
            `ABAIXO DO MOQ ECONOMICO: setup = ${moq.peso_setup_pct}% do lote ` +
            `(${this.brl(moq.custo_lote)}). A partir de ${moq.quantidade_minima} un ` +
            `(lote de ${this.brl(moq.lote_minimo_valor)}) o setup cai para 10% ou menos.`,
          colSpan: 2,
          style: 'aviso',
        },
        {},
      ]);
    }
    if (c.parcelas?.mo) {
      bodyMo.push(
        this.linhaRV('Custo da parcela/un', this.brl(c.parcelas.mo.custo_un)),
        this.linhaRV('Tributos por dentro', `${this.num(c.parcelas.mo.taxa_pct)}%`),
        this.linhaRV('Preço da parcela/un (s/ IPI)', this.brl(c.parcelas.mo.preco_un), true),
      );
    }

    return {
      columns: [
        { table: { widths: ['*', 'auto'], body: bodyMat }, layout: this.layoutSuave() },
        { table: { widths: ['*', 'auto'], body: bodyMo }, layout: this.layoutSuave() },
      ],
      columnGap: 12,
      margin: [0, 8, 0, 0],
    };
  }

  private secaoFundamentosV3(fundamentos: string[]): Content {
    if (!fundamentos.length) return { text: '' };
    return {
      stack: [
        { text: 'Fundamentos fiscais aplicados', style: 'secao' },
        {
          table: {
            widths: ['*'],
            body: fundamentos.map((f) => [
              { text: `•  ${f}`, fontSize: 7.5, color: COR.warm600, margin: [4, 1, 4, 1] },
            ]),
          },
          layout: 'noBorders',
        },
      ],
    };
  }

  // ================= pagina 1 — renderer v1 (historico) =================

  private blocosCustoV1(mp: CalcCustoMpV1, mo: CalcMaoDeObraV1): Content {
    const tabelaMp: Content = {
      table: {
        widths: ['*', 'auto'],
        body: [
          [{ text: 'Custo de matéria-prima (modelo anterior)', style: 'th', colSpan: 2 }, {}],
          this.linhaRV('MP base/un', this.brl(mp.mp_base)),
          this.linhaRV(`Desvio (${this.num(mp.desvio_pct)}%)`, this.brl(mp.desvio)),
          this.linhaRV('Embalagem/un', this.brl(mp.embalagem)),
          this.linhaRV('Frete/un', this.brl(mp.frete)),
          this.linhaRV(
            `Custo MP c/ imposto (${this.num(mp.imposto_mp_pct)}%)`,
            this.brl(mp.cmp_cimp),
            true,
          ),
        ],
      },
      layout: this.layoutSuave(),
    };

    const tabelaMo: Content = {
      table: {
        widths: ['*', 'auto'],
        body: [
          [{ text: 'Mão de obra (modelo anterior)', style: 'th', colSpan: 2 }, {}],
          this.linhaRV('Produção diária', `${this.num(mo.producao_diaria)} un`),
          this.linhaRV('Dias necessários', this.num(mo.dias_necessarios)),
          this.linhaRV('MO/lote', this.brl(mo.mo_lote)),
          this.linhaRV('MO/un', this.brl(mo.mo_un)),
          this.linhaRV(
            `Custo MO c/ imposto (${this.num(mo.imposto_mo_pct)}%)`,
            this.brl(mo.cmo_cimp),
            true,
          ),
        ],
      },
      layout: this.layoutSuave(),
    };

    return { columns: [tabelaMp, tabelaMo], columnGap: 12, margin: [0, 10, 0, 0] };
  }

  private secaoParametrosV1(par: CalcParametrosV1): Content {
    const body: TableCell[][] = [
      [
        this.itemRV('IPI', `${this.num(par.ipi_pct)}%`),
        this.itemRV('Frete/un', this.brl(par.frete_un_brl)),
        this.itemRV('Imposto MP', `${this.num(par.imposto_mp_pct)}%`),
        this.itemRV('Imposto MO', `${this.num(par.imposto_mo_pct)}%`),
      ],
      [
        this.itemRV('Desvio MP', `${this.num(par.desvio_mp_pct)}%`),
        this.itemRV('Folha mensal', this.brl(par.mo_folha_mensal)),
        this.itemRV('Dias úteis/mês', this.num(par.mo_dias_uteis)),
        { text: '' },
      ],
    ];
    return {
      stack: [
        { text: 'Parâmetros do sistema (modelo anterior)', style: 'secao' },
        {
          table: { widths: ['*', '*', '*', '*'], body },
          layout: this.layoutSuave(),
        },
      ],
    };
  }

  // ================= PAGINA 2 — SO formulacao + embalagem (SEMPRE) =================

  private pagina2(orc: OrcamentoPdf, c: CalculoJson): Content {
    return {
      // pageBreak 'before' garante a estrutura fixa: pagina 2 comeca aqui.
      pageBreak: 'before',
      stack: [
        {
          text: `Formulação e embalagem — orçamento #${this.num(orc.numero)}`,
          style: 'h1',
          fontSize: 13,
        },
        this.secaoFormulacao(c),
        this.secaoEmbalagem(orc),
      ],
    };
  }

  private secaoFormulacao(c: CalculoJson): Content {
    const ingredientes = c.ingredientes ?? [];

    const base = c.formula_usada
      ? `Base: ${c.formula_usada.nome} ${c.formula_usada.versao ?? ''} (${c.formula_usada.origem ?? '—'}, ${c.formula_usada.status ?? '—'})`
      : null;

    // Caso honesto: orcamento sem formula (custo por budget) — a pagina 2
    // existe do mesmo jeito, sem tabela vazia nem quebra.
    if (!ingredientes.length) {
      return {
        stack: [
          { text: 'Formulação', style: 'secao' },
          ...(base ? [{ text: base, fontSize: 8, color: COR.warm600, margin: [0, 0, 0, 6] as [number, number, number, number] }] : []),
          {
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    text: 'Sem fórmula vinculada — custo de MP estimado pelo budget informado no briefing. A formulação será anexada quando o laboratório desenvolver/vincular a fórmula.',
                    fontSize: 8.5,
                    color: COR.warm600,
                    fillColor: COR.sand,
                    margin: [8, 8, 8, 8],
                  },
                ],
              ],
            },
            layout: 'noBorders',
          },
        ],
      };
    }

    const head: TableCell[] = [
      'Fase',
      'Matéria-prima',
      'Código',
      'Conc.',
      'Preço/kg',
      'Custo/kg', // custo da MP por kg DE PRODUTO (conc. × preço/kg) — não por unidade
      'Score',
    ].map((t) => ({
      text: t,
      style: 'th',
      fillColor: COR.sand,
      margin: [3, 3, 3, 3],
    }));

    const linhas: TableCell[][] = ingredientes.map((i) => [
      { text: i.fase ?? '—', fontSize: 8, margin: [3, 2, 3, 2] },
      { text: i.nome ?? '—', fontSize: 8, margin: [3, 2, 3, 2] },
      { text: i.mp_codigo ?? '—', fontSize: 8, margin: [3, 2, 3, 2] },
      {
        text: `${this.num(i.concentracao_pct)}%`,
        fontSize: 8,
        alignment: 'right',
        margin: [3, 2, 3, 2],
      },
      {
        text:
          i.preco_kg_atual != null ? this.brl(i.preco_kg_atual) : 's/ preço',
        fontSize: 8,
        alignment: 'right',
        color: i.preco_kg_atual != null ? COR.ink : COR.warning,
        margin: [3, 2, 3, 2],
      },
      {
        text: i.custo_na_formula != null ? this.brl(i.custo_na_formula) : '—',
        fontSize: 8,
        alignment: 'right',
        margin: [3, 2, 3, 2],
      },
      {
        text: this.num(i.score),
        fontSize: 8,
        alignment: 'right',
        margin: [3, 2, 3, 2],
      },
    ]);

    return {
      stack: [
        { text: 'Formulação', style: 'secao' },
        ...(base ? [{ text: base, fontSize: 8, color: COR.warm600, margin: [0, 0, 0, 6] as [number, number, number, number] }] : []),
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
            body: [head, ...linhas],
          },
          layout: this.layoutGrade(),
        },
      ],
    };
  }

  private secaoEmbalagem(orc: OrcamentoPdf): Content {
    let corpo: Content;
    if (orc.sem_embalagem) {
      corpo = {
        text: 'A granel — orçamento sem embalagem (apenas fórmula).',
        fontSize: 8.5,
        color: COR.warm600,
        margin: [0, 2, 0, 0],
      };
    } else if (orc.embalagem_snapshot) {
      const e = orc.embalagem_snapshot;
      const body: TableCell[][] = [
        [
          this.itemRV('Embalagem', e.nome ?? '—'),
          this.itemRV('Tipo', e.tipo ?? '—'),
          this.itemRV('Fornecedor', e.fornecedor ?? '—'),
          this.itemRV(
            'Preço/un',
            e.preco_un_brl != null
              ? `${this.brl(Number(e.preco_un_brl))}${e.preco_estimado ? ' (estimado)' : ''}`
              : 'Sem cotação (usa R$ 0 — preliminar)',
          ),
        ],
      ];
      corpo = {
        table: { widths: ['*', '*', '*', '*'], body },
        layout: this.layoutSuave(),
      };
    } else {
      corpo = {
        text: 'Sem embalagem registrada no orçamento.',
        fontSize: 8.5,
        color: COR.warm600,
        margin: [0, 2, 0, 0],
      };
    }

    return {
      stack: [{ text: 'Embalagem', style: 'secao' }, corpo],
    };
  }

  // ---------------- layouts de tabela ----------------
  private layoutSuave() {
    return {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => COR.border,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    };
  }

  private layoutGrade() {
    return {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => COR.border,
      vLineColor: () => COR.border,
    };
  }

  private dataHora(iso: string): string {
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
      });
    } catch {
      return iso;
    }
  }
}
