import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';

@Injectable()
export class SystemConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Garante e retorna a linha unica (id=1). */
  async get() {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { id: 1 } });
    if (cfg) return cfg;
    return this.prisma.systemConfig.create({ data: { id: 1 } });
  }

  async update(dto: UpdateSystemConfigDto, userId: string) {
    await this.get(); // garante existencia
    const atualizado = await this.prisma.systemConfig.update({
      where: { id: 1 },
      data: dto,
    });
    await this.audit.registrar({
      userId,
      acao: 'atualizar_system_config',
      entidade: 'system_config',
      entidadeId: 1,
      detalhes: { ...dto },
    });
    return atualizado;
  }
}
