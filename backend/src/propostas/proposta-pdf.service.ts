import { Injectable } from '@nestjs/common';
// pdfmake 0.3 — mesmo uso do PDF interno (orcamentos/pdf.service.ts): instancia
// unica, Roboto do pacote, sem rede.
import pdfmake from 'pdfmake';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { CondicoesProposta } from './proposta-condicoes';
import type { SnapshotItemProposta } from './propostas.service';

/**
 * PDF da PROPOSTA COMERCIAL (vai para o CLIENTE). Padroniza o modelo do Canva:
 * mesma ordem (apresentacao, orcamento, condicoes, consideracoes finais), roxo
 * da marca, sem custo/margem/formula — so preco final por produto. Termina com
 * o aceite assinado pelo cliente (libera a amostragem).
 */
export interface PropostaPdf {
  numero: number;
  status: string;
  emitida_em: Date | string;
  vendedor_nome: string | null;
  observacoes: string | null;
  condicoes: CondicoesProposta;
  assinada_em: Date | string | null;
  assinada_por_nome: string | null;
  assinada_por_documento: string | null;
  cliente: { nome: string; cnpj: string | null; email: string | null; telefone: string | null };
  itens: { ordem: number; snapshot: SnapshotItemProposta }[];
}

const COR = {
  roxo: '#6B3FA0',
  roxoClaro: '#EFE8F7',
  roxoLinha: '#B9A2D6',
  tinta: '#2A2233',
  cinza: '#6F6878',
  linha: '#E4DEEA',
};

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

@Injectable()
export class PropostaPdfService {
  constructor() {
    pdfmake.setUrlAccessPolicy(() => false);
    pdfmake.setLocalAccessPolicy(() => true);
    pdfmake.setFonts({
      Roboto: {
        normal: require.resolve('pdfmake/fonts/Roboto/Roboto-Regular.ttf'),
        bold: require.resolve('pdfmake/fonts/Roboto/Roboto-Medium.ttf'),
        italics: require.resolve('pdfmake/fonts/Roboto/Roboto-Italic.ttf'),
        bolditalics: require.resolve('pdfmake/fonts/Roboto/Roboto-MediumItalic.ttf'),
      },
    });
  }

  async gerar(p: PropostaPdf): Promise<Buffer> {
    return pdfmake.createPdf(this.montar(p)).getBuffer();
  }

