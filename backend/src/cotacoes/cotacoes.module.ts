import { Module } from '@nestjs/common';
import { CotacoesService } from './cotacoes.service';
import { CotacoesController } from './cotacoes.controller';
import { AlertasModule } from '../alertas/alertas.module';

@Module({
  imports: [AlertasModule],
  controllers: [CotacoesController],
  providers: [CotacoesService],
  exports: [CotacoesService],
})
export class CotacoesModule {}
