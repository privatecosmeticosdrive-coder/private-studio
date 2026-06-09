import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { FormulasModule } from './formulas/formulas.module';
import { OrcamentosModule } from './orcamentos/orcamentos.module';
import { SystemConfigModule } from './system-config/system-config.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ClientesModule,
    AlertasModule,
    MateriasPrimasModule,
    FormulasModule,
    OrcamentosModule,
    SystemConfigModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
