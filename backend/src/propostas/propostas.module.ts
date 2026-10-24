import { Module } from '@nestjs/common';
import { AlertasModule } from '../alertas/alertas.module';
import { PropostasController } from './propostas.controller';
import { PropostasService } from './propostas.service';
import { PropostaPdfService } from './proposta-pdf.service';

@Module({
  imports: [AlertasModule],
  controllers: [PropostasController],
  providers: [PropostasService, PropostaPdfService],
})
export class PropostasModule {}
