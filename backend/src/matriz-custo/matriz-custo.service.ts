import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatrizHistoricoService } from './matriz-historico.service';
import { UpdateOperacionalDto } from './dto/update-operacional.dto';
import { UpdateFiscalDto } from './dto/update-fiscal.dto';
import { CreateNcmDto } from './dto/create-ncm.dto';
import { UpdateNcmDto } from './dto/update-ncm.dto';

const CAMPOS_OPERACIONAL = [
  'custo_fixo_mensal', 'mo_dias_uteis', 'horas_dia', 'eficiencia_linha',
  'desvio_mp_pct', 'frete_un_brl', 'margem_padrao_pct',
];
const CAMPOS_FISCAL = [
  'icms_regime', 'encomendante_simples', 'pis_cofins_monofasico_pct',
  'pis_cofins_servico_pct', 'fiscais_provisorios',
];
const CAMPOS_NCM = ['ncm', 'descricao', 'ipi_pct', 'monofasico', 'provisorio', 'ativo'];

// Decimal/Int do Prisma -> number (ou null).
function toNum(v: any): number | null {
  return v === null || v === undefined ? null : Number(v.toString());
}
// formatacao para o log (string ou null).
function fmt(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && typeof v.toString === 'function') return v.toString();
  return String(v);
}
// igualdade idempotente: booleano direto; numerico/decimal por valor.
function iguais(a: any, b: any): boolean {
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  return toNum(a) === toNum(b);
}

interface Mudanca { campo: string; antes: string | null; depois: string | null }

