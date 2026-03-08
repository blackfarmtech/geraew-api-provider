import { Global, Module } from '@nestjs/common';
import { VertexService } from './vertex.service';

@Global()
@Module({
  providers: [VertexService],
  exports: [VertexService],
})
export class VertexModule {}
