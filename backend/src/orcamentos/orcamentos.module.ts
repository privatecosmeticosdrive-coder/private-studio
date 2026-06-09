import { Module } from '@nestjs/common';
import { OrcamentosService } from './orcamentos.service';
import { OrcamentosController } from './orcamentos.controller';
import { CalculoService } from './calculo.service';

@Module({
  controllers: [OrcamentosController],
  providers: [OrcamentosService, CalculoService],
  exports: [OrcamentosService],
})
export class OrcamentosModule {}
