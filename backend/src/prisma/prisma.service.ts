import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Tenta conectar ao Postgres no boot. Se as credenciais ainda forem
    // placeholder (Dia 1, sem banco KingHost), nao derruba a aplicacao —
    // apenas registra o aviso, para o backend subir e o /api/health responder.
    try {
      await this.$connect();
      this.logger.log('Conectado ao PostgreSQL ✅');
    } catch (err) {
      this.logger.warn(
        'Sem conexao com o PostgreSQL (DATABASE_URL placeholder?). ' +
          'O backend segue de pe; configure o banco da KingHost no .env. ' +
          `Detalhe: ${(err as Error).message}`,
      );
    }
  }

  /** Ping usado pelo health check para reportar status do banco. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
