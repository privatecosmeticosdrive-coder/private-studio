import { Module } from '@nestjs/common';
import { ViabilidadeController } from './viabilidade.controller';
import { ViabilidadeService } from './viabilidade.service';

// PrismaService (PrismaModule @Global) e AuditService (AuditModule @Global)
// chegam por DI. AcessoCustoGuard é resolvido ao ser usado no @UseGuards.
@Module({
  controllers: [ViabilidadeController],
  providers: [ViabilidadeService],
  exports: [ViabilidadeService],
})
export class ViabilidadeModule {}
