import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MatchFormulasDto } from './dto/match-formulas.dto';

interface MatchRow {
  id: number;
  nome_produto: string;
  categoria: string | null;
  status: string;
  versao_codigo: string | null;
  custo_mp_kg: Prisma.Decimal | null;
  validada_em: Date | null;
  formula_mae_id: number | null;
  rank: number;
  n_orcamentos: number;
}

export interface Candidata {
  formula_id: number;
  nome_produto: string;
  categoria: string | null;
  status: string;
  versao_codigo: string | null;
  custo_mp_kg: number | null;
  n_orcamentos: number;
  rank_textual: number;
  validada_recente: boolean;
  score: number; // composite 0-100
  justificativa_ia?: string; // preenchido no refinar-ia
}

const RECENTE_MS = 180 * 24 * 60 * 60 * 1000; // 6 meses

@Injectable()
export class MatchFormulasService {
  private readonly logger = new Logger(MatchFormulasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private temApiKey(): boolean {
    const k = this.config.get<string>('ANTHROPIC_API_KEY');
    return !!k && k.trim().length > 0;
  }

  /**
   * Match HIBRIDO (Doc 2d §C2) — custo zero. Filtros SQL + ts_rank (indice GIN
   * idx_formulas_busca) + boost por uso/recencia. Persiste o match e devolve o id.
   */
  async match(dto: MatchFormulasDto) {
    const queryText = [dto.nome_projeto, dto.briefing_tecnico, dto.categoria]
      .filter(Boolean)
      .join(' ')
      .trim();
    const categoria = dto.categoria ?? null;
    const budgetLimite = dto.budget_mp != null ? dto.budget_mp * 20 : null;

    // A expressao do to_tsvector e IDENTICA a do indice idx_formulas_busca.
    const rows = await this.prisma.$queryRaw<MatchRow[]>(Prisma.sql`
      SELECT f.id, f.nome_produto, f.categoria, f.status, f.versao_codigo,
             f.custo_mp_kg, f.validada_em, f.formula_mae_id,
             ts_rank(
               to_tsvector('portuguese',
                 coalesce(f.nome_produto,'') || ' ' || coalesce(f.categoria,'') || ' ' || coalesce(f.observacoes,'')),
               plainto_tsquery('portuguese', ${queryText})
             ) AS rank,
             (SELECT count(*)::int FROM orcamentos o WHERE o.formula_id = f.id) AS n_orcamentos
      FROM formulas f
      WHERE f.status IN ('validada','rascunho')
        AND (${categoria}::text IS NULL OR f.categoria = ${categoria})
        AND (${budgetLimite}::numeric IS NULL OR f.custo_mp_kg IS NULL OR f.custo_mp_kg <= ${budgetLimite})
      ORDER BY rank DESC, n_orcamentos DESC
      LIMIT 20
    `);

    const agora = Date.now();
    const todas: Candidata[] = rows.map((r) => {
      const rank = Number(r.rank) || 0;
      const recente = r.validada_em != null && agora - new Date(r.validada_em).getTime() <= RECENTE_MS;
      // Boost (Doc 2d §C2): base textual + N% por uso (cap 20) + 10% se recente.
      const base = Math.min(100, rank * 100);
      const boostUso = Math.min(20, r.n_orcamentos);
      const boostRecente = recente ? 10 : 0;
      const score = Math.round(Math.min(100, base + boostUso + boostRecente));
      return {
        formula_id: r.id,
        nome_produto: r.nome_produto,
        categoria: r.categoria,
        status: r.status,
        versao_codigo: r.versao_codigo,
        custo_mp_kg: r.custo_mp_kg != null ? Number(r.custo_mp_kg) : null,
        n_orcamentos: r.n_orcamentos,
        rank_textual: Number(rank.toFixed(4)),
        validada_recente: recente,
        score,
      };
    });

    // CORTE DE RELEVÂNCIA (decisão do Gabriel): match REAL exige rank_textual > 0.
    // Sem o corte, o ORDER BY devolvia as 20 mais usadas (rank=0) como se fossem
    // resultado — a "sequência-padrão" que quebrava a credibilidade da busca.
    const candidatas = todas
      .filter((c) => c.rank_textual > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Fallback HONESTO: só quando não há match real, as mais usadas viajam num
    // campo SEPARADO — o front as rotula "Sugestões por uso", nunca como match.
    const sugestoes_por_uso =
      candidatas.length > 0
        ? []
        : todas
            .filter((c) => c.rank_textual <= 0)
            .sort((a, b) => b.n_orcamentos - a.n_orcamentos)
            .slice(0, 5);

    const query_hash = createHash('sha1')
      .update(JSON.stringify({ q: queryText, categoria, nivel: dto.nivel ?? null, budgetLimite }))
      .digest('hex');

    const registro = await this.prisma.formulaMatch.create({
      data: {
        query_hash,
        modo: 'hibrido',
        candidatas: {
          briefing: dto,
          lista: candidatas,
          sugestoes_por_uso,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return { match_id: registro.id, modo: 'hibrido', custo: 0, candidatas, sugestoes_por_uso };
  }

  /**
   * Refinar com IA (Doc 2d §C3) — opcional, ~R$0,15. Reranqueia o top da busca
   * anterior usando APENAS metadados (sem composicao). MOCK quando sem API key.
   */
  async refinarIa(matchId: number) {
    const anterior = await this.prisma.formulaMatch.findUnique({ where: { id: matchId } });
    if (!anterior) throw new NotFoundException('Match nao encontrado');

    const payload = anterior.candidatas as unknown as { briefing: MatchFormulasDto; lista: Candidata[] };
    const briefing = payload?.briefing ?? {};
    const lista = payload?.lista ?? [];

    const top5 = this.temApiKey()
      ? await this.rerankComIA(briefing, lista)
      : this.rerankMock(lista);

    const registro = await this.prisma.formulaMatch.create({
      data: {
        orcamento_id: anterior.orcamento_id,
        query_hash: anterior.query_hash,
        modo: 'ia_refinado',
        candidatas: { briefing, lista: top5 } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      match_id: registro.id,
      modo: 'ia_refinado',
      custo_estimado_brl: top5.some((c) => c.justificativa_ia?.startsWith('[mock]')) ? 0 : 0.15,
      top_5_reranqueado: top5,
    };
  }

  private rerankMock(lista: Candidata[]): Candidata[] {
    return lista.slice(0, 5).map((c) => ({
      ...c,
      justificativa_ia: `[mock] Boa aderencia a categoria "${c.categoria ?? '-'}"; ${c.n_orcamentos} uso(s) previo(s) e custo MP R$${c.custo_mp_kg ?? '-'}/kg.`,
    }));
  }

  private async rerankComIA(briefing: MatchFormulasDto, lista: Candidata[]): Promise<Candidata[]> {
    const model = this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6';
    const key = this.config.get<string>('ANTHROPIC_API_KEY')!;
    const metadados = lista.slice(0, 20).map((c) => ({
      formula_id: c.formula_id,
      nome: c.nome_produto,
      categoria: c.categoria,
      custo_mp_kg: c.custo_mp_kg,
      n_orcamentos: c.n_orcamentos,
    }));

    const prompt = [
      'Voce e um formulador da Private Cosmeticos. Reranqueie as fórmulas candidatas',
      'para o briefing abaixo e escolha as 5 melhores. Responda SOMENTE com JSON valido:',
      '{"top_5":[{"formula_id":<int>,"justificativa":"<curto>"}]}',
      '',
      `Briefing: ${JSON.stringify(briefing)}`,
      `Candidatas (metadados): ${JSON.stringify(metadados)}`,
    ].join('\n');

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}`);
      const data: any = await resp.json();
      const texto: string = data?.content?.[0]?.text ?? '';
      const json = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
      const ordem: { formula_id: number; justificativa: string }[] = json.top_5 ?? [];
      const byId = new Map(lista.map((c) => [c.formula_id, c]));
      const reranqueado: Candidata[] = [];
      for (const o of ordem) {
        const c = byId.get(o.formula_id);
        if (c) reranqueado.push({ ...c, justificativa_ia: o.justificativa });
      }
      return reranqueado.length ? reranqueado : this.rerankMock(lista);
    } catch (e) {
      this.logger.warn(`Falha no refinar-ia, usando mock: ${(e as Error).message}`);
      return this.rerankMock(lista);
    }
  }
}
