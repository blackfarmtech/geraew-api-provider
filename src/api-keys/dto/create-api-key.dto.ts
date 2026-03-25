import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateApiKeyDto {
  @ApiPropertyOptional({ example: 'My Integration', default: 'default' })
  @IsString()
  @IsOptional()
  name?: string;
}
