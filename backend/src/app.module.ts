import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AuditModule } from './audit/audit.module';
import { AlertasModule } from './alertas/alertas.module';
import { ClientesModule } from './clientes/clientes.module';
import { MateriasPrimasModule } from './materias-primas/materias-primas.module';
import { EmbalagensModule } from './embalagens/embalagens.module';
import { FormulasModule } from './formulas/formulas.module';
import { OrcamentosModule } from './orcamentos/orcamentos.module';
import { MatchFormulasModule } from './match-formulas/match-formulas.module';
import { AmostrasModule } from './amostras/amostras.module';
import { CotacoesModule } from './cotacoes/cotacoes.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { MatrizCustoModule } from './matriz-custo/matriz-custo.module';
import { PendenciasLabModule } from './pendencias-lab/pendencias-lab.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Serve o build do frontend (Vite) e faz fallback de SPA para o index.html.
    // exclude '/api/...' garante que a API nao seja engolida pelo catch-all do SPA.
    // rootPath via __dirname (backend/dist) -> ../../frontend/dist, independente do cwd.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'frontend', 'dist'),
      exclude: ['/api/{*splat}'],
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ClientesModule,
    AlertasModule,
    MateriasPrimasModule,
    EmbalagensModule,
    FormulasModule,
    OrcamentosModule,
    MatchFormulasModule,
    AmostrasModule,
    CotacoesModule,
    SystemConfigModule,
    MatrizCustoModule,
    PendenciasLabModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