  // ---------------- formatacao ----------------
  private brl(n: number | null | undefined): string {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private pct(n: number | null | undefined): string {
    if (n == null) return '—';
    return `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  }

  private int(n: number | null | undefined): string {
    return n == null ? '—' : Number(n).toLocaleString('pt-BR');
  }

  /** Data civil de Sao Paulo por extenso: "25 de outubro de 2026". */
  private dataExtenso(d: Date | string): string {
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'numeric', year: 'numeric',
    }).formatToParts(new Date(d));
    const v = (t: string) => Number(partes.find((x) => x.type === t)?.value);
    return `${v('day')} de ${MESES[v('month') - 1]} de ${v('year')}`;
  }

  private dataCurta(d: Date | string): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(d));
  }

  // ---------------- blocos ----------------
  private marca(): { stack: Content[] } {
    return {
      stack: [
        { text: 'PRIVATE', fontSize: 26, bold: true, characterSpacing: 4, color: COR.tinta },
        { text: 'COSMÉTICOS', fontSize: 8, characterSpacing: 6.5, color: COR.tinta, margin: [1, -2, 0, 0] },
      ],
    };
  }

  private titulo(texto: string): Content {
    return {
      margin: [0, 14, 0, 6],
      stack: [
        { text: texto.toUpperCase(), fontSize: 11.5, bold: true, color: COR.roxo, characterSpacing: 0.6 },
        { canvas: [{ type: 'line', x1: 0, y1: 3, x2: 515, y2: 3, lineWidth: 1, lineColor: COR.roxoLinha }] },
      ],
    };
  }

  private paragrafo(texto: string): Content {
    return { text: texto, margin: [0, 0, 0, 4], alignment: 'justify' };
  }

  private lista(itens: string[]): Content {
    return { ul: itens.map((t) => ({ text: t, margin: [0, 0, 0, 3], alignment: 'justify' })), markerColor: COR.roxo };
  }

  private cabecalho(p: PropostaPdf): Content {
    const validade = new Date(new Date(p.emitida_em).getTime() + p.condicoes.validade_dias * 86_400_000);
    const linha = (rotulo: string, valor: string): Content => ({
      columns: [
        { text: rotulo, width: 74, color: COR.cinza, fontSize: 8 },
        { text: valor, width: '*', bold: true },
      ],
      margin: [0, 0, 0, 2],
    });
    return {
      stack: [
        {
          columns: [
            { width: 210, ...this.marca() } as Content,
            {
              width: '*',
              stack: [
                { text: 'PROPOSTA COMERCIAL', fontSize: 18, bold: true, color: COR.roxo, alignment: 'right' },
                { text: `Nº ${p.numero}`, fontSize: 12, color: COR.tinta, alignment: 'right', margin: [0, 2, 0, 0] },
              ],
            },
          ],
        },
        {
          margin: [0, 14, 0, 0],
          table: {
            widths: ['*'],
            body: [
              [
                {
                  fillColor: COR.roxoClaro,
                  margin: [10, 8, 10, 6],
                  stack: [
                    linha('Cliente', p.cliente.nome),
                    ...(p.cliente.cnpj ? [linha('CNPJ', p.cliente.cnpj)] : []),
                    linha('Emissão', this.dataCurta(p.emitida_em)),
                    linha('Validade', `${p.condicoes.validade_dias} dias (até ${this.dataCurta(validade)})`),
                    ...(p.vendedor_nome ? [linha('Consultor', p.vendedor_nome)] : []),
                  ],
                },
              ],
            ],
          },
          layout: 'noBorders',
        },
      ],
    };
  }

  private apresentacao(): Content[] {
    return [
      this.titulo('Quem somos'),
      this.paragrafo(
        'A Private Cosméticos é uma indústria especializada em terceirização de cosméticos Full Service, localizada em Valinhos-SP. Atendemos empresas e empreendedores do Brasil e do mundo que desejam criar uma marca própria com qualidade premium, segurança regulatória e suporte completo, com estrutura moderna, equipe qualificada e certificações nacionais e internacionais.',
      ),
      this.titulo('Atendimento Full Service'),
      this.paragrafo(
        'Desenvolvemos o seu projeto do zero ou fabricamos os seus produtos já prontos para produção: fórmulas exclusivas, pesquisa e inovação de ativos, registro e regularização (ANVISA e internacional), criação e produção de embalagens, design e identidade visual, rotulagem e impressão, envase e entrega final.',
      ),
      {
        text: 'ANVISA · HALAL · CPNP · ABIHPEC · Cruelty-Free · Vegan',
        fontSize: 8,
        color: COR.cinza,
        characterSpacing: 0.4,
        margin: [0, 2, 0, 0],
      },
    ];
  }

  private tabelaItens(p: PropostaPdf): Content {
    const th = (t: string, alignment: 'left' | 'right' = 'right'): TableCell => ({
      text: t, bold: true, fontSize: 7.5, color: '#FFFFFF', fillColor: COR.roxo, alignment, margin: [0, 3, 0, 3],
    });
    const corpo: TableCell[][] = [
      [
        th('Produto', 'left'),
        th('Lote (un)'),
        th('Sem embalagem'),
        th('Com embalagem'),
        th('IPI'),
        th('Preço final c/ IPI'),
      ],
    ];
    for (const { snapshot: s } of p.itens) {
      const volume = s.volume_un != null ? ` · ${s.volume_un.toLocaleString('pt-BR')} mL/g` : '';
      corpo.push([
        {
          stack: [
            { text: `${s.produto}${volume}`, bold: true },
            { text: s.fornecimento + (s.embalagem ? ` · embalagem: ${s.embalagem}` : ''), fontSize: 7, color: COR.cinza },
          ],
          margin: [0, 2, 0, 2],
        },
        { text: this.int(s.quantidade), alignment: 'right', margin: [0, 2, 0, 0] },
        {
          text: this.brl(s.com_embalagem ? s.preco_sem_embalagem_sipi : s.preco_sipi),
          alignment: 'right',
          margin: [0, 2, 0, 0],
        },
        { text: s.com_embalagem ? this.brl(s.preco_sipi) : '—', alignment: 'right', margin: [0, 2, 0, 0] },
        { text: this.pct(s.ipi_pct), alignment: 'right', margin: [0, 2, 0, 0] },
        { text: this.brl(s.preco_cipi), alignment: 'right', bold: true, color: COR.roxo, margin: [0, 2, 0, 0] },
      ]);
    }
    return {
      stack: [
        {
          table: { headerRows: 1, widths: ['*', 46, 64, 64, 34, 70], body: corpo },
          layout: {
            hLineWidth: (i: number) => (i === 0 ? 0 : 0.6),
            vLineWidth: () => 0,
            hLineColor: () => COR.linha,
            paddingLeft: () => 5,
            paddingRight: () => 5,
          },
        },
        {
          text:
            'Valores unitários em reais. "Sem embalagem" e "Com embalagem" sem IPI; o IPI é destacado na nota fiscal conforme o NCM do produto. "Preço final c/ IPI" considera a configuração orçada (com embalagem quando houver).',
          fontSize: 7,
          color: COR.cinza,
          margin: [0, 4, 0, 0],
        },
      ],
    };
  }

  private aceite(p: PropostaPdf): Content {
    const assinada = p.status === 'assinada';
    const campo = (rotulo: string, valor = ''): Content => ({
      margin: [0, 8, 0, 0],
      stack: [
        { text: valor || ' ', fontSize: 9, margin: [0, 0, 0, 1] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 235, y2: 0, lineWidth: 0.6, lineColor: COR.cinza }] },
        { text: rotulo, fontSize: 7, color: COR.cinza, margin: [0, 2, 0, 0] },
      ],
    });
    return {
      unbreakable: true,
      stack: [
        this.titulo('Aceite da proposta'),
        this.paragrafo(
          `Declaro que li e aceito as condições desta Proposta Comercial Nº ${p.numero}, inclusive a ciência de que poderá haver encargos na elaboração das amostras, tratados em documento à parte. A amostragem e a programação começam após esta assinatura.`,
        ),
        {
          columns: [
            {
              width: '*',
              stack: [
                { text: 'PELO CLIENTE', bold: true, fontSize: 8, color: COR.roxo, margin: [0, 6, 0, 0] },
                campo('Assinatura'),
                campo('Nome', assinada ? (p.assinada_por_nome ?? '') : ''),
                campo('CPF / cargo', assinada ? (p.assinada_por_documento ?? '') : ''),
                campo('Data', assinada && p.assinada_em ? this.dataCurta(p.assinada_em) : ''),
              ],
            },
            { width: 30, text: '' },
            {
              width: '*',
              stack: [
                { text: 'PRIVATE COSMÉTICOS', bold: true, fontSize: 8, color: COR.roxo, margin: [0, 6, 0, 0] },
                campo('Assinatura'),
                campo('Consultor', p.vendedor_nome ?? ''),
                campo('Local e data', `${p.condicoes.local}, ${this.dataExtenso(p.emitida_em)}`),
              ],
            },
          ],
        },
      ],
    };
  }

  private montar(p: PropostaPdf): TDocumentDefinitions {
    const c = p.condicoes;
    const content: Content[] = [
      this.cabecalho(p),
      ...this.apresentacao(),
      this.titulo('Orçamento'),
      this.tabelaItens(p),
      this.titulo('Pedido mínimo'),
      this.paragrafo(c.pedido_minimo),
      this.titulo('Prazo de entrega'),
      this.paragrafo(c.prazo_entrega),
      this.titulo('Forma de pagamento'),
      this.paragrafo(c.forma_pagamento),
      this.titulo(`Validade da proposta: ${c.validade_dias} dias · Frete: ${c.frete}`),
      this.lista(c.reajustes),
      this.titulo('Amostras'),
      {
        table: {
          widths: ['*'],
          body: [[{ text: c.amostras, fillColor: COR.roxoClaro, margin: [8, 6, 8, 6], alignment: 'justify' }]],
        },
        layout: 'noBorders',
      },
      this.titulo('Considerações finais'),
      this.lista(c.consideracoes),
      ...(p.observacoes ? [this.titulo('Observações'), this.paragrafo(p.observacoes)] : []),
      this.aceite(p),
      {
        margin: [0, 18, 0, 0],
        alignment: 'center',
        fontSize: 8,
        color: COR.cinza,
        stack: [
          { text: 'www.privatecosmeticos.com.br', bold: true, color: COR.tinta },
          '+55 19 99678-8518 (WhatsApp) · +55 19 3849-2445 · Valinhos, São Paulo, Brasil',
        ],
      },
    ];
    return {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 48],
      defaultStyle: { font: 'Roboto', fontSize: 9, color: COR.tinta, lineHeight: 1.2 },
      info: { title: `Proposta Comercial ${p.numero} — ${p.cliente.nome}`, author: 'Private Cosméticos' },
      content,
      footer: (pagina: number, total: number): Content => ({
        margin: [40, 14, 40, 0],
        columns: [
          { text: `Proposta Comercial Nº ${p.numero} · ${p.cliente.nome}`, fontSize: 7, color: COR.cinza },
          { text: `${pagina}/${total}`, alignment: 'right', fontSize: 7, color: COR.cinza },
        ],
      }),
    };
  }
}
