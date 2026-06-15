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
 * Geracao do PDF INTERNO de um orcamento (Dia 14). NAO e documento de
 * apresentacao ao cliente (fase 2) — espelha 1:1 a tela /orcamentos/:id:
 * briefing, precos, breakdown de custo de MP e MO, parametros e composicao.
 *
 * Stream em memoria: devolve um Buffer, nada e persistido em disco.
 */

// ---- Shape do JSON_CALC travado (espelha calculo.service.ts / custo-engine.ts) ----
interface CalcResultado {
  custo_total: number;
  margem_pct: number;
  preco_sipi: number;
  ipi_pct: number;
  ipi_un: number;
  preco_cipi: number;
}
interface CalcCustoMp {
  mp_base: number;
  desvio_pct: number;
  desvio: number;
  embalagem: number;
  frete: number;
  imposto_mp_pct: number;
  cmp_cimp: number;
}
interface CalcMaoDeObra {
  producao_diaria: number;
  dias_necessarios: number;
  mo_lote: number;
  mo_un: number;
  imposto_mo_pct: number;
  cmo_cimp: number;
}
interface CalcParametros {
  mo_folha_mensal: number;
  mo_dias_uteis: number;
  imposto_mp_pct: number;
  imposto_mo_pct: number;
  ipi_pct: number;
  desvio_mp_pct: number;
  frete_un_brl: number;
}
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
  resultado: CalcResultado;
  custo_mp: CalcCustoMp;
  mao_de_obra: CalcMaoDeObra;
  parametros: CalcParametros;
  score_global: number;
  faixa: string;
  formula_usada: CalcFormulaUsada | null;
  ingredientes: CalcIngrediente[];
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
  embalagem_snapshot: { nome?: string } | null;
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
  inter: 'Intermediario',
  premium: 'Premium',
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  aprovado_interno: 'Aprovado interno',
  enviado: 'Enviado',
  aprovado_cliente: 'Aprovado cliente',
  recusado: 'Recusado',
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

  // ---------------- montagem do documento ----------------
  private montarDoc(orc: OrcamentoPdf): TDocumentDefinitions {
    const c = orc.calculo as CalculoJson;
    const content: Content[] = [this.cabecalho(orc, c.resultado)];

    if (c._preliminar) content.push(this.bannerPreliminar(c._aviso));

    content.push(this.secaoBriefing(orc));
    content.push(this.cardsPreco(c));
    content.push(this.blocosCusto(c.custo_mp, c.mao_de_obra));
    content.push(this.secaoParametros(c.parametros));

    const ingredientes = c.ingredientes ?? [];
    if (ingredientes.length)
      content.push(this.secaoComposicao(c, ingredientes));

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
        title: `Orcamento ${this.num(orc.numero)}`,
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
                ? `Calculo gerado em ${this.dataHora(c._gerado_em)}. `
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
          margin: [0, 16, 0, 6],
        },
        rotulo: { fontSize: 7, color: COR.warm500, characterSpacing: 0.4 },
        th: { fontSize: 7.5, bold: true, color: COR.warm600 },
      },
    };
  }

  private cabecalho(orc: OrcamentoPdf, res: CalcResultado): Content {
    const preco =
      res.preco_cipi ??
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
            { text: 'PRECO C/ IPI', style: 'rotulo', alignment: 'right' },
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
              text: `⚠  ${aviso ?? 'Orcamento preliminar.'}`,
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

  private secaoBriefing(orc: OrcamentoPdf): Content {
    const f = orc.formula
      ? `${orc.formula.nome_produto}${orc.formula.versao_codigo ? ` ${orc.formula.versao_codigo}` : ''}`
      : 'Sem formula';
    const emb = orc.sem_embalagem
      ? 'A granel (sem embalagem)'
      : (orc.embalagem_snapshot?.nome ?? '—');

    const campos: Array<[string, string]> = [
      ['Produto', orc.produto ?? '—'],
      ['Cliente', orc.cliente?.nome ?? '—'],
      ['Categoria', orc.categoria ?? '—'],
      ['Nivel', orc.nivel ? (NIVEL_LABEL[orc.nivel] ?? orc.nivel) : '—'],
      [
        'Volume/un',
        orc.volume_un != null ? `${this.num(orc.volume_un)} mL/g` : '—',
      ],
      [
        'Quantidade do lote',
        orc.quantidade != null ? this.num(orc.quantidade) : '—',
      ],
      ['Formula', f],
      ['Embalagem', emb],
      [
        'Produtividade',
        orc.un_min != null ? `${this.num(orc.un_min)} un/min` : '—',
      ],
      ['Margem', orc.margem_pct != null ? `${this.num(orc.margem_pct)}%` : '—'],
      ['Produto de referencia', orc.produto_referencia ?? '—'],
      ['Requer amostra', orc.requer_amostra ? 'Sim' : 'Nao'],
    ];

    // 3 colunas de pares rotulo/valor
    const linhas: TableCell[][] = [];
    for (let i = 0; i < campos.length; i += 3) {
      const linha: TableCell[] = campos.slice(i, i + 3).map(([r, v]) => ({
        stack: [
          { text: r.toUpperCase(), style: 'rotulo' },
          { text: v, fontSize: 9, margin: [0, 1, 0, 0] },
        ],
        margin: [0, 4, 8, 4],
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
      margin: [10, 10, 10, 10],
      fillColor: destaque ? COR.goldSoft : COR.sand,
    });

    return {
      stack: [
        { text: 'Calculo', style: 'secao' },
        {
          table: {
            widths: ['*', '*', '*'],
            body: [
              [
                card('PRECO SEM IPI', this.brl(res.preco_sipi)),
                card('PRECO COM IPI', this.brl(res.preco_cipi), true),
                {
                  stack: [
                    { text: 'CONFIANCA DA COTACAO', style: 'rotulo' },
                    {
                      text: `${this.num(c.score_global)}/100`,
                      fontSize: 15,
                      bold: true,
                      margin: [0, 3, 0, 0],
                    },
                    { text: c.faixa ?? '', fontSize: 7, color: COR.warm500 },
                  ],
                  margin: [10, 10, 10, 10],
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

  private blocosCusto(mp: CalcCustoMp, mo: CalcMaoDeObra): Content {
    const linha = (r: string, v: string, destaque?: boolean): TableCell[] => [
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

    const tabelaMp: Content = {
      table: {
        widths: ['*', 'auto'],
        body: [
          [{ text: 'Custo de materia-prima', style: 'th', colSpan: 2 }, {}],
          linha('MP base/un', this.brl(mp.mp_base)),
          linha(`Desvio (${this.num(mp.desvio_pct)}%)`, this.brl(mp.desvio)),
          linha('Embalagem/un', this.brl(mp.embalagem)),
          linha('Frete/un', this.brl(mp.frete)),
          linha(
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
          [{ text: 'Mao de obra', style: 'th', colSpan: 2 }, {}],
          linha('Producao diaria', `${this.num(mo.producao_diaria)} un`),
          linha('Dias necessarios', this.num(mo.dias_necessarios)),
          linha('MO/lote', this.brl(mo.mo_lote)),
          linha('MO/un', this.brl(mo.mo_un)),
          linha(
            `Custo MO c/ imposto (${this.num(mo.imposto_mo_pct)}%)`,
            this.brl(mo.cmo_cimp),
            true,
          ),
        ],
      },
      layout: this.layoutSuave(),
    };

    return {
      columns: [tabelaMp, tabelaMo],
      columnGap: 12,
      margin: [0, 10, 0, 0],
    };
  }

  private secaoParametros(par: CalcParametros): Content {
    const item = (r: string, v: string): TableCell => ({
      stack: [
        { text: r.toUpperCase(), style: 'rotulo' },
        { text: v, fontSize: 9, margin: [0, 1, 0, 0] },
      ],
      margin: [0, 3, 8, 3],
    });
    const body: TableCell[][] = [
      [
        item('IPI', `${this.num(par.ipi_pct)}%`),
        item('Frete/un', this.brl(par.frete_un_brl)),
        item('Imposto MP', `${this.num(par.imposto_mp_pct)}%`),
        item('Imposto MO', `${this.num(par.imposto_mo_pct)}%`),
      ],
      [
        item('Desvio MP', `${this.num(par.desvio_mp_pct)}%`),
        item('Folha mensal', this.brl(par.mo_folha_mensal)),
        item('Dias uteis/mes', this.num(par.mo_dias_uteis)),
        { text: '' },
      ],
    ];
    return {
      stack: [
        { text: 'Parametros do sistema (somente leitura)', style: 'secao' },
        {
          table: { widths: ['*', '*', '*', '*'], body },
          layout: this.layoutSuave(),
        },
      ],
    };
  }

  private secaoComposicao(
    c: CalculoJson,
    ingredientes: CalcIngrediente[],
  ): Content {
    const base = c.formula_usada
      ? `Base: ${c.formula_usada.nome} ${c.formula_usada.versao ?? ''} (${c.formula_usada.origem ?? '—'}, ${c.formula_usada.status ?? '—'})`
      : 'Sem formula vinculada — estimativa.';

    const head: TableCell[] = [
      'Fase',
      'Materia-prima',
      'Codigo',
      'Conc.',
      'Preco/kg',
      'Custo/un',
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
          i.preco_kg_atual != null ? this.brl(i.preco_kg_atual) : 's/ preco',
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
        { text: 'Composicao (P&D)', style: 'secao' },
        { text: base, fontSize: 8, color: COR.warm600, margin: [0, 0, 0, 6] },
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
