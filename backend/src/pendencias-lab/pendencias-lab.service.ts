import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FormulasService } from '../formulas/formulas.service';
import { CreatePendenciaDto } from './dto/create-pendencia.dto';
import { calcularPrazoLimite, estaAtrasada, type UrgenciaLab } from './dias-uteis.util';

/**
 * Jornada de Laboratório (fatia 1, corrigida) — fila PÚBLICA de pendências.
 * Criação: qualquer autenticado. Atender/Concluir: pd|admin (guard no controller).
 * Atraso é DERIVADO (nunca coluna): calculado na leitura.
 *
 * VÍNCULO ESTRUTURAL (correção A): o ATENDER cria a fórmula da pendência
 * (rascunho, nascendo com o NCM proposto — D6) e grava formula_resultado_id
 * na hora. O CONCLUIR não aceita id nenhum: só conclui a fórmula VINCULADA,
 * e só se ela estiver validada. INVARIANTE: impossível concluir com fórmula
 * que não seja a daquela pendência.
 */
@Injectable()
export class PendenciasLabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formulas: FormulasService,
  ) {}

  private readonly include = {
    ncm_proposto: { select: { id: true, ncm: true, ex_tipi: true, descricao: true } },
    orcamento: { select: { id: true, numero: true, produto: true, status: true } },
    formula_base: { select: { id: true, nome_produto: true, versao_codigo: true } },
    formula_resultado: { select: { id: true, nome_produto: true, versao_codigo: true, status: true } },
  } as const;

  async criar(dto: CreatePendenciaDto, userId: string) {
    // D6: reforço no serviço (o DTO já valida condicionalmente).
    if (dto.tipo === 'formulacao_nova' && dto.ncm_proposto_id == null) {
      throw new BadRequestException('ncm_proposto_id e obrigatorio para formulacao_nova (D6).');
    }
    if (dto.ncm_proposto_id != null) {
      const ncm = await this.prisma.ncm.findFirst({
        where: { id: dto.ncm_proposto_id, ativo: true },
        select: { id: true },
      });
      if (!ncm) throw new BadRequestException('NCM proposto inexistente ou inativo.');
    }
    const prazo = calcularPrazoLimite(dto.urgencia as UrgenciaLab, new Date());
    const p = await this.prisma.pendenciaLab.create({
      data: {
        tipo: dto.tipo,
        urgencia: dto.urgencia,
        prazo_limite: prazo,
        descricao: dto.descricao,
        ncm_proposto_id: dto.ncm_proposto_id ?? null,
        orcamento_id: dto.orcamento_id ?? null,
        formula_base_id: dto.formula_base_id ?? null,
        motivo_origem: dto.motivo_origem ?? null,
        solicitada_por: userId,
      },
      include: this.include,
    });
    return this.comAtraso(p);
  }

  /**
   * Fila pública. `status` opcional:
   *  - ausente  -> "na fila" (aberta + em_atendimento)
   *  - 'todas'  -> SEM filtro (superconjunto real: abertas, em atendimento,
   *                concluídas e canceladas) — antes caía no default da fila.
   *  - outro    -> aquele status exato.
   */
  async listar(status?: string) {
    const where =
      status === 'todas'
        ? {}
        : status
          ? { status }
          : { status: { in: ['aberta', 'em_atendimento'] } };
    const rows = await this.prisma.pendenciaLab.findMany({
      where,
      include: this.include,
      orderBy: [{ status: 'asc' }, { prazo_limite: 'asc' }],
    });
    return rows.map((p) => this.comAtraso(p));
  }

  /** Badge do menu: contagem de pendências abertas + em atendimento. */
  async contarAbertas() {
    const total = await this.prisma.pendenciaLab.count({
      where: { status: { in: ['aberta', 'em_atendimento'] } },
    });
    return { total };
  }

  /**
   * ATENDER = assumir E criar a fórmula da pendência, já vinculada:
   *  - formulacao_nova SEM base: fórmula raiz nova, rascunho, composição vazia
   *    (o lab preenche no editor), nascendo com o NCM proposto (D6).
   *  - formulacao_nova COM base / revisao: nova-versao da base (composição
   *    copiada, NCM herdado — fix D6); se houver NCM proposto, ele PREVALECE.
   */
  async atender(id: number, userId: string) {
    const p = await this.buscar(id);
    if (p.status !== 'aberta') {
      throw new BadRequestException(`Pendencia nao esta aberta (status atual: ${p.status}).`);
    }

    let formulaId: number;
    if (p.formula_base_id) {
      const nova = await this.formulas.novaVersao(
        p.formula_base_id,
        { versao_descricao: `Pendência lab #${p.id}: ${p.descricao.slice(0, 120)}` },
        userId,
      );
      formulaId = nova.id;
      // NCM proposto na solicitação prevalece sobre o herdado da base (D6).
      if (p.ncm_proposto_id != null && nova.ncm_id !== p.ncm_proposto_id) {
        await this.prisma.formula.update({
          where: { id: nova.id },
          data: { ncm_id: p.ncm_proposto_id, ncm_revisado: false },
        });
      }
    } else {
      // fórmula do zero: nome vem do orçamento de origem (se houver) ou da descrição.
      const orc = p.orcamento_id
        ? await this.prisma.orcamento.findUnique({
            where: { id: p.orcamento_id },
            select: { produto: true },
          })
        : null;
      // nome = produto do orçamento OU a PRIMEIRA LINHA da descrição (a descrição
      // inteira com \n virava nome-lixo — caso "Onça Pintada" do smoke do Gabriel).
      const nome = (orc?.produto ?? p.descricao.split('\n')[0]).slice(0, 80).trim();
      const criada = await this.prisma.formula.create({
        data: {
          nome_produto: nome,
          ncm_id: p.ncm_proposto_id, // D6: nasce com o NCM proposto (obrigatório no DTO)
          ncm_revisado: false,
          status: 'rascunho',
          origem: 'pd_lab',
          versao_codigo: '1.0',
          versao_descricao: `Pendência lab #${p.id}: ${p.descricao.slice(0, 120)}`,
          created_by: userId,
          total_ingredientes: 0,
        },
        select: { id: true },
      });
      formulaId = criada.id;
    }

    const upd = await this.prisma.pendenciaLab.update({
      where: { id },
      data: {
        status: 'em_atendimento',
        atendida_em: new Date(),
        atendida_por: userId,
        formula_resultado_id: formulaId, // VÍNCULO nasce AQUI (correção A)
      },
      include: this.include,
    });
    return this.comAtraso(upd);
  }

  /**
   * CONCLUIR não recebe fórmula nenhuma (correção A): conclui a VINCULADA
   * (setada no atender/re-link), exigindo que esteja validada (D3).
   */
  async concluir(id: number, userId: string) {
    const p = await this.buscar(id);
    if (p.status === 'concluida' || p.status === 'cancelada') {
      throw new BadRequestException(`Pendencia ja finalizada (status: ${p.status}).`);
    }
    if (p.status !== 'em_atendimento' || p.formula_resultado_id == null) {
      throw new BadRequestException(
        'Pendencia ainda nao foi atendida — atenda primeiro (a formula da pendencia nasce no atender).',
      );
    }
    const formula = await this.prisma.formula.findUnique({
      where: { id: p.formula_resultado_id },
      select: { id: true, status: true },
    });
    if (!formula) throw new BadRequestException('Formula vinculada nao encontrada.');
    if (formula.status !== 'validada') {
      throw new BadRequestException(
        'Valide a formula DESTA pendencia antes de concluir (ela esta em rascunho).',
      );
    }
    const upd = await this.prisma.pendenciaLab.update({
      where: { id },
      data: { status: 'concluida', concluida_em: new Date(), concluida_por: userId },
      include: this.include,
    });
    return this.comAtraso(upd);
  }

  private async buscar(id: number) {
    const p = await this.prisma.pendenciaLab.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Pendencia nao encontrada');
    return p;
  }

  private comAtraso<T extends { prazo_limite: Date; status: string }>(p: T) {
    return { ...p, atrasada: estaAtrasada(p.prazo_limite, p.status, new Date()) };
  }
}
