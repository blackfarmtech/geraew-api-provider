import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCredentialDto } from './dto/create-credential.dto';

@Injectable()
export class CredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const credentials = await this.prisma.googleCredential.findMany({
      orderBy: { name: 'asc' },
    });

    return credentials.map((c) => ({
      id: c.id,
      name: c.name,
      quotaProjectId: c.quotaProjectId,
      active: c.active,
      createdAt: c.createdAt,
    }));
  }

  async create(dto: CreateCredentialDto) {
    return this.prisma.googleCredential.create({ data: dto });
  }

  async remove(id: string) {
    return this.prisma.googleCredential.delete({ where: { id } });
  }
}
