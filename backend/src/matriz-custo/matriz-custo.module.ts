import { Module } from '@nestjs/common';
import { MatrizCustoController } from './matriz-custo.controller';
import { MatrizCustoService } from './matriz-custo.service';
import { MatrizHistoricoService } from './matriz-historico.service';

// PrismaService vem do PrismaModule @Global (nao precisa importar).
// AcessoCustoGuard e resolvido por DI ao ser usado no @UseGuards do controller.
@Module({
  controllers: [MatrizCustoController],
  providers: [MatrizCustoService, MatrizHistoricoService],
  exports: [MatrizCustoService],
})
export class MatrizCustoModule {}
