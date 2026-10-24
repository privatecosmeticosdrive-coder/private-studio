import { Module } from '@nestjs/common';
import { OrcamentosService } from './orcamentos.service';
import { OrcamentosController } from './orcamentos.controller';
import { CalculoService } from './calculo.service';
import { FormatacaoService } from './formatacao.service';
import { PdfService } from './pdf.service';
import { PendenciasLabModule } from '../pendencias-lab/pendencias-lab.module';
import { AlertasModule } from '../alertas/alertas.module';

// FASE 3: o gatilho "recusado por fórmula" cria pendência de revisão no lab.
// Import DIRETO (sem forwardRef): acíclico — PendenciasLabModule importa só
// FormulasModule e lê orçamento via Prisma, nunca via OrcamentosService.
// FAC (10/26): AlertasModule avisa o laboratório dos ajustes do comercial.
@Module({
  imports: [PendenciasLabModule, AlertasModule],
  controllers: [OrcamentosController],
  providers: [OrcamentosService, CalculoService, FormatacaoService, PdfService],
  exports: [OrcamentosService],
})
export class OrcamentosModule {}
