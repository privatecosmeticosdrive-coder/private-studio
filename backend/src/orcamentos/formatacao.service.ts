import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * FASE 2 — formatacao das 4 paginas a partir do JSON_CALC travado (Fase 1).
 * Paginas: 1 Comercial · 2 Industrial · 3 Formula P&D · 4 Cotacoes.
 *
 * MOCK (sem ANTHROPIC_API_KEY): monta texto coerente a partir do calculo.
 * REAL (com key): 4 chamadas PARALELAS a Anthropic; cada pagina cai em MOCK
 * isoladamente se a chamada falhar.
 */
@Injectable()
export class FormatacaoService {
  private readonly logger = new Logger(FormatacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private temApiKey(): boolean {
    const k = this.config.get<string>('ANTHROPIC_API_KEY');
    return !!k && k.trim().length > 0;
  }

  async formatar(orcamentoId: string) {
    const orc = await this.prisma.orcamento.findUnique({
      where: { id: orcamentoId },
      include: { cliente: { select: { nome: true } } },
    });
    if (!orc) throw new NotFoundException('Orcamento nao encontrado');
    if (!orc.calculo) {
      throw new BadRequestException('Rode a Fase 1 (POST /:id/calcular) antes de formatar.');
    }
    const calc: any = orc.calculo;
    const ctx = {
      numero: orc.numero,
      produto: orc.produto,
      cliente: orc.cliente?.nome ?? 'Cliente nao informado',
      nivel: orc.nivel,
      quantidade: orc.quantidade,
      volume_un: orc.volume_un ? Number(orc.volume_un) : null,
      calc,
    };

    const paginas = ['comercial', 'industrial', 'formula', 'cotacoes'] as const;
    let modo: 'mock' | 'real' = this.temApiKey() ? 'real' : 'mock';

    let conteudos: string[];
    if (modo === 'real') {
      const resultados = await Promise.all(
        paginas.map((p) => this.gerarPaginaReal(p, ctx).catch((e) => {
          this.logger.warn(`Pagina ${p} caiu em mock: ${(e as Error).message}`);
          return null;
        })),
      );
      // se TODAS falharam, marca modo mock; paginas que falharam usam mock
      if (resultados.every((r) => r === null)) modo = 'mock';
      conteudos = resultados.map((r, i) => r ?? this.gerarPaginaMock(paginas[i], ctx));
    } else {
      conteudos = paginas.map((p) => this.gerarPaginaMock(p, ctx));
    }

    const atualizado = await this.prisma.orcamento.update({
      where: { id: orcamentoId },
      data: {
        conteudo_pag1: conteudos[0],
        conteudo_pag2: conteudos[1],
        conteudo_pag3: conteudos[2],
        conteudo_pag4: conteudos[3],
      },
      select: {
        id: true,
        numero: true,
        conteudo_pag1: true,
        conteudo_pag2: true,
        conteudo_pag3: true,
        conteudo_pag4: true,
      },
    });
    return { ...atualizado, _mode: modo };
  }

  // ---------------- MOCK: monta texto a partir do calculo ----------------
  private gerarPaginaMock(pagina: string, ctx: any): string {
    const c = ctx.calc;
    const brl = (n: number) => `R$ ${Number(n).toFixed(2)}`;
    const aviso = '\n\n_[Conteudo gerado em modo MOCK — sem IA. Coerente com o calculo.]_';

    if (pagina === 'comercial') {
      return [
        `# Proposta Comercial — Orcamento #${ctx.numero}`,
        `**Cliente:** ${ctx.cliente}`,
        `**Produto:** ${ctx.produto}${ctx.nivel ? ` (nivel ${ctx.nivel})` : ''}`,
        ctx.quantidade ? `**Quantidade:** ${ctx.quantidade} un` : '',
        ctx.volume_un ? `**Volume:** ${ctx.volume_un} mL/un` : '',
        '',
        `## Preco`,
        `- **Preco por unidade (com IPI):** ${brl(c.resultado.preco_cipi)}`,
        `- Preco sem IPI: ${brl(c.resultado.preco_sipi)}`,
        `- Margem aplicada: ${c.resultado.margem_pct}%`,
        '',
        `**Indice de confianca da cotacao:** ${c.score_global}/100 (${c.faixa}).`,
        aviso,
      ].filter(Boolean).join('\n');
    }
    if (pagina === 'industrial') {
      const mo = c.mao_de_obra, mp = c.custo_mp;
      return [
        `# Ficha Industrial — Orcamento #${ctx.numero}`,
        `## Custo de Materia-Prima (por unidade)`,
        `- MP base: ${brl(mp.mp_base)} · Fragrancia: ${brl(mp.mp_frag)}`,
        `- Desvio (${mp.desvio_pct}%): ${brl(mp.desvio)} · Embalagem: ${brl(mp.embalagem)} · Frete: ${brl(mp.frete)}`,
        `- CMP simples: ${brl(mp.cmp_simp)} → com imposto MP (${mp.imposto_mp_pct}%): **${brl(mp.cmp_cimp)}**`,
        '',
        `## Mao de Obra`,
        `- Etapas: ${mo.etapas} → ${mo.un_dia} un/dia · Dias necessarios: ${mo.dias_necessarios}`,
        `- MO/lote: ${brl(mo.mo_lote)} · MO/un: ${brl(mo.mo_un)} → com imposto MO (${mo.imposto_mo_pct}%): **${brl(mo.cmo_cimp)}**`,
        '',
        `## Totais`,
        `- Custo total/un: **${brl(c.resultado.custo_total)}**`,
        `- IPI (${c.resultado.ipi_pct}%): ${brl(c.resultado.ipi_un)}`,
        `- **Preco final CIPI: ${brl(c.resultado.preco_cipi)}**`,
        aviso,
      ].join('\n');
    }
    if (pagina === 'formula') {
      const ing = (c.ingredientes ?? []) as any[];
      const linhas = ing.length
        ? ing.map((i) => `| ${i.fase ?? '-'} | ${i.nome} | ${i.concentracao_pct}% | ${i.preco_kg_atual != null ? brl(i.preco_kg_atual) + '/kg' : 's/ preco'} |`).join('\n')
        : '| - | (sem formula vinculada) | - | - |';
      return [
        `# Formula (P&D) — Orcamento #${ctx.numero}`,
        c.formula_usada ? `**Base:** ${c.formula_usada.nome} ${c.formula_usada.versao ?? ''} (${c.formula_usada.origem}, ${c.formula_usada.status})` : '**Sem formula vinculada** — estimativa.',
        '',
        `| Fase | Materia-prima | Concentracao | Preco atual |`,
        `|------|---------------|--------------|-------------|`,
        linhas,
        aviso,
      ].join('\n');
    }
    // cotacoes
    const ing = (c.ingredientes ?? []) as any[];
    const linhas = ing.length
      ? ing.map((i) => `| ${i.nome} | ${i.mp_codigo ?? '-'} | ${i.preco_kg_atual != null ? brl(i.preco_kg_atual) + '/kg' : 's/ preco'} | ${i.score}/100 |`).join('\n')
      : '| (sem ingredientes) | - | - | - |';
    return [
      `# Cotacoes / Assertividade — Orcamento #${ctx.numero}`,
      `Score global da cotacao: **${c.score_global}/100** (${c.faixa}).`,
      '',
      `| Materia-prima | Codigo | Preco atual | Score |`,
      `|---------------|--------|-------------|-------|`,
      linhas,
      aviso,
    ].join('\n');
  }

  // ---------------- REAL: 1 chamada Anthropic por pagina ----------------
  private async gerarPaginaReal(pagina: string, ctx: any): Promise<string> {
    const model = this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6';
    const key = this.config.get<string>('ANTHROPIC_API_KEY')!;
    const titulos: Record<string, string> = {
      comercial: 'Pagina COMERCIAL (proposta ao cliente: produto, preco final CIPI, margem, confianca)',
      industrial: 'Pagina INDUSTRIAL (custos: MP, MO, impostos, total, IPI)',
      formula: 'Pagina FORMULA P&D (tabela de ingredientes com fases e concentracoes)',
      cotacoes: 'Pagina COTACOES (precos das MPs e score de assertividade)',
    };
    const prompt = [
      'Voce formata propostas da Private Cosmeticos. Gere SOMENTE o conteudo em',
      `Markdown da seguinte pagina, sem inventar numeros (use os do JSON): ${titulos[pagina]}.`,
      'Seja conciso e profissional. NAO repita dados de outras paginas.',
      '',
      `Contexto: Orcamento #${ctx.numero} | Produto: ${ctx.produto} | Cliente: ${ctx.cliente}`,
      `JSON_CALC (numeros travados — nao altere):`,
      JSON.stringify(ctx.calc),
    ].join('\n');

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}`);
    const data: any = await resp.json();
    const texto: string = data?.content?.[0]?.text ?? '';
    if (!texto.trim()) throw new Error('resposta vazia');
    return texto;
  }
}
