import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const dbOk = await this.prisma.isHealthy();
    return {
      status: 'ok',
      service: 'private-studio-backend',
      version: 'v9',
      database: dbOk ? 'connected' : 'unavailable',
      timestamp: new Date().toISOString(),
    };
  }
}