@Injectable()
export class MatrizCustoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historico: MatrizHistoricoService,
  ) {}

  // ---------------- leitura ----------------
  async get() {
    const c = await this.ensureConfig();
    return this.montarView(c);
  }

  /** Garante a linha unica id=1 (mesmo padrao do SystemConfigService). */
  private async ensureConfig() {
    const c = await this.prisma.systemConfig.findUnique({ where: { id: 1 } });
    return c ?? this.prisma.systemConfig.create({ data: { id: 1 } });
  }

  private montarView(c: any) {
    // ========================================================================
    // DIVIDA CONTROLADA (F3): custo_minuto / minutos_produtivos sao calculados
    // AQUI so para a TELA ler. Na F4, esta formula DEVE virar PONTO UNICO DE
    // VERDADE numa util compartilhada com o custo-engine — senao a tela e o
    // calculo podem DIVERGIR. Nao duplicar logica de preco aqui; apenas estes
    // derivados read-only. (marcador para nao esquecer na F4)
    // ========================================================================
    const dias = toNum(c.mo_dias_uteis);
    const horas = toNum(c.horas_dia);
    const efic = toNum(c.eficiencia_linha);
    const minutos_produtivos =
      dias && horas && efic ? dias * horas * 60 * efic : null;
    const custo_minuto =
      minutos_produtivos && minutos_produtivos > 0
        ? toNum(c.custo_fixo_mensal)! / minutos_produtivos
        : null;

    return {
      operacional: {
        custo_fixo_mensal: toNum(c.custo_fixo_mensal),
        mo_dias_uteis: c.mo_dias_uteis,
        horas_dia: toNum(c.horas_dia),
        eficiencia_linha: toNum(c.eficiencia_linha),
        desvio_mp_pct: toNum(c.desvio_mp_pct),
        frete_un_brl: toNum(c.frete_un_brl),
        margem_padrao_pct: toNum(c.margem_padrao_pct),
      },
      fiscal: {
        icms_regime: toNum(c.icms_regime),
        encomendante_simples: c.encomendante_simples,
        pis_cofins_monofasico_pct: toNum(c.pis_cofins_monofasico_pct),
        pis_cofins_servico_pct: toNum(c.pis_cofins_servico_pct),
      },
      fiscais_provisorios: c.fiscais_provisorios,
      // READ-ONLY (nunca editavel; ver divida controlada acima)
      derivados: { minutos_produtivos, custo_minuto },
    };
  }

  // ---------------- escrita: blocos de config ----------------
  async updateOperacional(dto: UpdateOperacionalDto, userId: string) {
    return this.aplicarConfig(dto, CAMPOS_OPERACIONAL, 'operacional', userId);
  }

  async updateFiscal(dto: UpdateFiscalDto, userId: string) {
    return this.aplicarConfig(dto, CAMPOS_FISCAL, 'fiscal', userId);
  }

  private async aplicarConfig(
    dto: Record<string, any>,
    campos: string[],
    bloco: string,
    userId: string,
  ) {
    const atual = await this.ensureConfig();
    const { data, mudancas } = this.montarDiff(atual, dto, campos);
    if (mudancas.length === 0) return this.montarView(atual); // idempotente

    const atualizado = await this.prisma.$transaction(async (tx) => {
      const u = await tx.systemConfig.update({ where: { id: 1 }, data });
      await this.historico.registrar(
        mudancas.map((m) => ({
          userId,
          bloco,
          entidade: 'system_config',
          entidadeId: '1',
          campo: m.campo,
          valorAntes: m.antes,
          valorDepois: m.depois,
        })),
        tx,
      );
      return u;
    });
    return this.montarView(atualizado);
  }

  /** diff idempotente: so campos enviados E diferentes do atual. */
  private montarDiff(atual: any, dto: Record<string, any>, campos: string[]) {
    const data: Record<string, any> = {};
    const mudancas: Mudanca[] = [];
    for (const campo of campos) {
      if (dto[campo] === undefined) continue; // nao enviado no PATCH
      if (iguais(atual[campo], dto[campo])) continue; // sem mudanca
      data[campo] = dto[campo];
      mudancas.push({ campo, antes: fmt(atual[campo]), depois: fmt(dto[campo]) });
    }
    return { data, mudancas };
  }

  // ---------------- NCM (CRUD) ----------------
  listNcm(incluirInativas: boolean) {
    return this.prisma.ncm.findMany({
      where: incluirInativas ? {} : { ativo: true },
      orderBy: { ncm: 'asc' },
    });
  }

  async createNcm(dto: CreateNcmDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const n = await tx.ncm.create({
        data: {
          ncm: dto.ncm,
          descricao: dto.descricao,
          ipi_pct: dto.ipi_pct,
          monofasico: dto.monofasico,
          provisorio: dto.provisorio ?? true,
          ativo: dto.ativo ?? true,
        },
      });
      await this.historico.registrar(
        [{
          userId, bloco: 'ncm', entidade: 'ncm', entidadeId: n.id, campo: 'create',
          valorAntes: null,
          valorDepois: `ncm=${n.ncm}; ipi_pct=${toNum(n.ipi_pct)}; monofasico=${n.monofasico}; provisorio=${n.provisorio}`,
        }],
        tx,
      );
      return n;
    });
  }

  async updateNcm(id: number, dto: UpdateNcmDto, userId: string) {
    const atual = await this.prisma.ncm.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('NCM nao encontrada');
    const { data, mudancas } = this.montarDiff(atual, dto, CAMPOS_NCM);
    if (mudancas.length === 0) return atual; // idempotente

    return this.prisma.$transaction(async (tx) => {
      const u = await tx.ncm.update({ where: { id }, data });
      await this.historico.registrar(
        mudancas.map((m) => ({
          userId, bloco: 'ncm', entidade: 'ncm', entidadeId: id, campo: m.campo,
          valorAntes: m.antes, valorDepois: m.depois,
        })),
        tx,
      );
      return u;
    });
  }

  /** Soft-delete: ativo=false (nunca DELETE fisico). Idempotente. */
  async removeNcm(id: number, userId: string) {
    const atual = await this.prisma.ncm.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('NCM nao encontrada');
    if (!atual.ativo) return atual; // ja inativa

    return this.prisma.$transaction(async (tx) => {
      const u = await tx.ncm.update({ where: { id }, data: { ativo: false } });
      await this.historico.registrar(
        [{
          userId, bloco: 'ncm', entidade: 'ncm', entidadeId: id, campo: 'ativo',
          valorAntes: 'true', valorDepois: 'false',
        }],
        tx,
      );
      return u;
    });
  }

  // ---------------- historico (leitura) ----------------
  async historicoLista(query: { entidade?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const where = query.entidade ? { entidade: query.entidade } : {};
    const [data, total] = await Promise.all([
      this.prisma.matrizCustoHistorico.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.matrizCustoHistorico.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}
