import { Module } from '@nestjs/common';
import { FormulasModule } from '../formulas/formulas.module';
import { PendenciasLabController } from './pendencias-lab.controller';
import { PendenciasLabService } from './pendencias-lab.service';

// PrismaService vem do PrismaModule @Global. Guards resolvidos por DI.
// FormulasModule: o atender cria/versiona a fórmula vinculada (correção A).
@Module({
  imports: [FormulasModule],
  controllers: [PendenciasLabController],
  providers: [PendenciasLabService],
  exports: [PendenciasLabService],
})
export class PendenciasLabModule {}
